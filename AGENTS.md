# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

- Add durable project-specific notes here as they are discovered through real work.

## Verify before shipping

- `npm run typecheck` (tsc --noEmit), `npm test` (jest, pure-module contract tests), `npx expo export --platform android` (bundle compiles).
- The Expo template ships **no lint script/config** — don't go looking for `npm run lint`.
- This template uses TypeScript 6, which does **not** auto-include `node_modules/@types`: any new `@types/*` package must be listed in `tsconfig.json` `compilerOptions.types` or its globals won't typecheck.

## Architecture notes

- DB schema lives in `db/schema.ts` as append-only numbered migrations (`PRAGMA user_version`); later milestones (stores/products/prices tables) add versions there, never edit applied ones.
- The recipe→shopping-list merge contract is the pure module `lib/shoppingList.ts` (shared `shoppingListKey` between aggregation and `shopping_list_items` rows); keep it dependency-free and covered by `__tests__/`.
- Privacy boundary is product-mandated: on-device `expo-sqlite` only — no accounts, analytics, or telemetry. The sole sanctioned network egress is `lib/overpass.ts` (store lookup sending a ~1 km-rounded location via `lib/geo.ts` `coarsen`); any new egress needs a product decision and a README **Privacy** update.
- Overpass (`overpass-api.de`) answers HTTP 406 to generic User-Agents (okhttp, curl); keep the explicit `User-Agent` header in `lib/overpass.ts`. Affordability tiers are a placeholder heuristic confined to `lib/storeTiers.ts`.
- `expo-symbols` name objects: iOS takes SF Symbols (`list.bullet`), Android/web take Material Symbols snake_case (`format_list_bulleted`).

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
