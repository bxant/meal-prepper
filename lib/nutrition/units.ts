import type { NutritionFood } from './types';

/**
 * Kitchen units → grams. Pure and dependency-free.
 *
 * - Mass units convert exactly.
 * - Volume units convert through the food's density (g/ml); when the food has
 *   no known density, water's 1 g/ml is assumed and flagged.
 * - Counts ("2 eggs", "1 large onion", "3 cloves") use the food's piece weights.
 */

export type GramsMethod = 'mass' | 'volume' | 'volume-assumed-density' | 'piece';

export interface GramsConversion {
  grams: number;
  method: GramsMethod;
}

type UnitInfo =
  | { kind: 'mass'; gramsPer: number }
  | { kind: 'volume'; mlPer: number }
  | { kind: 'count'; piece: string };

/** Density used for volume units when the food has none (water). */
export const DEFAULT_GRAMS_PER_ML = 1;

const MASS: Record<string, number> = {
  g: 1,
  gr: 1,
  gram: 1,
  gramme: 1,
  mg: 0.001,
  milligram: 0.001,
  kg: 1000,
  kilo: 1000,
  kilogram: 1000,
  oz: 28.3495,
  ounce: 28.3495,
  lb: 453.592,
  pound: 453.592,
};

const VOLUME: Record<string, number> = {
  ml: 1,
  milliliter: 1,
  millilitre: 1,
  cc: 1,
  cl: 10,
  dl: 100,
  l: 1000,
  liter: 1000,
  litre: 1000,
  tsp: 4.92892,
  teaspoon: 4.92892,
  tbsp: 14.7868,
  tbs: 14.7868,
  tbl: 14.7868,
  tablespoon: 14.7868,
  cup: 236.588,
  c: 236.588,
  'fl oz': 29.5735,
  'fluid ounce': 29.5735,
  pint: 473.176,
  pt: 473.176,
  quart: 946.353,
  qt: 946.353,
  gallon: 3785.41,
  gal: 3785.41,
  pinch: 0.31,
  dash: 0.62,
};

/** Generic "one of it" words, resolved to the food's default piece weight. */
const GENERIC_PIECE = new Set(['', 'each', 'ea', 'whole', 'piece', 'pc', 'pcs', 'item', 'unit', 'x']);

const NAMED_PIECES = new Set([
  'large',
  'medium',
  'small',
  'extra large',
  'jumbo',
  'clove',
  'stick',
  'slice',
  'stalk',
  'leaf',
  'sprig',
  'link',
  'strip',
  'fillet',
  'head',
  'ear',
  'can',
  'bunch',
  'wedge',
  'envelope',
]);

const SIZE_ABBREVIATIONS: Record<string, string> = {
  lg: 'large',
  med: 'medium',
  md: 'medium',
  sm: 'small',
  xl: 'extra large',
};

function singular(word: string): string {
  if (word === 'leaves') return 'leaf';
  if (word.endsWith('ches') || word.endsWith('shes')) return word.slice(0, -2);
  if (word.length > 2 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

/** Classify a free-text unit ("Tbsp.", "cups", "lg", null) or null when unknown. */
export function parseUnit(unit: string | null): UnitInfo | null {
  const raw = (unit ?? '').trim();
  // Cookbook shorthand where case matters: "T" = tablespoon, "t" = teaspoon.
  if (raw === 'T') return { kind: 'volume', mlPer: VOLUME.tbsp };
  if (raw === 't') return { kind: 'volume', mlPer: VOLUME.tsp };

  const cleaned = raw.toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ').trim();
  for (const key of [cleaned, singular(cleaned)]) {
    if (MASS[key] !== undefined) return { kind: 'mass', gramsPer: MASS[key] };
    if (VOLUME[key] !== undefined) return { kind: 'volume', mlPer: VOLUME[key] };
    if (GENERIC_PIECE.has(key)) return { kind: 'count', piece: 'piece' };
    if (SIZE_ABBREVIATIONS[key]) return { kind: 'count', piece: SIZE_ABBREVIATIONS[key] };
    if (NAMED_PIECES.has(key)) return { kind: 'count', piece: key };
  }
  return null;
}

/** Weight of "one" when no size is given: a whole piece, then medium, large, small. */
export function defaultPieceGrams(food: NutritionFood): number | null {
  const { pieces } = food;
  for (const name of ['piece', 'medium', 'large', 'small']) {
    if (pieces[name] !== undefined) return pieces[name];
  }
  return null;
}

/**
 * Convert an ingredient amount to grams for the given food.
 * Returns null when the amount or unit cannot be turned into a weight.
 */
export function toGrams(
  quantity: number | null,
  unit: string | null,
  food: NutritionFood | null
): GramsConversion | null {
  if (quantity === null || !Number.isFinite(quantity) || quantity < 0) return null;
  const info = parseUnit(unit);
  if (!info) return null;

  if (info.kind === 'mass') {
    return { grams: quantity * info.gramsPer, method: 'mass' };
  }

  if (!food) return null;

  if (info.kind === 'volume') {
    if (food.gramsPerMl !== null) {
      return { grams: quantity * info.mlPer * food.gramsPerMl, method: 'volume' };
    }
    return { grams: quantity * info.mlPer * DEFAULT_GRAMS_PER_ML, method: 'volume-assumed-density' };
  }

  const named = info.piece === 'piece' ? undefined : food.pieces[info.piece];
  if (named !== undefined) return { grams: quantity * named, method: 'piece' };
  // A size word with no exact entry ("1 jumbo carrot") or a bare count falls back to the default piece.
  const isSize = ['large', 'medium', 'small', 'extra large', 'jumbo'].includes(info.piece);
  if (info.piece === 'piece' || isSize) {
    const fallback = defaultPieceGrams(food);
    if (fallback !== null) return { grams: quantity * fallback, method: 'piece' };
  }
  return null;
}
