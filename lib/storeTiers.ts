/**
 * Heuristic affordability tiers for grocery chains.
 *
 * There is no price data yet, so stores are ranked by a hand-maintained guess
 * of how cheap each chain usually is. This is the ONE place that guess lives:
 * when real prices arrive (Walmart as the baseline), replace `tierForStore`
 * with a price-based ranking and delete these lists.
 */

export type PriceTier = 'discount' | 'standard' | 'unrated' | 'premium';

/** Lower rank = shown first. Unknown/independent stores sit between standard and premium. */
export const TIER_RANK: Record<PriceTier, number> = {
  discount: 0,
  standard: 1,
  unrated: 2,
  premium: 3,
};

export const TIER_LABEL: Record<PriceTier, string> = {
  discount: 'Discount chain',
  standard: 'Standard chain',
  unrated: 'Not rated',
  premium: 'Premium chain',
};

/** Chain names (and common spellings) per tier; matched as whole words after normalization. */
const CHAINS: Record<Exclude<PriceTier, 'unrated'>, string[]> = {
  discount: [
    'Aldi',
    'Lidl',
    'Walmart',
    'WinCo',
    'Food 4 Less',
    'Food4Less',
    'Grocery Outlet',
    'Save A Lot',
    'Save-A-Lot',
    'FoodMaxx',
    'Smart & Final',
    'Price Rite',
    'Market Basket',
  ],
  standard: [
    'Kroger',
    'Safeway',
    'Albertsons',
    'Ralphs',
    'Vons',
    'Publix',
    'H-E-B',
    'HEB',
    'Meijer',
    'Fred Meyer',
    'Stop & Shop',
    'Giant',
    'Food Lion',
    'Hy-Vee',
    'Target',
    "Trader Joe's",
    'Wegmans',
    'Stater Bros',
    'Winn-Dixie',
    'Harris Teeter',
    'Jewel-Osco',
    'Smith\'s',
    'King Soopers',
    'QFC',
  ],
  premium: [
    'Whole Foods',
    'Sprouts',
    'Erewhon',
    'The Fresh Market',
    'Bristol Farms',
    "Gelson's",
    'Mollie Stone\'s',
    'New Seasons',
    'Earth Fare',
  ],
};

/** Lowercase, collapse every non-alphanumeric run to one space, pad for whole-word matching. */
export function normalizeStoreName(name: string): string {
  return ` ${name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;
}

const MATCHERS: { tier: PriceTier; pattern: string }[] = (
  ['discount', 'standard', 'premium'] as const
).flatMap((tier) => CHAINS[tier].map((chain) => ({ tier, pattern: normalizeStoreName(chain) })));

/** Classify a store by its OSM `brand` tag first, then its display name. */
export function tierForStore(name: string, brand?: string | null): PriceTier {
  for (const candidate of [brand, name]) {
    if (!candidate) continue;
    const normalized = normalizeStoreName(candidate);
    const match = MATCHERS.find((m) => normalized.includes(m.pattern));
    if (match) return match.tier;
  }
  return 'unrated';
}
