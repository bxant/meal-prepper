#!/usr/bin/env node
/**
 * Regenerates `lib/prices/averagePrices.ts` from locally downloaded copies of
 * two public-domain US government datasets (see docs/price-data.md):
 *
 *   - BLS Average Price Data (series APU0000xxxxxx, U.S. city average), as the
 *     JSON responses of the BLS Public Data API v1, saved as `bls*.json`;
 *   - USDA ERS Fruit and Vegetable Prices, the two "all … average prices CSV
 *     format" files.
 *
 *   node scripts/build-price-table.mjs <dir containing bls*.json and the ERS CSVs>
 *
 * Developer tool only: it reads local files, makes no network calls, and is
 * never bundled into the app. Each entry maps one food id from the nutrition
 * table (`lib/nutrition/referenceFoods.ts`) to one source row, so the app can
 * reuse the nutrition name matching and gram conversion.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const GRAMS_PER_LB = 453.592;
const ML_PER_GALLON = 3785.41;

/**
 * BLS series → what one priced unit weighs in grams, plus the series title as
 * published at https://data.bls.gov/timeseries/APU0000<code>.
 */
const BLS = {
  '701111': ['Flour, white, all purpose, per lb.', GRAMS_PER_LB],
  '701312': ['Rice, white, long grain, uncooked, per lb.', GRAMS_PER_LB],
  '701322': ['Spaghetti and macaroni, per lb.', GRAMS_PER_LB],
  '702111': ['Bread, white, pan, per lb.', GRAMS_PER_LB],
  '702212': ['Bread, whole wheat, pan, per lb.', GRAMS_PER_LB],
  '703112': ['Ground beef, 100% beef, per lb.', GRAMS_PER_LB],
  '703113': ['Ground beef, lean and extra lean, per lb.', GRAMS_PER_LB],
  '703213': ['Chuck roast, USDA Choice, boneless, per lb.', GRAMS_PER_LB],
  '703613': ['Steak, sirloin, USDA Choice, boneless, per lb.', GRAMS_PER_LB],
  '704111': ['Bacon, sliced, per lb.', GRAMS_PER_LB],
  '704212': ['Chops, boneless, per lb.', GRAMS_PER_LB],
  '704312': ['Ham, boneless, excluding canned, per lb.', GRAMS_PER_LB],
  '706212': ['Chicken legs, bone-in, per lb.', GRAMS_PER_LB],
  FF1101: ['Chicken breast, boneless, per lb.', GRAMS_PER_LB],
  // A dozen large eggs; the nutrition table weighs a large egg at 50 g.
  '708111': ['Eggs, grade A, large, per doz.', 12 * 50],
  // Milk density 1.03 g/ml (USDA SR Legacy, whole milk cup weight).
  '709112': ['Milk, fresh, whole, fortified, per gal.', ML_PER_GALLON * 1.03],
  FJ1101: ['Milk, fresh, low-fat, reduced fat, skim, per gal.', ML_PER_GALLON * 1.03],
  FS1101: ['Butter, stick, per lb.', GRAMS_PER_LB],
  '710212': ['Cheddar cheese, natural, per lb.', GRAMS_PER_LB],
  FJ4101: ['Yogurt, per 8 oz.', 226.8],
  '711211': ['Bananas, per lb.', GRAMS_PER_LB],
  '711311': ['Oranges, Navel, per lb.', GRAMS_PER_LB],
  '711412': ['Lemons, per lb.', GRAMS_PER_LB],
  '711415': ['Strawberries, dry pint, per 12 oz.', 340.2],
  '712112': ['Potatoes, white, per lb.', GRAMS_PER_LB],
  '712211': ['Lettuce, iceberg, per lb.', GRAMS_PER_LB],
  FL2101: ['Lettuce, romaine, per lb.', GRAMS_PER_LB],
  '712311': ['Tomatoes, field grown, per lb.', GRAMS_PER_LB],
  '714221': ['Corn, canned, any style, all sizes, per lb.', GRAMS_PER_LB],
  '715211': ['Sugar, white, all sizes, per lb.', GRAMS_PER_LB],
};

/**
 * Nutrition food id → source. `bls` names a series above; `ers` names a
 * [item, form] row of the ERS fruit or vegetable CSV (all priced per pound).
 * Where the source item is a close stand-in rather than the same food, the
 * comment says so; docs/price-data.md lists these too.
 */
const MAP = {
  'flour-ap': { bls: '701111' },
  'flour-bread': { bls: '701111' }, // all-purpose flour price
  'flour-whole-wheat': { bls: '701111' }, // all-purpose flour price
  'rice-white': { bls: '701312' },
  'rice-short': { bls: '701312' }, // long-grain rice price
  'rice-brown': { bls: '701312' }, // white rice price
  'pasta-dry': { bls: '701322' },
  'egg-noodles': { bls: '701322' }, // spaghetti/macaroni price
  'bread-white': { bls: '702111' },
  'bread-whole-wheat': { bls: '702212' },
  'beef-ground-85': { bls: '703112' },
  'beef-ground-90': { bls: '703113' },
  'beef-ground-93': { bls: '703113' },
  'beef-chuck': { bls: '703213' },
  'beef-sirloin': { bls: '703613' },
  bacon: { bls: '704111' },
  'pork-loin': { bls: '704212' }, // boneless chops
  ham: { bls: '704312' },
  'chicken-breast': { bls: 'FF1101' },
  'chicken-thigh': { bls: '706212' }, // bone-in legs
  'chicken-drumstick': { bls: '706212' },
  egg: { bls: '708111' },
  'milk-whole': { bls: '709112' },
  'milk-2': { bls: 'FJ1101' },
  'milk-skim': { bls: 'FJ1101' },
  butter: { bls: 'FS1101' },
  'butter-unsalted': { bls: 'FS1101' },
  cheddar: { bls: '710212' },
  'monterey-jack': { bls: '710212' }, // cheddar price
  'mexican-cheese': { bls: '710212' }, // cheddar price
  'yogurt-plain': { bls: 'FJ4101' },
  'yogurt-greek': { bls: 'FJ4101' }, // all-yogurt price
  banana: { bls: '711211' },
  orange: { bls: '711311' },
  lemon: { bls: '711412' },
  strawberries: { bls: '711415' },
  potato: { bls: '712112' },
  'potato-russet': { bls: '712112' },
  'lettuce-iceberg': { bls: '712211' },
  'lettuce-romaine': { bls: 'FL2101' },
  tomato: { bls: '712311' },
  corn: { bls: '714221' },
  sugar: { bls: '715211' },
  'brown-sugar': { bls: '715211' }, // white sugar price
  'powdered-sugar': { bls: '715211' }, // white sugar price

  apple: { ers: ['Apples', 'Fresh'] },
  avocado: { ers: ['Avocados', 'Fresh'] },
  blueberries: { ers: ['Blueberries', 'Fresh'] },
  grapes: { ers: ['Grapes', 'Fresh'] },
  pineapple: { ers: ['Pineapple', 'Fresh'] },
  mango: { ers: ['Mangoes', 'Fresh'] },
  peach: { ers: ['Peaches', 'Fresh'] },
  pear: { ers: ['Pears', 'Fresh'] },
  raisins: { ers: ['Grapes (raisins)', 'Dried'] },
  'dried-cranberries': { ers: ['Cranberries', 'Dried'] },
  dates: { ers: ['Dates', 'Dried'] },
  onion: { ers: ['Onions', 'Fresh'] },
  carrot: { ers: ['Carrots, raw whole', 'Fresh'] },
  celery: { ers: ['Celery, trimmed bunches', 'Fresh'] },
  'bell-pepper-green': { ers: ['Green peppers', 'Fresh'] },
  'bell-pepper-red': { ers: ['Red peppers', 'Fresh'] },
  broccoli: { ers: ['Broccoli heads', 'Fresh'] },
  cauliflower: { ers: ['Cauliflower heads', 'Fresh'] },
  spinach: { ers: ['Spinach, eaten raw', 'Fresh'] },
  'spinach-frozen': { ers: ['Spinach', 'Frozen'] },
  kale: { ers: ['Kale', 'Fresh'] },
  cabbage: { ers: ['Cabbage, green', 'Fresh'] },
  cucumber: { ers: ['Cucumbers with peel', 'Fresh'] },
  zucchini: { ers: ['Zucchini', 'Fresh'] },
  'butternut-squash': { ers: ['Butternut squash', 'Fresh'] },
  'pumpkin-canned': { ers: ['Pumpkin', 'Canned'] },
  mushrooms: { ers: ['Mushrooms, whole', 'Fresh'] },
  'green-beans': { ers: ['Green beans', 'Fresh'] },
  asparagus: { ers: ['Asparagus', 'Fresh'] },
  peas: { ers: ['Green peas', 'Frozen'] },
  'sweet-potato': { ers: ['Sweet potatoes', 'Fresh'] },
  'tomato-canned': { ers: ['Tomatoes', 'Canned'] },
  olives: { ers: ['Olives', 'Canned'] },
  lentils: { ers: ['Lentils', 'Dried'] },
  'black-beans': { ers: ['Black beans', 'Canned'] },
  'kidney-beans': { ers: ['Kidney beans', 'Canned'] },
  'pinto-beans': { ers: ['Pinto beans', 'Canned'] },
  'white-beans': { ers: ['Great northern beans', 'Canned'] },
};

/** ERS Fruit and Vegetable Prices: the current CSVs carry 2023 data. */
const ERS_YEAR = '2023';
/** Average the latest this-many monthly BLS values. */
const BLS_MONTHS = 12;

function parseCsv(text) {
  const rows = [];
  for (const raw of text.replace(/^﻿/, '').split(/\r?\n/)) {
    if (raw.trim() === '') continue;
    const cells = [];
    let cell = '';
    let quoted = false;
    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i];
      if (quoted) {
        if (ch === '"' && raw[i + 1] === '"') {
          cell += '"';
          i++;
        } else if (ch === '"') quoted = false;
        else cell += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === ',') {
        cells.push(cell);
        cell = '';
      } else cell += ch;
    }
    cells.push(cell);
    rows.push(cells.map((c) => c.trim()));
  }
  return rows;
}

function loadBls(dir) {
  const series = new Map();
  for (const file of readdirSync(dir).filter((f) => /^bls.*\.json$/.test(f))) {
    const json = JSON.parse(readFileSync(join(dir, file), 'utf8'));
    for (const s of json.Results.series) {
      const monthly = s.data
        .filter((d) => /^M(0[1-9]|1[0-2])$/.test(d.period) && Number.isFinite(Number(d.value)))
        .sort((a, b) => `${b.year}${b.period}`.localeCompare(`${a.year}${a.period}`))
        .slice(0, BLS_MONTHS);
      if (monthly.length === 0) continue;
      const mean = monthly.reduce((sum, d) => sum + Number(d.value), 0) / monthly.length;
      const label = (d) => `${d.year}-${d.period.slice(1)}`;
      series.set(s.seriesID.replace(/^APU0000/, ''), {
        dollars: mean,
        period: `${label(monthly[monthly.length - 1])} to ${label(monthly[0])}`,
      });
    }
  }
  return series;
}

function loadErs(dir) {
  const rows = new Map();
  for (const file of readdirSync(dir).filter((f) => /^all-.*csv-format\.csv$/.test(f))) {
    const [header, ...body] = parseCsv(readFileSync(join(dir, file), 'utf8'));
    const price = header.indexOf('AverageRetailPrice');
    const unit = header.indexOf('AverageRetailPriceUnitOfMeasure');
    for (const row of body) {
      if (row[unit] !== 'per pound') continue;
      rows.set(`${row[0]}|${row[1]}`, Number(row[price]));
    }
  }
  return rows;
}

function main() {
  const dir = process.argv[2];
  if (!dir) {
    console.error('usage: node scripts/build-price-table.mjs <dir with bls*.json and ERS CSVs>');
    process.exit(1);
  }
  const bls = loadBls(dir);
  const ers = loadErs(dir);
  const entries = [];
  for (const [foodId, source] of Object.entries(MAP)) {
    if (source.bls) {
      const [title, gramsPerUnit] = BLS[source.bls];
      const data = bls.get(source.bls);
      if (!data) throw new Error(`No BLS data for ${source.bls} (${foodId})`);
      entries.push({
        foodId,
        centsPerKg: Math.round((data.dollars * 100 * 1000) / gramsPerUnit),
        source: 'BLS',
        item: title,
        ref: `APU0000${source.bls}`,
        period: data.period,
      });
    } else {
      const [item, form] = source.ers;
      const dollarsPerLb = ers.get(`${item}|${form}`);
      if (!Number.isFinite(dollarsPerLb)) throw new Error(`No ERS row ${item}/${form} (${foodId})`);
      entries.push({
        foodId,
        centsPerKg: Math.round((dollarsPerLb * 100 * 1000) / GRAMS_PER_LB),
        source: 'ERS',
        item: `${item} (${form.toLowerCase()}), per lb.`,
        ref: `${item}/${form}`,
        period: ERS_YEAR,
      });
    }
  }

  const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'lib', 'prices', 'averagePrices.ts');
  const body = entries.map((e) => `  ${JSON.stringify(e)},`).join('\n');
  writeFileSync(
    out,
    `/**
 * GENERATED by scripts/build-price-table.mjs — do not edit by hand.
 *
 * US average retail prices, in cents per kilogram of the food as bought, keyed
 * by nutrition-table food id. Sources (both public domain, U.S. Government
 * works): BLS Average Price Data, U.S. city average (mean of the latest
 * ${BLS_MONTHS} monthly values), and USDA ERS Fruit and Vegetable Prices
 * (${ERS_YEAR}). See docs/price-data.md.
 */
import type { AveragePrice } from './types';

export const AVERAGE_PRICES: readonly AveragePrice[] = [
${body}
];
`
  );
  console.log(`Wrote ${entries.length} prices to ${out}`);
}

main();
