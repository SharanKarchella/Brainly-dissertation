/**
 * Token-level pricing for claude-haiku-4-5-20251001.
 *
 * Source: https://www.anthropic.com/pricing (verified June 2025)
 * UPDATE THESE TWO CONSTANTS if Anthropic changes pricing.
 * Everything else is derived from them.
 *
 * These figures only affect console log output — they do not change
 * which API is called or how many tokens are sent.
 */
export const HAIKU_INPUT_COST_PER_TOKEN: number = 0.80 / 1_000_000;  // $0.80 per 1M input tokens
export const HAIKU_OUTPUT_COST_PER_TOKEN: number = 4.00 / 1_000_000; // $4.00 per 1M output tokens

/** Token usage as returned by the Anthropic API in response.usage */
export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
}

/**
 * Logs the estimated USD cost of one Claude API call to the browser console.
 *
 * WHY log costs:
 *   Direct-from-browser API calls bypass any server-side rate limiting.
 *   Logging per-call cost makes it immediately obvious if a feature is
 *   being called unexpectedly often or if a prompt is bloated.
 *
 * The estimate is accurate to the published per-token price but does not
 * account for caching discounts or volume pricing.
 */
export function logCost(usage: TokenUsage, operation: string): void {
  const inputCost  = usage.input_tokens  * HAIKU_INPUT_COST_PER_TOKEN;
  const outputCost = usage.output_tokens * HAIKU_OUTPUT_COST_PER_TOKEN;
  const total      = inputCost + outputCost;
  console.log(
    `[Cost:${operation}] ` +
    `in=${usage.input_tokens} tok ($${inputCost.toFixed(6)})  ` +
    `out=${usage.output_tokens} tok ($${outputCost.toFixed(6)})  ` +
    `total ≈ $${total.toFixed(6)}`
  );
}
