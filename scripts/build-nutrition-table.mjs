#!/usr/bin/env node
/**
 * Regenerates `lib/nutrition/referenceFoods.ts` from a locally downloaded copy
 * of the USDA FoodData Central "SR Legacy" CSV dataset (public domain, CC0).
 *
 *   1. Download and unzip the SR Legacy CSV release from
 *      https://fdc.nal.usda.gov/download-datasets (FoodData_Central_sr_legacy_food_csv_*.zip)
 *   2. node scripts/build-nutrition-table.mjs <path/to/unzipped/csv/dir>
 *
 * This is a developer tool only: it reads local files, makes no network calls,
 * and is never bundled into the app. Each curated entry below names the SR
 * Legacy `fdc_id` it is derived from, so every number in the generated table can
 * be checked against https://fdc.nal.usda.gov/food-details/<fdcId>/nutrients.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Curated common ingredients: [id, fdcId, display name, aliases].
 * Aliases are lowercase phrases matched against ingredient names; the longest
 * matching alias wins, so "brown sugar" beats "sugar".
 */
const FOODS = [
  // Eggs & dairy
  ['egg', 171287, 'Egg, whole, raw', ['egg', 'whole egg', 'large egg']],
  ['egg-white', 172183, 'Egg white, raw', ['egg white']],
  ['egg-yolk', 172184, 'Egg yolk, raw', ['egg yolk', 'yolk']],
  ['butter', 173410, 'Butter, salted', ['butter', 'salted butter']],
  ['butter-unsalted', 173430, 'Butter, unsalted', ['unsalted butter']],
  ['milk-whole', 171265, 'Milk, whole (3.25%)', ['milk', 'whole milk']],
  ['milk-2', 171267, 'Milk, reduced fat (2%)', ['2% milk', 'reduced fat milk', 'low fat milk', 'lowfat milk']],
  ['milk-skim', 171269, 'Milk, nonfat (skim)', ['skim milk', 'nonfat milk', 'fat free milk']],
  ['buttermilk', 167697, 'Buttermilk, reduced fat', ['buttermilk']],
  ['heavy-cream', 170859, 'Cream, heavy whipping', ['heavy cream', 'whipping cream', 'heavy whipping cream', 'cream']],
  ['half-and-half', 171255, 'Half and half', ['half and half', 'half & half']],
  ['sour-cream', 171257, 'Sour cream', ['sour cream']],
  ['cream-cheese', 173418, 'Cream cheese', ['cream cheese']],
  ['yogurt-plain', 171284, 'Yogurt, plain, whole milk', ['yogurt', 'yoghurt', 'plain yogurt']],
  ['yogurt-greek', 170903, 'Greek yogurt, plain, low fat', ['greek yogurt', 'greek yoghurt']],
  ['cheddar', 173414, 'Cheese, cheddar', ['cheddar', 'cheddar cheese', 'cheese']],
  ['mozzarella', 170845, 'Cheese, mozzarella, whole milk', ['mozzarella', 'mozzarella cheese']],
  ['mozzarella-part-skim', 170847, 'Cheese, mozzarella, part skim', ['part skim mozzarella']],
  ['parmesan', 171247, 'Cheese, parmesan, grated', ['parmesan', 'parmesan cheese', 'parmigiano', 'parmigiano reggiano']],
  ['feta', 173420, 'Cheese, feta', ['feta', 'feta cheese']],
  ['swiss', 171251, 'Cheese, swiss', ['swiss cheese']],
  ['monterey-jack', 170844, 'Cheese, monterey jack', ['monterey jack', 'jack cheese', 'pepper jack']],
  ['provolone', 170850, 'Cheese, provolone', ['provolone']],
  ['mexican-cheese', 171288, 'Cheese, Mexican blend', ['mexican cheese', 'mexican blend cheese', 'taco cheese']],
  ['ricotta', 170851, 'Cheese, ricotta, whole milk', ['ricotta', 'ricotta cheese']],
  ['cottage-cheese', 172179, 'Cottage cheese, creamed', ['cottage cheese']],
  ['goat-cheese', 173435, 'Cheese, goat, soft', ['goat cheese', 'chevre']],

  // Meat, poultry, seafood (raw weights)
  ['chicken-breast', 171077, 'Chicken breast, skinless, raw', ['chicken breast', 'chicken breasts', 'chicken']],
  ['chicken-thigh', 173627, 'Chicken thigh, meat only, raw', ['chicken thigh', 'chicken thighs']],
  ['chicken-drumstick', 173614, 'Chicken drumstick, meat only, raw', ['chicken drumstick', 'drumstick', 'chicken leg']],
  ['chicken-wing', 172390, 'Chicken wing, with skin, raw', ['chicken wing', 'wing']],
  ['chicken-ground', 171116, 'Chicken, ground, raw', ['ground chicken']],
  ['turkey-ground', 172850, 'Turkey, ground 93% lean, raw', ['ground turkey', 'turkey']],
  ['beef-ground-85', 171796, 'Beef, ground 85% lean, raw', ['ground beef', 'beef', 'hamburger', 'minced beef', 'beef mince']],
  ['beef-ground-90', 174030, 'Beef, ground 90% lean, raw', ['lean ground beef', '90% lean ground beef']],
  ['beef-ground-93', 173110, 'Beef, ground 93% lean, raw', ['extra lean ground beef', '93% lean ground beef']],
  ['beef-sirloin', 174055, 'Beef, top sirloin steak, lean, raw', ['sirloin', 'steak', 'beef steak', 'sirloin steak']],
  ['beef-flank', 174776, 'Beef, flank steak, lean, raw', ['flank steak', 'skirt steak']],
  ['beef-chuck', 174018, 'Beef, chuck roast, lean, raw', ['chuck roast', 'beef chuck', 'stew meat', 'beef stew meat', 'pot roast']],
  ['pork-loin', 168230, 'Pork loin, lean, raw', ['pork loin', 'pork chop', 'pork chops', 'pork']],
  ['pork-tenderloin', 168249, 'Pork tenderloin, lean, raw', ['pork tenderloin']],
  ['pork-shoulder', 167843, 'Pork shoulder, raw', ['pork shoulder', 'pork butt', 'boston butt']],
  ['pork-ground', 167902, 'Pork, ground, raw', ['ground pork']],
  ['bacon', 168277, 'Bacon, raw', ['bacon']],
  ['ham', 168284, 'Ham, cured, lean, roasted', ['ham']],
  ['sausage-italian', 171631, 'Italian sausage, pork, raw', ['italian sausage', 'sausage']],
  ['kielbasa', 173879, 'Kielbasa, fully cooked', ['kielbasa', 'smoked sausage', 'polish sausage']],
  ['lamb-ground', 174370, 'Lamb, ground, raw', ['ground lamb', 'lamb']],
  ['salmon', 175167, 'Salmon, Atlantic, farmed, raw', ['salmon', 'salmon fillet']],
  ['salmon-canned', 175175, 'Salmon, pink, canned, drained', ['canned salmon']],
  ['tuna-canned', 173709, 'Tuna, light, canned in water, drained', ['tuna', 'canned tuna']],
  ['cod', 171955, 'Cod, Atlantic, raw', ['cod', 'white fish', 'whitefish']],
  ['tilapia', 175176, 'Tilapia, raw', ['tilapia']],
  ['shrimp', 175179, 'Shrimp, raw', ['shrimp', 'prawn', 'prawns']],

  // Plant proteins & legumes
  ['tofu-firm', 172448, 'Tofu, firm', ['tofu', 'firm tofu']],
  ['black-beans', 175188, 'Black beans, canned', ['black beans', 'black bean']],
  ['kidney-beans', 173741, 'Kidney beans, canned', ['kidney beans', 'red kidney beans']],
  ['pinto-beans', 175201, 'Pinto beans, canned', ['pinto beans']],
  ['white-beans', 175192, 'Great northern beans, canned', ['white beans', 'great northern beans', 'cannellini beans', 'navy beans']],
  ['chickpeas', 173800, 'Chickpeas, canned, drained', ['chickpeas', 'chickpea', 'garbanzo beans', 'garbanzo']],
  ['lentils', 172420, 'Lentils, dry', ['lentils', 'lentil', 'red lentils', 'green lentils']],
  ['edamame', 168410, 'Edamame, frozen', ['edamame']],
  ['hummus', 174289, 'Hummus', ['hummus']],
  ['peanut-butter', 174266, 'Peanut butter, smooth', ['peanut butter']],

  // Grains, pasta, bread
  ['flour-ap', 168894, 'Flour, all-purpose', ['flour', 'all purpose flour', 'plain flour', 'white flour']],
  ['flour-bread', 168896, 'Flour, bread', ['bread flour']],
  ['flour-whole-wheat', 168893, 'Flour, whole wheat', ['whole wheat flour', 'wholemeal flour']],
  ['cornmeal', 169697, 'Cornmeal, yellow', ['cornmeal', 'polenta']],
  ['cornstarch', 169698, 'Cornstarch', ['cornstarch', 'corn starch', 'cornflour']],
  ['rice-white', 168877, 'Rice, white, long grain, dry', ['rice', 'white rice', 'long grain rice', 'basmati rice', 'jasmine rice']],
  ['rice-white-cooked', 168878, 'Rice, white, cooked', ['cooked rice', 'cooked white rice']],
  ['rice-brown', 169703, 'Rice, brown, dry', ['brown rice']],
  ['rice-short', 168931, 'Rice, white, short grain, dry', ['short grain rice', 'sushi rice', 'arborio rice']],
  ['pasta-dry', 169736, 'Pasta, dry', ['pasta', 'spaghetti', 'penne', 'macaroni', 'linguine', 'fettuccine', 'rigatoni', 'fusilli', 'rotini', 'lasagna noodles', 'noodles']],
  ['pasta-cooked', 169737, 'Pasta, cooked', ['cooked pasta', 'cooked spaghetti']],
  ['egg-noodles', 169731, 'Egg noodles, dry', ['egg noodles']],
  ['rice-noodles', 169742, 'Rice noodles, dry', ['rice noodles', 'rice noodle', 'vermicelli']],
  ['couscous', 169699, 'Couscous, dry', ['couscous']],
  ['quinoa', 168874, 'Quinoa, dry', ['quinoa']],
  ['oats', 173904, 'Oats, rolled, dry', ['oats', 'rolled oats', 'oatmeal', 'quick oats', 'old fashioned oats']],
  ['barley', 170284, 'Barley, pearled, dry', ['barley', 'pearl barley']],
  ['bulgur', 170688, 'Bulgur, dry', ['bulgur']],
  ['bread-white', 174924, 'Bread, white', ['bread', 'white bread', 'sandwich bread']],
  ['bread-whole-wheat', 172688, 'Bread, whole wheat', ['whole wheat bread', 'wheat bread']],
  ['bread-crumbs', 174928, 'Bread crumbs, dry', ['bread crumbs', 'breadcrumbs', 'panko']],
  ['tortilla-flour', 175037, 'Tortilla, flour', ['tortilla', 'tortillas', 'flour tortilla', 'flour tortillas']],
  ['tortilla-corn', 175036, 'Tortilla, corn', ['corn tortilla', 'corn tortillas']],
  ['tortilla-chips', 173143, 'Tortilla chips', ['tortilla chips', 'chips']],

  // Vegetables
  ['onion', 170000, 'Onion, raw', ['onion', 'onions', 'yellow onion', 'white onion', 'red onion']],
  ['scallion', 170005, 'Green onion (scallion), raw', ['green onion', 'green onions', 'scallion', 'scallions', 'spring onion']],
  ['shallot', 170499, 'Shallot, raw', ['shallot', 'shallots']],
  ['leek', 169246, 'Leek, raw', ['leek', 'leeks']],
  ['garlic', 169230, 'Garlic, raw', ['garlic', 'garlic clove', 'garlic cloves', 'minced garlic']],
  ['ginger', 169231, 'Ginger root, raw', ['ginger', 'fresh ginger', 'ginger root']],
  ['tomato', 170457, 'Tomato, raw', ['tomato', 'tomatoes', 'roma tomato', 'cherry tomatoes']],
  ['tomato-canned', 170051, 'Tomatoes, canned', ['canned tomatoes', 'diced tomatoes', 'crushed tomatoes', 'whole peeled tomatoes']],
  ['tomato-sauce', 170054, 'Tomato sauce, canned', ['tomato sauce']],
  ['tomato-paste', 170459, 'Tomato paste', ['tomato paste']],
  ['sun-dried-tomato', 168567, 'Tomatoes, sun-dried', ['sun dried tomatoes', 'sundried tomatoes']],
  ['bell-pepper-red', 170108, 'Bell pepper, red, raw', ['red bell pepper', 'bell pepper', 'bell peppers', 'red pepper', 'yellow bell pepper', 'orange bell pepper', 'sweet pepper']],
  ['bell-pepper-green', 170427, 'Bell pepper, green, raw', ['green bell pepper', 'green pepper']],
  ['jalapeno', 168576, 'Jalapeño, raw', ['jalapeno', 'jalapeño', 'jalapenos']],
  ['chili-pepper', 170106, 'Chili pepper, red, raw', ['chili pepper', 'chile pepper', 'red chili', 'serrano', 'thai chili']],
  ['carrot', 170393, 'Carrot, raw', ['carrot', 'carrots']],
  ['celery', 169988, 'Celery, raw', ['celery', 'celery stalk', 'celery stalks']],
  ['potato', 170026, 'Potato, raw', ['potato', 'potatoes', 'yukon gold potatoes', 'red potatoes']],
  ['potato-russet', 170027, 'Potato, russet, raw', ['russet potato', 'russet potatoes', 'baking potato']],
  ['sweet-potato', 168482, 'Sweet potato, raw', ['sweet potato', 'sweet potatoes', 'yam', 'yams']],
  ['broccoli', 170379, 'Broccoli, raw', ['broccoli', 'broccoli florets']],
  ['cauliflower', 169986, 'Cauliflower, raw', ['cauliflower']],
  ['spinach', 168462, 'Spinach, raw', ['spinach', 'baby spinach']],
  ['spinach-frozen', 169287, 'Spinach, frozen', ['frozen spinach']],
  ['kale', 168421, 'Kale, raw', ['kale']],
  ['cabbage', 169975, 'Cabbage, raw', ['cabbage', 'coleslaw mix']],
  ['bok-choy', 170390, 'Bok choy, raw', ['bok choy', 'pak choi']],
  ['lettuce-romaine', 169247, 'Lettuce, romaine, raw', ['lettuce', 'romaine', 'romaine lettuce', 'mixed greens', 'salad greens']],
  ['lettuce-iceberg', 169248, 'Lettuce, iceberg, raw', ['iceberg lettuce']],
  ['cucumber', 168409, 'Cucumber, raw', ['cucumber', 'cucumbers']],
  ['zucchini', 169291, 'Zucchini, raw', ['zucchini', 'courgette', 'summer squash']],
  ['butternut-squash', 169295, 'Butternut squash, raw', ['butternut squash', 'squash', 'winter squash']],
  ['pumpkin-canned', 168450, 'Pumpkin, canned', ['pumpkin puree', 'canned pumpkin', 'pumpkin']],
  ['eggplant', 169228, 'Eggplant, raw', ['eggplant', 'aubergine']],
  ['mushrooms', 169251, 'Mushrooms, white, raw', ['mushroom', 'mushrooms', 'button mushrooms', 'cremini mushrooms']],
  ['green-beans', 169961, 'Green beans, raw', ['green beans', 'string beans', 'snap beans']],
  ['asparagus', 168389, 'Asparagus, raw', ['asparagus']],
  ['corn', 168400, 'Corn, sweet, frozen', ['corn', 'sweet corn', 'corn kernels']],
  ['peas', 170016, 'Peas, green, frozen', ['peas', 'green peas', 'frozen peas']],
  ['avocado', 171705, 'Avocado, raw', ['avocado', 'avocados']],
  ['olives', 169094, 'Olives, ripe, canned', ['olives', 'black olives']],
  ['pickles', 168558, 'Pickles, dill', ['pickle', 'pickles', 'dill pickles']],

  // Fruit
  ['banana', 173944, 'Banana, raw', ['banana', 'bananas']],
  ['apple', 171688, 'Apple, raw, with skin', ['apple', 'apples']],
  ['orange', 169097, 'Orange, raw', ['orange', 'oranges']],
  ['lemon', 167746, 'Lemon, raw', ['lemon', 'lemons']],
  ['lemon-juice', 167747, 'Lemon juice', ['lemon juice']],
  ['lime-juice', 168156, 'Lime juice', ['lime juice', 'lime', 'limes']],
  ['strawberries', 167762, 'Strawberries, raw', ['strawberries', 'strawberry']],
  ['blueberries', 171711, 'Blueberries, raw', ['blueberries', 'blueberry', 'berries']],
  ['grapes', 174683, 'Grapes, raw', ['grapes']],
  ['pineapple', 169124, 'Pineapple, raw', ['pineapple']],
  ['mango', 169910, 'Mango, raw', ['mango', 'mangoes']],
  ['peach', 169928, 'Peach, raw', ['peach', 'peaches']],
  ['pear', 169118, 'Pear, raw', ['pear', 'pears']],
  ['raisins', 168165, 'Raisins', ['raisins']],
  ['dried-cranberries', 171723, 'Cranberries, dried, sweetened', ['dried cranberries', 'craisins']],
  ['dates', 168191, 'Dates, medjool', ['dates', 'medjool dates']],

  // Nuts & seeds
  ['almonds', 170567, 'Almonds', ['almonds', 'almond']],
  ['walnuts', 170187, 'Walnuts', ['walnuts', 'walnut']],
  ['pecans', 170182, 'Pecans', ['pecans', 'pecan']],
  ['cashews', 170162, 'Cashews, raw', ['cashews', 'cashew']],
  ['peanuts', 172430, 'Peanuts, raw', ['peanuts', 'peanut']],
  ['chia-seeds', 170554, 'Chia seeds', ['chia seeds', 'chia']],
  ['flaxseed', 169414, 'Flaxseed', ['flaxseed', 'flax seeds', 'ground flaxseed']],
  ['sesame-seeds', 170150, 'Sesame seeds', ['sesame seeds']],
  ['sunflower-seeds', 170562, 'Sunflower seeds', ['sunflower seeds']],
  ['pumpkin-seeds', 170556, 'Pumpkin seeds', ['pumpkin seeds', 'pepitas']],
  ['coconut-shredded', 170170, 'Coconut, dried, unsweetened', ['shredded coconut', 'desiccated coconut', 'coconut flakes']],
  ['coconut-milk', 170173, 'Coconut milk, canned', ['coconut milk']],
  ['almond-milk', 174832, 'Almond milk, unsweetened', ['almond milk']],

  // Fats & oils
  ['olive-oil', 171413, 'Olive oil', ['olive oil', 'extra virgin olive oil', 'oil']],
  ['vegetable-oil', 172370, 'Vegetable oil (soybean)', ['vegetable oil', 'cooking oil']],
  ['canola-oil', 172336, 'Canola oil', ['canola oil']],
  ['coconut-oil', 171412, 'Coconut oil', ['coconut oil']],
  ['sesame-oil', 171016, 'Sesame oil', ['sesame oil']],
  ['peanut-oil', 171410, 'Peanut oil', ['peanut oil']],
  ['shortening', 173584, 'Vegetable shortening', ['shortening']],
  ['mayonnaise', 171009, 'Mayonnaise', ['mayonnaise', 'mayo']],

  // Sweeteners & baking
  ['sugar', 169655, 'Sugar, granulated', ['sugar', 'white sugar', 'granulated sugar', 'caster sugar']],
  ['brown-sugar', 168833, 'Sugar, brown', ['brown sugar', 'light brown sugar', 'dark brown sugar']],
  ['powdered-sugar', 169656, 'Sugar, powdered', ['powdered sugar', 'icing sugar', 'confectioners sugar']],
  ['honey', 169640, 'Honey', ['honey']],
  ['maple-syrup', 169661, 'Maple syrup', ['maple syrup']],
  ['molasses', 168820, 'Molasses', ['molasses']],
  ['agave', 170277, 'Agave syrup', ['agave', 'agave syrup', 'agave nectar']],
  ['jam', 169641, 'Jam / preserves', ['jam', 'jelly', 'preserves']],
  ['cocoa', 169593, 'Cocoa powder, unsweetened', ['cocoa', 'cocoa powder']],
  ['dark-chocolate', 170273, 'Dark chocolate, 70-85%', ['dark chocolate']],
  ['chocolate-chips', 167976, 'Semisweet chocolate', ['chocolate chips', 'semisweet chocolate', 'chocolate']],
  ['baking-powder', 172804, 'Baking powder', ['baking powder']],
  ['baking-soda', 175040, 'Baking soda', ['baking soda', 'bicarbonate of soda']],
  ['yeast', 175043, 'Yeast, active dry', ['yeast', 'active dry yeast', 'instant yeast']],
  ['vanilla', 173471, 'Vanilla extract', ['vanilla', 'vanilla extract']],
  ['gelatin', 169599, 'Gelatin, unflavored', ['gelatin']],

  // Condiments & sauces
  ['salt', 173468, 'Salt, table', ['salt', 'kosher salt', 'sea salt']],
  ['soy-sauce', 174277, 'Soy sauce', ['soy sauce', 'shoyu', 'tamari']],
  ['fish-sauce', 174531, 'Fish sauce', ['fish sauce']],
  ['worcestershire', 171610, 'Worcestershire sauce', ['worcestershire', 'worcestershire sauce']],
  ['hoisin', 172886, 'Hoisin sauce', ['hoisin', 'hoisin sauce']],
  ['teriyaki', 171167, 'Teriyaki sauce', ['teriyaki', 'teriyaki sauce']],
  ['sriracha', 171186, 'Sriracha / hot sauce', ['sriracha', 'hot sauce', 'chili sauce']],
  ['bbq-sauce', 174523, 'Barbecue sauce', ['bbq sauce', 'barbecue sauce']],
  ['ketchup', 168556, 'Ketchup', ['ketchup', 'catsup']],
  ['mustard', 172234, 'Mustard, prepared yellow', ['mustard', 'dijon mustard', 'yellow mustard']],
  ['marinara', 171192, 'Marinara / pasta sauce', ['marinara', 'marinara sauce', 'pasta sauce', 'spaghetti sauce']],
  ['salsa', 174524, 'Salsa', ['salsa']],
  ['pesto', 171579, 'Pesto', ['pesto']],
  ['ranch', 173592, 'Ranch dressing', ['ranch', 'ranch dressing']],
  ['italian-dressing', 171019, 'Italian dressing', ['italian dressing', 'salad dressing']],
  ['vinegar-cider', 173469, 'Vinegar, apple cider', ['apple cider vinegar', 'cider vinegar']],
  ['vinegar-white', 172237, 'Vinegar, distilled', ['vinegar', 'white vinegar', 'distilled vinegar', 'rice vinegar']],
  ['vinegar-balsamic', 172241, 'Vinegar, balsamic', ['balsamic', 'balsamic vinegar']],
  ['vinegar-red-wine', 172240, 'Vinegar, red wine', ['red wine vinegar']],
  ['capers', 172238, 'Capers', ['capers']],
  ['chicken-broth', 174536, 'Chicken broth', ['chicken broth', 'chicken stock', 'broth', 'stock']],
  ['vegetable-broth', 171583, 'Vegetable broth', ['vegetable broth', 'vegetable stock']],
  ['beef-broth', 172883, 'Beef stock', ['beef broth', 'beef stock']],
  ['water', 173647, 'Water', ['water']],
  ['red-wine', 173190, 'Wine, red', ['red wine', 'wine']],
  ['beer', 168746, 'Beer', ['beer']],

  // Herbs & spices
  ['black-pepper', 170931, 'Black pepper', ['pepper', 'black pepper', 'ground pepper']],
  ['cinnamon', 171320, 'Cinnamon, ground', ['cinnamon']],
  ['cumin', 170923, 'Cumin', ['cumin', 'ground cumin']],
  ['chili-powder', 171319, 'Chili powder', ['chili powder', 'chilli powder', 'cayenne', 'cayenne pepper', 'red pepper flakes']],
  ['paprika', 171329, 'Paprika', ['paprika', 'smoked paprika']],
  ['garlic-powder', 171325, 'Garlic powder', ['garlic powder']],
  ['onion-powder', 171327, 'Onion powder', ['onion powder']],
  ['oregano', 171328, 'Oregano, dried', ['oregano', 'italian seasoning', 'dried herbs']],
  ['basil-dried', 171317, 'Basil, dried', ['dried basil']],
  ['basil', 172232, 'Basil, fresh', ['basil', 'fresh basil']],
  ['thyme', 170938, 'Thyme, dried', ['thyme']],
  ['rosemary', 171333, 'Rosemary, dried', ['rosemary']],
  ['parsley', 170416, 'Parsley, fresh', ['parsley']],
  ['cilantro', 169997, 'Cilantro, fresh', ['cilantro', 'coriander leaves']],
  ['dill', 172233, 'Dill, fresh', ['dill']],
  ['mint', 173475, 'Mint, fresh', ['mint']],
  ['chives', 169994, 'Chives, raw', ['chives']],
  ['ginger-ground', 170926, 'Ginger, ground', ['ground ginger']],
  ['turmeric', 172231, 'Turmeric, ground', ['turmeric']],
  ['curry-powder', 170924, 'Curry powder', ['curry powder', 'garam masala']],
  ['nutmeg', 171326, 'Nutmeg, ground', ['nutmeg']],
  ['bay-leaf', 170917, 'Bay leaf', ['bay leaf', 'bay leaves']],
];

/**
 * Hand-set values where SR Legacy has no usable volume/piece portion
 * (or only an unhelpful one). Merged over the extracted values.
 */
const OVERRIDES = {
  water: { gramsPerMl: 1 },
  'red-wine': { gramsPerMl: 0.99 },
  beer: { gramsPerMl: 1.01 },
  'yogurt-greek': { gramsPerMl: 1.05 },
  'mozzarella-part-skim': { gramsPerMl: 0.473 },
  'goat-cheese': { gramsPerMl: 0.95 },
  marinara: { gramsPerMl: 1.116 },
  'cottage-cheese': { gramsPerMl: 0.951 }, // 1 cup small curd = 225 g
  'brown-sugar': { gramsPerMl: 0.93 }, // 1 cup packed = 220 g (recipes assume packed)
  raisins: { gramsPerMl: 0.613, pieces: {} }, // 1 cup not packed = 145 g
  cashews: { gramsPerMl: 0.579 }, // 1 cup whole (fdc 169421) = 137 g
  gelatin: { gramsPerMl: 0.473, pieces: { envelope: 7 } }, // 1 envelope (1 tbsp) = 7 g
  // Recipes mean a large egg when they say "2 eggs".
  egg: { pieces: { piece: 50, large: 50, 'extra large': 56, jumbo: 63, medium: 44, small: 38 } },
  // Standard US can net weights (label values) where SR Legacy lists none or a small can.
  'tomato-canned': { pieces: { can: 411, large: 164, medium: 111, small: 82 } }, // 14.5 oz
  'black-beans': { pieces: { can: 425 } }, // 15 oz
  'kidney-beans': { pieces: { can: 425 } }, // 15 oz
  'white-beans': { pieces: { can: 425 } }, // 15 oz
  'tomato-sauce': { pieces: { can: 425 } }, // 15 oz
};

/** Volume measures recognised at the start of an SR Legacy portion modifier, best first. */
const VOLUME_PORTIONS = [
  [/^cup$/, 236.588],
  [/^cup, fluid/, 236.588],
  [/^fl oz/, 29.574],
  [/^(tbsp|tablespoon)\b/, 14.787],
  [/^cup\b(?!.*(whipped|packed\)?$))/, 236.588],
  [/^(tsp|teaspoon)\b/, 4.929],
];

/** Portion words kept as named unit weights ("1 large", "1 clove", "1 avocado" → piece). */
const SIZE_WORDS = ['extra large', 'jumbo', 'large', 'medium', 'small'];
const NAMED_PIECES = ['clove', 'stick', 'slice', 'stalk', 'leaf', 'sprig', 'link', 'strip', 'fillet', 'head', 'ear', 'can', 'bunch', 'wedge'];
const WHOLE_ITEM_WORDS = [
  'piece', 'fruit', 'pepper', 'tortilla', 'breast', 'thigh', 'drumstick', 'wing', 'potato', 'sweetpotato',
  'carrot', 'banana', 'date', 'avocado', 'cucumber', 'lime', 'egg', 'almond',
];
const SKIP_PORTION = /\b(box|package|container|serving|nlea|bag|jar|pieces|crust)\b/;

function pieceName(modifier) {
  if (SKIP_PORTION.test(modifier)) return null;
  const firstWord = modifier.split(/[\s,(]/)[0];
  if (NAMED_PIECES.includes(firstWord)) return firstWord;
  const size = SIZE_WORDS.find((word) => new RegExp(`(^|\\s)${word}\\b`).test(modifier));
  if (size && (modifier.startsWith(size) || WHOLE_ITEM_WORDS.includes(firstWord))) return size;
  if (WHOLE_ITEM_WORDS.includes(firstWord)) return 'piece';
  return null;
}

function parseCsv(text) {
  const rows = [];
  let field = '';
  let row = [];
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (ch !== '\r') {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...body] = rows;
  return body.map((cells) => Object.fromEntries(header.map((name, index) => [name, cells[index]])));
}

const round = (value, places) => Math.round(value * 10 ** places) / 10 ** places;

function main() {
  const dir = process.argv[2];
  if (!dir) {
    console.error('usage: node scripts/build-nutrition-table.mjs <sr-legacy-csv-dir>');
    process.exit(1);
  }

  const wanted = new Set(FOODS.map(([, fdcId]) => String(fdcId)));
  const descriptions = new Map();
  for (const food of parseCsv(readFileSync(join(dir, 'food.csv'), 'utf8'))) {
    if (wanted.has(food.fdc_id)) descriptions.set(food.fdc_id, food.description);
  }

  const NUTRIENTS = { 1008: 'kcal', 1003: 'protein', 1005: 'carbs', 1004: 'fat', 1079: 'fiber' };
  const nutrients = new Map();
  for (const row of parseCsv(readFileSync(join(dir, 'food_nutrient.csv'), 'utf8'))) {
    const key = NUTRIENTS[row.nutrient_id];
    if (!key || !wanted.has(row.fdc_id)) continue;
    const entry = nutrients.get(row.fdc_id) ?? {};
    entry[key] = Number(row.amount);
    nutrients.set(row.fdc_id, entry);
  }

  const portions = new Map();
  for (const row of parseCsv(readFileSync(join(dir, 'food_portion.csv'), 'utf8'))) {
    if (!wanted.has(row.fdc_id)) continue;
    const list = portions.get(row.fdc_id) ?? [];
    list.push({ amount: Number(row.amount), modifier: row.modifier.trim().toLowerCase(), grams: Number(row.gram_weight) });
    portions.set(row.fdc_id, list);
  }

  const seenIds = new Set();
  const seenAliases = new Map();
  const out = [];
  for (const [id, fdcId, name, aliases] of FOODS) {
    const key = String(fdcId);
    if (seenIds.has(id)) throw new Error(`duplicate id ${id}`);
    seenIds.add(id);
    for (const alias of aliases) {
      if (seenAliases.has(alias)) throw new Error(`alias "${alias}" used by ${seenAliases.get(alias)} and ${id}`);
      seenAliases.set(alias, id);
    }
    if (!descriptions.has(key)) throw new Error(`fdc_id ${fdcId} (${id}) not in dataset`);
    const n = nutrients.get(key) ?? {};
    for (const required of ['kcal', 'protein', 'carbs', 'fat']) {
      if (typeof n[required] !== 'number') throw new Error(`fdc_id ${fdcId} (${id}) missing ${required}`);
    }

    // Density from the best volume portion (a plain or fluid cup first).
    let gramsPerMl = null;
    const list = portions.get(key) ?? [];
    for (const [pattern, ml] of VOLUME_PORTIONS) {
      const portion = list.find((p) => p.amount > 0 && pattern.test(p.modifier));
      if (portion) {
        gramsPerMl = round(portion.grams / (portion.amount * ml), 3);
        break;
      }
    }

    let pieces = {};
    for (const portion of list) {
      if (portion.amount !== 1) continue;
      const piece = pieceName(portion.modifier);
      if (piece && pieces[piece] === undefined) pieces[piece] = round(portion.grams, 1);
    }

    const override = OVERRIDES[id] ?? {};
    if (override.gramsPerMl !== undefined) gramsPerMl = override.gramsPerMl;
    if (override.pieces !== undefined) pieces = override.pieces;

    out.push({
      id,
      fdcId,
      name,
      usdaDescription: descriptions.get(key),
      aliases,
      per100g: {
        kcal: round(n.kcal, 1),
        protein: round(n.protein, 2),
        carbs: round(n.carbs, 2),
        fat: round(n.fat, 2),
        fiber: round(n.fiber ?? 0, 2),
      },
      gramsPerMl,
      pieces,
    });
  }

  const target = join(dirname(fileURLToPath(import.meta.url)), '..', 'lib', 'nutrition', 'referenceFoods.ts');
  const body = out.map((food) => `  ${JSON.stringify(food)},`).join('\n');
  writeFileSync(
    target,
    `/**
 * GENERATED by scripts/build-nutrition-table.mjs — do not edit by hand.
 *
 * Nutrient values per 100 g, typical volume densities, and piece weights for
 * common ingredients, derived from USDA FoodData Central SR Legacy (April 2018
 * release), U.S. Department of Agriculture, Agricultural Research Service.
 * Public domain (CC0 1.0). See docs/nutrition-data.md.
 */
import type { ReferenceFood } from './types';

export const REFERENCE_FOODS: readonly ReferenceFood[] = [
${body}
];
`
  );
  console.log(`wrote ${out.length} foods to ${target}`);
}

main();
