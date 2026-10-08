/** One bundled average price, with enough provenance to check it at the source. */
export interface AveragePrice {
  /** Food id from the nutrition table (`lib/nutrition/referenceFoods.ts`). */
  foodId: string;
  /** Average retail price, in cents per kilogram of the food as bought. */
  centsPerKg: number;
  source: 'BLS' | 'ERS';
  /** The source's item description. */
  item: string;
  /** BLS series id, or the ERS "item/form" row. */
  ref: string;
  /** Months averaged (BLS) or data year (ERS). */
  period: string;
}
