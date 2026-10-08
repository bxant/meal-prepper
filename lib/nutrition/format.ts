import type { IngredientEstimate } from './estimate';

/** "240 g", "7.5 g", "1.2 kg". */
export function formatGrams(grams: number): string {
  if (grams >= 1000) return `${round(grams / 1000, 2)} kg`;
  return `${grams < 10 ? round(grams, 1) : Math.round(grams)} g`;
}

export function formatKcal(kcal: number): string {
  return `${Math.round(kcal)}`;
}

/** Macro grams: one decimal below 10 g, whole grams above. */
export function formatMacro(grams: number): string {
  return `${grams < 10 ? round(grams, 1) : Math.round(grams)} g`;
}

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

/** One-line explanation of how an ingredient was counted (or why it wasn't). */
export function describeIngredientEstimate(estimate: IngredientEstimate, unit: string | null): string {
  if (estimate.status === 'no-match') {
    return estimate.grams !== null
      ? `Not counted — no reference food matched (${formatGrams(estimate.grams)})`
      : 'Not counted — no reference food matched';
  }
  const foodName = estimate.food?.name ?? '';
  if (estimate.status === 'no-weight') {
    const unitText = unit?.trim();
    return unitText
      ? `Not counted — can't weigh “${unitText}” of ${foodName}; add grams`
      : `Not counted — add a quantity or grams for ${foodName}`;
  }
  const grams = estimate.grams ?? 0;
  const approx = estimate.gramsMethod === 'entered' || estimate.gramsMethod === 'mass' ? '' : '≈ ';
  const assumed = estimate.gramsMethod === 'volume-assumed-density' ? ' (density assumed)' : '';
  return `${approx}${formatGrams(grams)}${assumed} · ${foodName}`;
}
