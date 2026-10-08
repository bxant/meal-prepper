# Meal Prepper

Personal meal-prepper mobile app (Expo / React Native, Android + iPhone): turn
recipes (entered by form or photo) into shopping lists, find the nearest
low-cost grocery stores, and compare prices with Walmart as the baseline.
Local-first so recipes stay private on-device — nothing leaves the phone.

## Status

Under active development. The build plan lives in the planning report; the app
currently ships milestone **M1**: "recipe in → shopping list out".

- **Recipes tab** — save recipes typed into a form (title, servings, and
  ingredients with quantities and an optional weight in grams), stored in a
  local `expo-sqlite` database. Tap a recipe to see its ingredients.
- **Nutrition estimate** — the recipe screen shows estimated calories,
  protein, carbs, fat, and fiber, both per serving and per 100 g of the mixed
  ingredients. Amounts are converted to grams and looked up in a bundled
  offline table derived from USDA FoodData Central (public domain). Tap an
  ingredient to enter its exact weight or pick the right food. See
  [docs/nutrition-data.md](docs/nutrition-data.md).
- **Shopping list** — one aggregated, checkable list built from the ingredients
  of all saved recipes.
- **Stores & Prices tab** — placeholder; stores, location, and prices come in
  later milestones.

No accounts, no analytics, no network calls: all data stays in the on-device
SQLite database.

## Run it

```sh
npm install
npx expo start
```

Scan the QR code with **Expo Go** on your Android phone or iPhone.

## Checks

```sh
npm run typecheck   # tsc --noEmit
npm test            # jest (shopping-list aggregation, nutrition math, migrations)
npx expo export --platform android   # proves the bundle compiles
```

## Project layout

- `app/` — Expo Router routes: `(tabs)/` (Recipes, Stores & Prices),
  `recipe/new.tsx` (form modal), `recipe/[id].tsx` (detail),
  `shopping-list.tsx`
- `db/` — `schema.ts` (versioned migrations; add future tables here),
  `recipes.ts`, `shoppingList.ts` (queries)
- `lib/` — pure helpers (`shoppingList.ts` aggregation contract, `id.ts`,
  `nutrition/` unit→gram conversion, food matching, and estimate math)
- `scripts/build-nutrition-table.mjs` — regenerates the bundled nutrition
  table from a local USDA SR Legacy download (dev-only, never bundled)
