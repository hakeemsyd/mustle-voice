/**
 * Provider-agnostic contract for resolving a natural-language food description into real
 * macros. Damion's decision (2026-09-04): the model identifies WHAT was eaten and roughly how
 * much, a verified database supplies the actual nutrition values, and the server sums and
 * validates the totals — the model never gets to state a calorie or macro number itself.
 * Built against this interface, not a Nutritionix-shaped one directly, so swapping in USDA or
 * another source later (Damion's other ask) is a new file implementing FoodLookupProvider, not a
 * rewrite of brain-handlers.ts.
 */

export interface FoodLookupItem {
  /** The provider's own name for what it matched — not necessarily identical to what the user
   *  said, since branded/restaurant items resolve to a canonical product name. */
  name: string;
  /** As parsed by the provider, e.g. "6 large" — kept for the saved record's description, not
   *  used in any arithmetic. */
  servingQty: number;
  servingUnit: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface FoodLookupResult {
  /** True only when every phrase in the query resolved to a real matched item. False means at
   *  least one item is a low-confidence guess or wasn't found at all — callers must treat the
   *  totals as an estimate and say so, per Damion's "label it as an estimate" requirement. */
  fullyMatched: boolean;
  items: FoodLookupItem[];
  /** Summed here from `items`, never taken from a provider-reported total — the whole point of
   *  this layer is that the server computes and validates totals rather than trusting a single
   *  upstream number that could be wrong for reasons we'd have no way to catch. */
  totals: { calories: number; proteinG: number; carbsG: number; fatG: number };
  /** Phrases the provider could not resolve into any item at all (as opposed to a low-confidence
   *  match) — surfaced separately so the caller can ask specifically about these rather than a
   *  generic "something didn't match". */
  unresolvedPhrases: string[];
}

export interface FoodLookupProvider {
  readonly name: string;
  lookup(query: string): Promise<FoodLookupResult>;
}

export class FoodLookupError extends Error {
  constructor(
    message: string,
    /** True for a config/auth/network failure (retryable, not the user's fault) — false for a
     *  provider response that just couldn't parse the query. Callers use this to decide whether
     *  to tell the user "try rephrasing" vs. quietly falling back / logging an ops alert. */
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'FoodLookupError';
  }
}
