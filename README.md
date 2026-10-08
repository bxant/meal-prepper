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
- **Stores & Prices tab** — asks for location permission (foreground only,
  while the app is open) and lists nearby supermarkets and grocery stores from
  OpenStreetMap with name, distance, and address. Stores are ranked by a
  clearly-labelled *estimated* price tier (known discount chains such as Aldi,
  Lidl, Walmart, WinCo, and Food 4 Less first, then standard, unrated, and
  premium chains), then by distance. There is no real price data yet; the tier
  list lives in `lib/storeTiers.ts` so prices (Walmart as the baseline) can
  replace it later. Results are kept in memory only.

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
npm test            # jest (shopping-list aggregation, store ranking/distance)
npx expo export --platform android   # proves the bundle compiles
```

## Project layout

- `app/` — Expo Router routes: `(tabs)/` (Recipes, Stores & Prices),
  `recipe/new.tsx` (form modal), `recipe/[id].tsx` (detail),
  `shopping-list.tsx`
- `db/` — `schema.ts` (versioned migrations; add future tables here),
  `recipes.ts`, `shoppingList.ts` (queries)
- `lib/` — pure helpers (`shoppingList.ts` aggregation contract, `id.ts`,
  `geo.ts` distance/coarsening, `storeTiers.ts` affordability tiers,
  `nearbyStores.ts` Overpass query/parse/rank) and `overpass.ts`, the app's
  only network call
