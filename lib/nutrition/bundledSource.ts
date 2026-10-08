import { REFERENCE_FOODS } from './referenceFoods';
import type { NutritionSource, ReferenceFood } from './types';

/**
 * Offline `NutritionSource` backed by the bundled USDA-derived table.
 *
 * Matching is phrase-based: an ingredient name matches an alias when the
 * alias's words appear consecutively in the name ("2 boneless chicken
 * breasts" → "chicken breast"). The alias with the most words wins, then the
 * longest, then table order — so "brown sugar" beats "sugar" and
 * "peanut butter" beats "butter".
 */

/** Lowercase, strip accents and punctuation, and reduce simple plurals so "Tomatoes," ≈ "tomato". */
export function nameTokens(text: string): string[] {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/%/g, ' percent ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter((token) => token !== '')
    .map(stem);
}

function stem(word: string): string {
  if (word.length <= 3 || word.endsWith('ss')) return word;
  if (word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (word.endsWith('oes')) return word.slice(0, -2);
  if (word.endsWith('s')) return word.slice(0, -1);
  return word;
}

function containsPhrase(haystack: string[], needle: string[]): boolean {
  if (needle.length === 0 || needle.length > haystack.length) return false;
  for (let start = 0; start + needle.length <= haystack.length; start += 1) {
    let all = true;
    for (let offset = 0; offset < needle.length; offset += 1) {
      if (haystack[start + offset] !== needle[offset]) {
        all = false;
        break;
      }
    }
    if (all) return true;
  }
  return false;
}

interface IndexedAlias {
  food: ReferenceFood;
  tokens: string[];
  length: number;
  order: number;
}

export function createBundledSource(foods: readonly ReferenceFood[]): NutritionSource {
  const byId = new Map(foods.map((food) => [food.id, food]));
  const aliases: IndexedAlias[] = [];
  foods.forEach((food, order) => {
    for (const alias of food.aliases) {
      aliases.push({ food, tokens: nameTokens(alias), length: alias.length, order });
    }
  });

  return {
    match(name) {
      const tokens = nameTokens(name);
      let best: IndexedAlias | null = null;
      for (const alias of aliases) {
        if (!containsPhrase(tokens, alias.tokens)) continue;
        if (
          !best ||
          alias.tokens.length > best.tokens.length ||
          (alias.tokens.length === best.tokens.length && alias.length > best.length)
        ) {
          best = alias;
        }
      }
      return best?.food ?? null;
    },

    get(id) {
      return byId.get(id) ?? null;
    },

    search(query, limit = 8) {
      const needle = nameTokens(query).join(' ');
      if (needle === '') return [];
      const scored: { food: ReferenceFood; score: number; order: number }[] = [];
      foods.forEach((food, order) => {
        const haystacks = [food.name, ...food.aliases].map((text) => nameTokens(text).join(' '));
        let score = 0;
        for (const haystack of haystacks) {
          if (haystack === needle) score = Math.max(score, 3);
          else if (haystack.startsWith(needle)) score = Math.max(score, 2);
          else if (haystack.includes(needle)) score = Math.max(score, 1);
        }
        if (score > 0) scored.push({ food, score, order });
      });
      scored.sort((a, b) => b.score - a.score || a.order - b.order);
      return scored.slice(0, limit).map((entry) => entry.food);
    },
  };
}

/** The default source used by the app: the bundled offline reference table. */
export const bundledNutritionSource: NutritionSource = createBundledSource(REFERENCE_FOODS);
