# Meal Prepper

Personal meal-prepper mobile app (Expo / React Native, Android + iPhone): turn
recipes (entered by form or photo) into shopping lists, find the nearest
low-cost grocery stores, and plan one affordable shopping trip with an
expected price. Local-first: recipes, shopping lists, and everything else stay
on-device. The few, opt-in exceptions are listed under **Privacy**.

## Status

Under active development. The build plan lives in the planning report; the app
currently ships milestone **M1**: "recipe in → shopping list out".

- **Recipes tab** — save recipes typed into a form (title, servings, and
  ingredients with quantities and an optional weight in grams), stored in a
  local `expo-sqlite` database. Tap a recipe to see its ingredients.
- **Photo import** — on the new-recipe form, take a photo of a cookbook page or
  pick a saved screenshot; its text is read by OCR.space (your own free API
  key, entered in Settings) and the title, servings, and ingredient list fill
  the form for you to review before saving. Text recognition sits behind a
  small interface (`lib/ocr.ts`) so an on-device engine can replace it.
- **Nutrition estimate** — the recipe screen shows estimated calories,
  protein, carbs, fat, and fiber, both per serving and per 100 g of the mixed
  ingredients. Amounts are converted to grams and looked up in a bundled
  offline table derived from USDA FoodData Central (public domain). Tap an
  ingredient to enter its exact weight or pick the right food. See
  [docs/nutrition-data.md](docs/nutrition-data.md).
- **Shopping tab** — one aggregated, checkable list built from the ingredients
  of all saved recipes; the tab badge shows how many items are left to buy.
- **Plan tab** (leftmost) — household size, meal scope (one meal, two meals, or
  a whole week), and a budget cap scale the chosen recipes into one list with
  an expected total, dropping meals from the end to fit the cap. Settings are
  not saved yet.
- **Expected prices** — US average retail prices (BLS + USDA ERS, public
  domain) bundled offline, applied to the amounts your recipes use. See
  [docs/price-data.md](docs/price-data.md).
- **Stores & Prices tab** — nearby grocery stores from OpenStreetMap, filtered
  by distance (1, 3, 5, 10, or 25 miles) and ordered cheapest price tier first
  (a heuristic from the chain name) or nearest first. Each store card shows
  "your list here: N of M found" where data exists ("availability unknown"
  otherwise) and opens the store in Google Maps. A trip card suggests one
  chained route (you → first store → next nearest) covering your remaining
  items, with what to get where and the expected total; you choose which
  stores to use and it recomputes.
- **Settings** (gear on the Stores tab) — your OCR.space key, optional Kroger
  developer keys for live Kroger-family availability, and a clearly labelled
  sample-availability demo.

## Privacy

No accounts, no analytics, no telemetry. Recipes and shopping lists live only
in the on-device SQLite database and never leave the phone.

The app makes network requests only in these cases:

- **Nearby stores** (Stores & Prices tab): when you open it, pull to refresh,
  or pick a wider distance, with location permission granted, the app sends
  your location **rounded to about 1 km** (two decimal places) and the search
  radius to OpenStreetMap's public Overpass API (`overpass-api.de`, falling
  back to `overpass.kumi.systems`). Your precise location is used only on the
  phone to compute distances and is never sent or stored. Nothing else — no
  recipes, no lists, no identifiers — is included.
- **Photo import** (only when you import a photo): that photo is sent to
  OCR.space with your API key to read its text. Nothing else is attached.
- **Kroger availability** (only if you enter Kroger developer keys): each
  remaining shopping-list ingredient **name** (no quantities or recipes) and a
  Kroger store's rounded position and store id are sent to Kroger's API.
  Results are kept in memory only and Kroger's prices are shown only on that
  Kroger store's card.
- **Google Maps** opens only when you tap "Open in Google Maps" or "Open route";
  the link contains the stores' public coordinates, not your location.

API keys are stored on the phone with `expo-secure-store` and are never
committed or sent anywhere but their own service.

## Run it

```sh
npm install
npx expo start
```

Scan the QR code with **Expo Go** on your Android phone or iPhone.

## Checks

```sh
npm run typecheck   # tsc --noEmit
npm test            # jest (pure-module contracts, mocked network calls)
npx expo export --platform android   # proves the bundle compiles
```

## Project layout

- `app/` — Expo Router routes: `(tabs)/` (Plan, Recipes, Shopping, Stores &
  Prices), `recipe/new.tsx` (form modal with photo import), `recipe/[id].tsx`
  (detail), `settings.tsx`
- `components/` — shared UI; `stores/` holds the store card, trip card, and
  availability hook
- `db/` — `schema.ts` (versioned migrations; add future tables here),
  `recipes.ts`, `shoppingList.ts` (queries)
- `lib/` — pure helpers (`shoppingList.ts` aggregation contract,
  `planner.ts` scaling + budget fitting, `nearbyStores.ts` store query +
  ranking, `storeAvailability.ts` found/not-found/unknown, `tripPlanner.ts`
  store choice + route, `recipeImport.ts` OCR text → recipe, `prices/`
  average prices, `nutrition/`) and the network modules (`overpass.ts`,
  `kroger.ts`, `ocr.ts`)
