import { straightenQuotes } from './set-report.ts';

const EATING_VERB = /\b(?:ate|eaten|eating|drank|drunk|drinking|snacked|snacking|munched|chugged)\b/i;

const MEAL_WORD = /\b(?:breakfast|brunch|lunch|dinner|supper|snack|meal|pre[\s-]?workout\s+(?:shake|meal)|post[\s-]?workout\s+(?:shake|meal))\b/i;

const NUTRITION_WORD =
  /\b(?:calories|kcal|macros?|carbs|carbohydrates|protein\s+(?:shake|bar|powder)|grams?\s+of\s+(?:protein|carbs|fat))\b/i;

const FOOD_NOUN =
  /\b(?:banana|apple|orange|egg|eggs|toast|bread|bagel|oats|oatmeal|cereal|rice|pasta|chicken|beef|steak|fish|salmon|tuna|turkey|pork|salad|sandwich|burger|pizza|soup|yogurt|yoghurt|cheese|milk|smoothie|shake|coffee|tea|juice|water|protein|potato|potatoes|beans|nuts|almonds|peanut|avocado|fruit|vegetables|veggies|chocolate|snack|bar|wrap|burrito|taco|curry|noodles|cake|cookie|cookies|ice\s+cream)\b/i;

const LOOSE_EATING_VERB = /\b(?:had|have|having|grabbed|made\s+myself|finished\s+off)\b/i;

export const looksLikeFoodTurn = (raw: string): boolean => {
  const text = straightenQuotes(raw ?? '').trim();
  if (!text) return false;
  if (EATING_VERB.test(text) || MEAL_WORD.test(text) || NUTRITION_WORD.test(text)) return true;
  return LOOSE_EATING_VERB.test(text) && FOOD_NOUN.test(text);
};

export const FOOD_TURN_NOTE =
  'WHAT THIS TURN IS ABOUT\n' +
  '- They are telling you what they ate. Log exactly what they named and nothing more.\n' +
  '- Do NOT ask a clarifying question. Not about portion size, not about cooking method, not about ' +
  'brand, and above all not "was that everything?" / "anything else with it?" / "anything to ' +
  'drink?". Estimate a typical serving and go straight to the preview with your macro estimate.\n' +
  '- If they named the meal ("for breakfast", "my lunch", "a snack"), pass that as meal_type. If ' +
  'they did not, leave meal_type out — never infer it from the time of day.';

export const offTopicTurnNote = (foodTurn: boolean): string =>
  'WHAT THIS TURN IS ABOUT\n' +
  '- The app ran this message through the set parser and it is NOT a set report, a rest change, or ' +
  'a correction. Nothing was logged and the set count above is unchanged.\n' +
  '- Answer what they actually said. A workout being in progress does NOT mean this turn is about ' +
  'the workout.\n' +
  '- Do NOT reply with the next set, the current weight, a rep target, or "go", unless they asked ' +
  'for one of those.' +
  (foodTurn
    ? '\n- This one is about FOOD. Estimate the macros, ask them to confirm, and log it with the ' +
      'food tool once they do, exactly as you would outside a workout.'
    : '');
