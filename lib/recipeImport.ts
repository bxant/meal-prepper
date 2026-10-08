/**
 * Pure: turn text recognised from a recipe photo or screenshot into a draft
 * recipe (title, servings, ingredient rows) for the user to review in the
 * new-recipe form before anything is saved.
 *
 * Heuristic by design — OCR text is messy and layouts vary — so it aims to
 * get most rows right and never drops a likely ingredient silently: lines it
 * reads as ingredients come back as rows the user can fix or remove.
 */

export interface ImportedIngredient {
  name: string;
  /** Decimal text the form's `parseQuantity` accepts ("1.5"), or free text, or ''. */
  quantity: string;
  unit: string;
}

export interface ImportedRecipe {
  title: string | null;
  servings: number | null;
  ingredients: ImportedIngredient[];
}

const UNICODE_FRACTIONS: Record<string, string> = {
  '½': '1/2', '⅓': '1/3', '⅔': '2/3', '¼': '1/4', '¾': '3/4', '⅕': '1/5', '⅖': '2/5',
  '⅗': '3/5', '⅘': '4/5', '⅙': '1/6', '⅚': '5/6', '⅛': '1/8', '⅜': '3/8', '⅝': '5/8', '⅞': '7/8',
};

/** Units the form understands; matched case-insensitively, with or without a trailing ".". */
const UNITS = new Set([
  'cup', 'cups', 'c', 'tablespoon', 'tablespoons', 'tbsp', 'tbs', 'tbl', 'tbsps', 'teaspoon',
  'teaspoons', 'tsp', 'tsps', 'oz', 'ounce', 'ounces', 'fl oz', 'lb', 'lbs', 'pound', 'pounds',
  'g', 'gram', 'grams', 'kg', 'kilogram', 'kilograms', 'ml', 'milliliter', 'milliliters',
  'millilitre', 'millilitres', 'l', 'liter', 'liters', 'litre', 'litres', 'pint', 'pints', 'quart',
  'quarts', 'gallon', 'gallons', 'clove', 'cloves', 'can', 'cans', 'jar', 'jars', 'package',
  'packages', 'pkg', 'packet', 'packets', 'pinch', 'pinches', 'dash', 'dashes', 'slice', 'slices',
  'stick', 'sticks', 'bunch', 'bunches', 'head', 'heads', 'sprig', 'sprigs', 'piece', 'pieces',
  'large', 'medium', 'small', 'handful', 'handfuls', 'bag', 'bags', 'bottle', 'bottles', 'box',
  'boxes', 'container', 'containers', 'stalk', 'stalks', 'fillet', 'fillets', 'leaf', 'leaves',
]);
/** Cookbook shorthand where case matters. */
const CASE_SENSITIVE_UNITS = new Set(['T', 't']);

const INGREDIENTS_HEADING = /^\W*ingredients?\b\W*$/i;
const END_HEADING =
  /^\W*(instructions?|directions?|method|steps?|preparation|how to make( it)?|to make|notes?|nutrition( facts)?|equipment)\b.*$/i;
const SERVINGS = /\b(?:serves|servings?|yield|yields|makes)\b\D{0,12}(\d{1,3})/i;
const NOISE =
  /(https?:\/\/|www\.|@\w|#\w|\b(prep|cook|total|active)\s*time\b|\b(min|mins|minutes|hours?)\b|\blikes?\b|\bcomments?\b|\bfollow\b|\bshare\b|\bsave\b|\breply\b)/i;

/** Replace unicode fractions ("1½", "½") with ASCII ("1 1/2", "1/2"). */
export function normalizeFractions(text: string): string {
  return text
    .replace(/(\d)\s*([½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])/g, (_, whole: string, frac: string) => `${whole} ${UNICODE_FRACTIONS[frac]}`)
    .replace(/[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]/g, (frac) => UNICODE_FRACTIONS[frac]);
}

function fractionValue(text: string): number | null {
  const parts = text.trim().split(/\s+/);
  let total = 0;
  for (const part of parts) {
    const fraction = /^(\d+)\/(\d+)$/.exec(part);
    if (fraction) {
      if (Number(fraction[2]) === 0) return null;
      total += Number(fraction[1]) / Number(fraction[2]);
    } else if (/^\d+(\.\d+)?$/.test(part)) {
      total += Number(part);
    } else {
      return null;
    }
  }
  return total;
}

/** "1 1/2" → "1.5", "1/3" → "0.333", "2" → "2". */
function decimalText(quantity: string): string {
  const value = fractionValue(quantity);
  if (value === null) return quantity;
  return String(Math.round(value * 1000) / 1000);
}

const QUANTITY = /^(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)(?:\s*(?:-|–|to)\s*(?:\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?))?/;

/** Strip list bullets, checkboxes, and leading/trailing punctuation noise. */
function cleanLine(line: string): string {
  return normalizeFractions(line)
    .replace(/^[\s•·●○▪▫■□▢☐☑✓✔*\-–—>]+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Parse one ingredient line, or null when it doesn't read as one. */
export function parseIngredientLine(raw: string): ImportedIngredient | null {
  const line = cleanLine(raw);
  if (!/[a-z]/i.test(line) || line.length > 90) return null;

  let rest = line;
  let quantity = '';
  const q = QUANTITY.exec(rest);
  if (q) {
    // For a range ("2-3 cloves") use the first amount.
    quantity = decimalText(q[1]);
    rest = rest.slice(q[0].length).trim();
  } else {
    const word = /^(a|an|one)\s+/i.exec(rest);
    if (word) {
      quantity = '1';
      rest = rest.slice(word[0].length);
    }
  }

  // "1 (15 oz) can beans": drop the package-size note.
  rest = rest.replace(/^\([^)]*\)\s*/, '');

  let unit = '';
  const unitMatch = /^(fl\.?\s*oz|[a-z]+)\.?(?=\s|$)/i.exec(rest);
  if (unitMatch && quantity !== '') {
    const word = unitMatch[1];
    if (UNITS.has(word.toLowerCase().replace(/\.\s*/, ' ')) || CASE_SENSITIVE_UNITS.has(word)) {
      unit = word.replace(/\.$/, '');
      rest = rest.slice(unitMatch[0].length).trim();
    }
  }

  let name = rest
    .replace(/^of\s+/i, '')
    .replace(/\([^)]*\)/g, ' ')
    // Preparation notes after a comma ("onion, diced") stay out of the name.
    .replace(/,.*$/, '')
    .replace(/\b(to taste|as needed|optional|for serving|for garnish)\b.*$/i, '')
    .replace(/\s+/g, ' ')
    .replace(/[\s.;:]+$/, '')
    .trim();
  if (!/[a-z]{2}/i.test(name)) return null;
  name = name.charAt(0).toUpperCase() + name.slice(1);
  return { name, quantity, unit };
}

/** An amount followed by words ("2 cups flour", "a pinch of salt"), not "9:41" or "12.3k". */
function looksLikeIngredient(line: string): boolean {
  const cleaned = cleanLine(line);
  const amount = QUANTITY.exec(cleaned)?.[0] ?? /^(a|an|one)\b/i.exec(cleaned)?.[0];
  return amount !== undefined && /^\s+(\([^)]*\)\s*)?[a-z]/i.test(cleaned.slice(amount.length));
}

function isTitleCandidate(line: string): boolean {
  const cleaned = cleanLine(line);
  return (
    cleaned.length >= 3 &&
    cleaned.length <= 60 &&
    /[a-z]{3}/i.test(cleaned) &&
    !NOISE.test(cleaned) &&
    !SERVINGS.test(cleaned) &&
    !INGREDIENTS_HEADING.test(cleaned) &&
    !END_HEADING.test(cleaned) &&
    !looksLikeIngredient(cleaned)
  );
}

export function parseRecipeText(text: string): ImportedRecipe {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '');

  const servingsMatch = lines.map((line) => SERVINGS.exec(line)).find(Boolean);
  const servings = servingsMatch ? Number(servingsMatch[1]) : null;

  const headingIndex = lines.findIndex((line) => INGREDIENTS_HEADING.test(cleanLine(line)));
  let section: string[];
  let beforeSection: string[];
  if (headingIndex >= 0) {
    beforeSection = lines.slice(0, headingIndex);
    const after = lines.slice(headingIndex + 1);
    const end = after.findIndex((line) => END_HEADING.test(cleanLine(line)));
    section = end >= 0 ? after.slice(0, end) : after;
  } else {
    // No heading: take quantity-led lines before any method heading.
    const end = lines.findIndex((line) => END_HEADING.test(cleanLine(line)));
    const body = end >= 0 ? lines.slice(0, end) : lines;
    const first = body.findIndex(looksLikeIngredient);
    beforeSection = first >= 0 ? body.slice(0, first) : body;
    section = first >= 0 ? body.slice(first).filter(looksLikeIngredient) : [];
  }

  const ingredients = section
    // Skip servings lines, social-media chrome, and sub-headings ("For the sauce:").
    .filter((line) => !SERVINGS.test(line) && !NOISE.test(line) && !/:\s*$/.test(line))
    .map(parseIngredientLine)
    .filter((row): row is ImportedIngredient => row !== null);

  const titleLine = beforeSection.find(isTitleCandidate);
  return { title: titleLine ? cleanLine(titleLine) : null, servings, ingredients };
}
