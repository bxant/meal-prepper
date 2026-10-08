/** Nutrients tracked by the estimate, all in grams except `kcal`. */
export interface NutrientProfile {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
}

/**
 * What the estimator needs to know about one food, independent of where the
 * numbers come from: nutrients per 100 g plus the weights needed to turn
 * kitchen units into grams.
 */
export interface NutritionFood {
  id: string;
  name: string;
  per100g: NutrientProfile;
  /** Grams per millilitre for cups/spoons; null when no volume measure is known. */
  gramsPerMl: number | null;
  /** Grams for one named piece: "large", "medium", "clove", "slice", "piece"… */
  pieces: Readonly<Record<string, number>>;
}

/** A row of the bundled table, with its provenance in USDA FoodData Central. */
export interface ReferenceFood extends NutritionFood {
  fdcId: number;
  usdaDescription: string;
  /** Lowercase phrases an ingredient name is matched against. */
  aliases: readonly string[];
}

/**
 * The lookup the estimator depends on. Today it is backed by the bundled
 * reference table (`bundledNutritionSource`); a precise per-gram source
 * (e.g. a user-scanned label or a fuller database) can implement the same
 * interface and be passed to `estimateRecipeNutrition` instead.
 */
export interface NutritionSource {
  /** Best match for a free-text ingredient name, or null when nothing fits. */
  match(name: string): NutritionFood | null;
  /** Look up a food by the id this source issued (used for manual matches). */
  get(id: string): NutritionFood | null;
  /** Foods whose names/aliases contain the query, best first. */
  search(query: string, limit?: number): NutritionFood[];
}
