/**
 * Central AI module — all Claude API calls live here.
 *
 * Design rationale (dissertation note):
 *
 * 1. WHY tool_use instead of "return JSON in a text message":
 *    Claude's tool_use (function-calling) feature sends an input_schema to
 *    the model.  When tool_choice is set to force a specific tool, Claude MUST
 *    return a JSON object that validates against that schema — the API itself
 *    rejects non-conforming responses before they reach our code.
 *    This eliminates the fragile regex-on-free-text approach and gives us:
 *      • Guaranteed valid JSON  (no parse errors)
 *      • Guaranteed field types (numbers, arrays, strings enforced by schema)
 *      • No preamble/explanation to strip from the response
 *
 * 2. WHY a fixed tag vocabulary:
 *    Open-ended tagging produces inconsistent labels ("ML" vs "machine-learning"
 *    vs "ai").  A closed 18-tag vocabulary normalises the tag space so sidebar
 *    filtering and tag-based evaluation metrics work reliably.
 *
 * 3. WHY ranked search with scores:
 *    Returning a sorted list with per-item 0-1 relevance scores lets us compute
 *    MRR and NDCG evaluation metrics directly.  The human-readable reason field
 *    makes the ranking legible to users and to the dissertation evaluator.
 */

import { logCost, type TokenUsage } from "./costs";

// ── Shared constants ─────────────────────────────────────────────────────────

/** Model used for all AI features — change here to update everywhere */
const CLAUDE_MODEL = "claude-haiku-4-5-20251001";
const CLAUDE_URL   = "https://api.anthropic.com/v1/messages";

/** The 18 fixed topic categories used for auto-tagging */
export const ALLOWED_TAGS = [
  "programming", "design", "finance",  "music",   "sports",
  "news",        "humor",  "science",  "health",  "business",
  "education",   "entertainment", "technology", "politics",
  "art",         "cooking", "travel", "gaming",
] as const;

export type AllowedTag = (typeof ALLOWED_TAGS)[number];

/** Shared request headers for every Claude API call */
function claudeHeaders(apiKey: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
    // Required when calling the API directly from browser JavaScript
    "anthropic-dangerous-direct-browser-access": "true",
  };
}

// ── Auto-tagging ─────────────────────────────────────────────────────────────

/** One item passed to the tagging API */
export interface TaggingItem {
  /** 0-based position in the original untagged array (used as the JSON key) */
  index: number;
  type: string;
  title: string;
  /**
   * Channel/author name fetched from oEmbed at add-time.
   * Enriches short or vague titles — e.g. the channel "3Blue1Brown" turns a
   * title like "Episode 12" into a mathematics item.
   * Omitted when metadata was not available; the prompt handles this gracefully.
   */
  author?: string;
}

export interface TaggingResponse {
  /** Maps each 0-based item index to its assigned tag array */
  tagsByIndex: Record<number, string[]>;
  usage: TokenUsage;
}

/**
 * Sends a batch of content items to Claude and receives 2-3 topic tags each.
 *
 * Prompt strategy:
 *   - System message sets the role and the closed tag vocabulary.
 *   - User message is a numbered list, each line optionally including the
 *     author/channel name after a pipe separator.
 *   - tool_choice forces the assign_tags tool, so the response is always
 *     a valid JSON object keyed by index.
 *
 * WHY batch in one call rather than one-item-at-a-time:
 *   A single request for N items costs one round-trip and shares the system
 *   prompt tokens across all items.  Sequential per-item calls would multiply
 *   both latency and cost by N.
 */
export async function callTaggingAPI(
  items: TaggingItem[],
  apiKey: string
): Promise<TaggingResponse> {
  const list = items
    .map((it) => {
      const authorPart = it.author ? ` | channel: "${it.author}"` : "";
      return `${it.index}. [${it.type.toUpperCase()}] "${it.title}"${authorPart}`;
    })
    .join("\n");

  const body = {
    model: CLAUDE_MODEL,
    max_tokens: 1024,
    system:
      `You are a content-tagging system for a personal second-brain app. ` +
      `Assign 2–3 topic tags to each item. ` +
      `You MUST only use tags from this exact list: ${ALLOWED_TAGS.join(", ")}. ` +
      `When a title is short or ambiguous, use the channel name as context. ` +
      `Every index in the input must appear in your output.`,
    tools: [
      {
        name: "assign_tags",
        description:
          "Assign 2–3 topic tags from the allowed vocabulary to each numbered content item.",
        input_schema: {
          type: "object",
          properties: {
            tags: {
              type: "object",
              description:
                "Keys are 0-based item indices (as strings). " +
                "Values are arrays of 2–3 tag strings chosen from the allowed vocabulary.",
              additionalProperties: {
                type: "array",
                items: { type: "string", enum: [...ALLOWED_TAGS] },
                minItems: 1,
                maxItems: 3,
              },
            },
          },
          required: ["tags"],
        },
      },
    ],
    // Forcing this specific tool eliminates any free-text preamble
    tool_choice: { type: "tool", name: "assign_tags" },
    messages: [{ role: "user", content: `Tag these items:\n\n${list}` }],
  };

  const res = await fetch(CLAUDE_URL, {
    method: "POST",
    headers: claudeHeaders(apiKey),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`[AutoTag] API ${res.status}: ${err}`);
  }

  const data = await res.json();

  // Read real token counts and log estimated cost
  const usage: TokenUsage = data.usage ?? { input_tokens: 0, output_tokens: 0 };
  logCost(usage, "AutoTag");

  // With tool_choice forced, content[0] is guaranteed to be a tool_use block
  const toolBlock = data.content?.find((c: { type: string }) => c.type === "tool_use");
  const rawTags: { tags: Record<string, string[]> } =
    toolBlock?.input ?? { tags: {} };

  // Convert string keys ("0", "1", …) to numeric keys
  const tagsByIndex: Record<number, string[]> = {};
  for (const [key, val] of Object.entries(rawTags.tags ?? {})) {
    const n = Number(key);
    if (!isNaN(n) && Array.isArray(val)) {
      tagsByIndex[n] = val;
    }
  }

  return { tagsByIndex, usage };
}

// ── Semantic search ───────────────────────────────────────────────────────────

/** One item in the content library, used as search input */
export interface SearchItem {
  /** 0-based index in the caller's content array */
  index: number;
  type: string;
  title: string;
}

/**
 * One entry in a ranked search result list.
 * Having both score and reason enables:
 *   • Better UX (most relevant first, with explanation)
 *   • MRR / NDCG metric computation for dissertation evaluation
 *   • Direct comparison with unranked keyword search
 */
export interface RankedResult {
  /** 0-based index into the original SearchItem array */
  index: number;
  /** Relevance between 0.0 (unrelated) and 1.0 (perfect match) */
  score: number;
  /** One sentence explaining why this item matches the query */
  reason: string;
}

export interface SearchResponse {
  /** Results sorted by score descending (most relevant first) */
  results: RankedResult[];
  usage: TokenUsage;
}

/**
 * Sends a natural-language query to Claude and receives a ranked result list.
 *
 * Prompt strategy:
 *   - System message tells Claude to think about intent (not keywords) and
 *     to apply a minimum score threshold so irrelevant items are excluded.
 *   - tool_choice forces rank_search_results, guaranteeing the schema
 *     (integer index, 0-1 score, string reason) for every returned item.
 *
 * WHY a threshold (score > 0.2) in the system prompt:
 *   Without a threshold, Claude tends to include weakly related items.
 *   0.2 is a practical cut-off that balances recall vs. precision.
 */
export async function callSearchAPI(
  query: string,
  items: SearchItem[],
  apiKey: string
): Promise<SearchResponse> {
  const list = items
    .map((it) => `${it.index}. [${it.type.toUpperCase()}] ${it.title}`)
    .join("\n");

  const body = {
    model: CLAUDE_MODEL,
    max_tokens: 1024,
    system:
      `You are a semantic search engine for a personal content library. ` +
      `Given a query and a list of saved items, return ALL items that are ` +
      `relevantly related, ranked from most to least relevant. ` +
      `Think about meaning and intent — "coding stuff" should match programming ` +
      `tutorials even if the word "coding" does not appear in the title. ` +
      `Assign a relevance score between 0.0 (unrelated) and 1.0 (perfect match). ` +
      `Only include items with score > 0.2. ` +
      `Return an empty results array if nothing is relevant.`,
    tools: [
      {
        name: "rank_search_results",
        description: "Return content items ranked by relevance to the search query.",
        input_schema: {
          type: "object",
          properties: {
            results: {
              type: "array",
              description:
                "Items ranked most-to-least relevant. Omit items with score ≤ 0.2.",
              items: {
                type: "object",
                properties: {
                  index: {
                    type: "integer",
                    description: "0-based index from the provided content list",
                  },
                  score: {
                    type: "number",
                    description: "Relevance score 0.0–1.0",
                    minimum: 0,
                    maximum: 1,
                  },
                  reason: {
                    type: "string",
                    description:
                      "One sentence explaining why this item matches the query",
                  },
                },
                required: ["index", "score", "reason"],
              },
            },
          },
          required: ["results"],
        },
      },
    ],
    tool_choice: { type: "tool", name: "rank_search_results" },
    messages: [
      {
        role: "user",
        content: `Query: "${query}"\n\nContent library:\n${list}`,
      },
    ],
  };

  const res = await fetch(CLAUDE_URL, {
    method: "POST",
    headers: claudeHeaders(apiKey),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`[Search] API ${res.status}: ${err}`);
  }

  const data = await res.json();

  const usage: TokenUsage = data.usage ?? { input_tokens: 0, output_tokens: 0 };
  logCost(usage, "SmartSearch");

  const toolBlock = data.content?.find((c: { type: string }) => c.type === "tool_use");
  const raw: { results: RankedResult[] } = toolBlock?.input ?? { results: [] };

  // Defensive sort — Claude should already rank, but enforce it
  const results = (raw.results ?? [])
    .filter(
      (r) =>
        typeof r.index === "number" &&
        r.index >= 0 &&
        r.index < items.length &&
        typeof r.score === "number"
    )
    .sort((a, b) => b.score - a.score);

  return { results, usage };
}

// ── Keyword search (no API) ───────────────────────────────────────────────────

/**
 * Pure client-side keyword search — zero latency, no API cost.
 *
 * Returns the 0-based indices of matching items in their original order
 * (no relevance ranking).
 *
 * WHY keep this alongside the AI search:
 *   (a) Works without an API key (graceful degradation).
 *   (b) Provides the baseline for the AI vs. keyword comparison
 *       in the dissertation evaluation.
 *   (c) Instant feedback while an AI search call is in flight.
 */
export function runKeywordSearch(query: string, items: SearchItem[]): number[] {
  const lower = query.toLowerCase();
  return items
    .filter(
      (it) =>
        it.title.toLowerCase().includes(lower) ||
        it.type.toLowerCase().includes(lower)
    )
    .map((it) => it.index);
}
