# Nutrition data

The recipe nutrition estimate uses a small reference table bundled with the
app (`lib/nutrition/referenceFoods.ts`). There are no network calls; the table
ships inside the app.

## Source and licence

- **Source:** USDA FoodData Central, *SR Legacy* dataset (April 2018 release),
  U.S. Department of Agriculture, Agricultural Research Service.
  <https://fdc.nal.usda.gov/>
- **Licence:** FoodData Central data is in the public domain under
  [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). USDA asks to be
  cited as: *U.S. Department of Agriculture, Agricultural Research Service.
  FoodData Central, 2019. fdc.nal.usda.gov.*

Each table entry keeps the `fdcId` it came from, so you can check any value at
`https://fdc.nal.usda.gov/food-details/<fdcId>/nutrients`.

## What's in the table

About 230 common ingredients. For each one the table stores:

- energy (kcal), protein, carbohydrate (by difference), fat, and dietary fiber
  per 100 g (FDC nutrient ids 1008, 1003, 1005, 1004, 1079)
- grams per millilitre, taken from the USDA cup, fl oz, or spoon portion weights,
  so cups and spoons can be converted to grams
- piece weights from the USDA portions ("1 large", "1 clove", "1 slice"), so
  counts like "2 eggs" can be converted too

A few densities and piece weights are set by hand when USDA has no usable
portion; those are listed with comments in `OVERRIDES` in
`scripts/build-nutrition-table.mjs`. For example, standard US can net weights,
and "an egg" meaning a large egg.

## Regenerating

`referenceFoods.ts` is generated, so don't edit it by hand. To add a food or an
alias, edit `FOODS` in `scripts/build-nutrition-table.mjs`. Then download and
unzip the SR Legacy CSV release from
<https://fdc.nal.usda.gov/download-datasets> and run:

```sh
node scripts/build-nutrition-table.mjs path/to/FoodData_Central_sr_legacy_food_csv_2018-04
```

The script only reads local files.

## How the estimate works

1. **Match.** Each ingredient name is matched to a food by alias phrase, and the
   most specific alias wins ("brown sugar" before "sugar"). On the recipe
   screen you can tap an ingredient to pick a different food.
2. **Weigh.** The amount is converted to grams:
   - mass units are exact
   - volumes use the food's density (water's density when the food has none,
     and the estimate says so)
   - counts use piece weights
   - a weight you enter in grams always wins
3. **Sum.** grams × nutrients per gram, summed over the counted ingredients.
4. **Divide.** Per serving is the total divided by the recipe's servings.
   Per 100 g is the total divided by the combined raw weight of the counted
   ingredients. That is "per 100 g of the whole meal mixed together", measured
   before cooking.

An ingredient that can't be matched or weighed is left out of every total and
flagged on screen. That includes the per-100 g denominator, so one unknown item
doesn't dilute the rest.

## Swapping in a precise source

The estimator only depends on the `NutritionSource` interface in
`lib/nutrition/types.ts`, which has three methods: `match`, `get`, and
`search`. `bundledNutritionSource` is one implementation of it. A more precise
per-gram source, such as a fuller on-device database or nutrition labels the
user enters, can implement the same interface and be passed to
`estimateRecipeNutrition` with no changes to the math or the screens.
Manually picked foods are stored as `ingredients.nutrition_food_id`. A new
source should either keep the bundled ids or map them to its own.
