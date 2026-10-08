# Meal Prepper

Personal meal-prepper mobile app (Expo / React Native, Android + iPhone): turn
recipes (entered by form or photo) into shopping lists, find the nearest
low-cost grocery stores, and compare prices with Walmart as the baseline.
Local-first: recipes, shopping lists, and everything else stay on-device. The
one exception is the nearby-store lookup described under **Privacy**.

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

## Privacy

No accounts, no analytics, no telemetry. Recipes and shopping lists live only
in the on-device SQLite database and never leave the phone.

The only network request the app makes is the nearby-store lookup on the
Stores & Prices tab: when you open it (or pull to refresh) with location
permission granted, the app sends your location **rounded to about 1 km**
(two decimal places) to OpenStreetMap's public Overpass API
(`overpass-api.de`, falling back to `overpass.kumi.systems`) to fetch grocery
stores within ~5 miles. Your precise location is used only on the phone to
compute distances and is never sent or stored. Nothing else — no recipes, no
lists, no identifiers — is included in that request.

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
