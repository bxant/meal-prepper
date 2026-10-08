# Price data

Expected prices (the Plan tab's budget total and the Stores tab's trip total)
come from a small table of **US average retail prices** bundled with the app
(`lib/prices/averagePrices.ts`). There are no network calls; the table ships
inside the app. They are averages, not quotes: no store's own prices are used
for totals or comparisons.

## Sources and licence

- **BLS Average Price Data**, U.S. Bureau of Labor Statistics, Consumer Price
  Index program: series `APU0000xxxxxx`, "U.S. city average, average price, not
  seasonally adjusted". Each entry is the mean of the latest 12 monthly values
  (a missing month is skipped). Check any entry at
  `https://data.bls.gov/timeseries/<ref>`.
- **Fruit and Vegetable Prices**, USDA Economic Research Service: the "all
  fruits" and "all vegetables" average-price CSV files (2023 data, Circana
  retail scanner data), <https://www.ers.usda.gov/data-products/fruit-and-vegetable-prices>.
  Only rows priced per pound are used.
- **Licence:** both are works of the U.S. Government and in the public domain
  (17 U.S.C. § 105). BLS asks to be cited as the source; ERS likewise.

Each table entry keeps its source, the source's item description, its `ref`
(BLS series id or ERS item/form), and the period it covers.

## What's in the table

About 80 foods, keyed by the nutrition table's food ids
(`lib/nutrition/referenceFoods.ts`), each with a price in cents per kilogram
of the food as bought. BLS is used where it has a current series; ERS fills in
produce, canned beans and dried fruit.

A few foods borrow a close item's price because the source has no exact match.
These are marked with comments in `MAP` in `scripts/build-price-table.mjs`:
bread and whole-wheat flour use all-purpose flour; short-grain and brown rice
use long-grain white rice; egg noodles use spaghetti/macaroni; pork loin uses
boneless pork chops; chicken thighs and drumsticks use bone-in chicken legs;
Monterey Jack and Mexican-blend cheese use cheddar; Greek yogurt uses all
yogurt; brown and powdered sugar use white sugar.

Foods with no average price (most spices, oils, sauces) are left out on
purpose. The app shows them as "no average price" rather than guessing.

## How an estimate is made

1. **Match.** The shopping-list line is matched to a food with the nutrition
   table's name matching ("Roma tomatoes" → tomato).
2. **Weigh.** The amount is converted to grams with the nutrition table's
   units, densities and piece weights (2 lb, 1 cup, 3 eggs, 1 can).
3. **Price.** grams × the average price per gram.

So the estimate is the average cost of **the amount the recipes use**, not of a
whole package. A line that can't be matched, priced or weighed ("a pinch",
"1 handful") has no estimate and is counted separately on screen.

## Regenerating

`averagePrices.ts` is generated, so don't edit it by hand. To add a food,
edit `MAP` (and `BLS` for a new series) in `scripts/build-price-table.mjs`.
Then, in an empty directory:

1. Save BLS Public Data API v1 responses (no key needed; at most 25 series per
   request) as `bls1.json`, `bls2.json`, …:

   ```sh
   curl -X POST -H 'Content-Type: application/json' \
     -d '{"seriesid":["APU0000701111","APU0000708111"],"startyear":"2024","endyear":"2026"}' \
     -o bls1.json https://api.bls.gov/publicAPI/v1/timeseries/data/
   ```

2. Download `all-fruits-average-prices-csv-format.csv` and
   `all-vegetables-average-prices-csv-format.csv` from the ERS page above.
3. Run:

   ```sh
   node scripts/build-price-table.mjs path/to/that/directory
   ```

The script only reads local files.

## Swapping in a better source

Planning and trips depend only on the `PriceEstimator` signature in
`lib/planner.ts` (a shopping-list line → cents or `null`).
`averagePriceEstimator` (`lib/prices/estimate.ts`) is one implementation; a
regional table or a price source whose terms allow comparing stores can
implement the same signature.
