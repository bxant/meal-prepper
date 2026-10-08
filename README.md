# Meal Prepper

Personal meal-prepper mobile app (Expo / React Native, Android + iPhone): turn
recipes (entered by form or photo) into shopping lists, find the nearest
low-cost grocery stores, and compare prices with Walmart as the baseline.
Local-first so recipes stay private on-device — nothing leaves the phone.

## Status

Under active development. The build plan lives in the planning report; the app
currently ships milestone **M1**: "recipe in → shopping list out".

- **Recipes tab** — save recipes typed into a form (title + ingredients with
  quantities), stored in a local `expo-sqlite` database. Tap a recipe to see
  its ingredients.
- **Shopping list** — one aggregated, checkable list built from the ingredients
  of all saved recipes.
- **Plan tab** — placeholder planning panel: household size, meal scope (one
  meal, two meals, or a whole week), and a budget cap scale the chosen recipes
  into one list with an estimated total, dropping meals from the end to fit the
  cap. Prices are a rough placeholder estimate; settings are not saved yet.
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
npm test            # jest (pure shopping-list and planner contracts)
npx expo export --platform android   # proves the bundle compiles
```

## Project layout

- `app/` — Expo Router routes: `(tabs)/` (Recipes, Plan, Stores & Prices),
  `recipe/new.tsx` (form modal), `recipe/[id].tsx` (detail),
  `shopping-list.tsx`
- `db/` — `schema.ts` (versioned migrations; add future tables here),
  `recipes.ts`, `shoppingList.ts` (queries)
- `lib/` — pure helpers (`shoppingList.ts` aggregation contract,
  `planner.ts` scaling + budget fitting, `id.ts`)
