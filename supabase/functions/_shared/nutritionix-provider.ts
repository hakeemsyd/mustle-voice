import { type FoodLookupItem, type FoodLookupProvider, type FoodLookupResult, FoodLookupError } from './food-lookup.ts';

// Confirmed against Nutritionix's own published examples (their v2 docs are otherwise
// sales-gated as of 2026-09-04): POST /v2/natural/nutrients, x-app-id/x-app-key headers, a
// `foods` array with food_name/serving_qty/serving_unit/nf_calories/nf_protein/
// nf_total_carbohydrate/nf_total_fat per item.
const NATURAL_NUTRIENTS_URL = 'https://trackapi.nutritionix.com/v2/natural/nutrients';

interface NutritionixFood {
  food_name: string;
  serving_qty: number;
  serving_unit: string;
  nf_calories: number | null;
  nf_protein: number | null;
  nf_total_carbohydrate: number | null;
  nf_total_fat: number | null;
  /** Present on a branded/restaurant match, absent on a generic ingredient — the closest thing
   *  this endpoint gives to a confidence signal, since it has no explicit match-score field. */
  nix_item_id?: string | null;
  tag_id?: string | null;
}

interface NutritionixResponse {
  foods?: NutritionixFood[];
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export class NutritionixProvider implements FoodLookupProvider {
  readonly name = 'nutritionix';

  constructor(
    private readonly appId: string,
    private readonly appKey: string,
  ) {}

  async lookup(query: string): Promise<FoodLookupResult> {
    let response: Response;
    try {
      response = await fetch(NATURAL_NUTRIENTS_URL, {
        method: 'POST',
        headers: {
          'x-app-id': this.appId,
          'x-app-key': this.appKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query }),
      });
    } catch (err) {
      throw new FoodLookupError(`Nutritionix request failed: ${(err as Error).message}`, true);
    }

    if (response.status === 404) {
      // The endpoint's documented behavior for "recognized no food at all in this text" — not a
      // network/auth failure, so not retryable; the caller should ask the user to rephrase.
      return { fullyMatched: false, items: [], totals: { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 }, unresolvedPhrases: [query] };
    }
    if (!response.ok) {
      throw new FoodLookupError(`Nutritionix returned ${response.status}: ${await response.text()}`, response.status >= 500);
    }

    const data = (await response.json()) as NutritionixResponse;
    const foods = data.foods ?? [];

    const items: FoodLookupItem[] = [];
    let fullyMatched = foods.length > 0;

    for (const food of foods) {
      // A matched food with any macro missing is exactly the "low-confidence, treat as an
      // estimate" case Damion's decision calls for — Nutritionix returns partial nf_* fields for
      // some obscure items rather than failing the whole request.
      if (food.nf_calories == null || food.nf_protein == null || food.nf_total_carbohydrate == null || food.nf_total_fat == null) {
        fullyMatched = false;
      }
      items.push({
        name: food.food_name,
        servingQty: food.serving_qty,
        servingUnit: food.serving_unit,
        calories: food.nf_calories ?? 0,
        proteinG: food.nf_protein ?? 0,
        carbsG: food.nf_total_carbohydrate ?? 0,
        fatG: food.nf_total_fat ?? 0,
      });
    }

    const totals = items.reduce(
      (sum, item) => ({
        calories: sum.calories + item.calories,
        proteinG: sum.proteinG + item.proteinG,
        carbsG: sum.carbsG + item.carbsG,
        fatG: sum.fatG + item.fatG,
      }),
      { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 },
    );

    return {
      fullyMatched,
      items,
      totals: {
        calories: Math.round(totals.calories),
        proteinG: round1(totals.proteinG),
        carbsG: round1(totals.carbsG),
        fatG: round1(totals.fatG),
      },
      // This endpoint doesn't report which individual phrases within a multi-item query failed
      // to parse, only whether the whole call found nothing — a real per-phrase breakdown would
      // need the finer-grained /v2/natural/instant path instead, not built here.
      unresolvedPhrases: foods.length === 0 ? [query] : [],
    };
  }
}

let cachedProvider: FoodLookupProvider | null = null;

/** Reads NUTRITIONIX_APP_ID/NUTRITIONIX_APP_KEY from the function's environment. Throws with a
 *  clear message rather than constructing a provider that would fail confusingly on first use —
 *  these secrets don't exist yet as of 2026-09-04 pending Nutritionix account signup, so this is
 *  expected to throw until that's done and the secrets are set via `supabase secrets set`. */
export function getFoodLookupProvider(): FoodLookupProvider {
  if (cachedProvider) return cachedProvider;
  const appId = Deno.env.get('NUTRITIONIX_APP_ID');
  const appKey = Deno.env.get('NUTRITIONIX_APP_KEY');
  if (!appId || !appKey) {
    throw new FoodLookupError(
      'NUTRITIONIX_APP_ID/NUTRITIONIX_APP_KEY are not set — sign up for a Nutritionix developer ' +
        'account and set both as Supabase function secrets before log_food can resolve real macros.',
      false,
    );
  }
  cachedProvider = new NutritionixProvider(appId, appKey);
  return cachedProvider;
}
