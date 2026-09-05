/**
 * EvalHarness — in-browser evaluation page for the AI pipeline.
 *
 * What it measures:
 *   Tags:   Precision, Recall, F1 per item, plus macro & micro averages.
 *   Search: MRR (Mean Reciprocal Rank) and NDCG@5 for both AI semantic and
 *           keyword search, so you can compare them directly.
 *
 * How to use:
 *   1. Fill in public/eval/ground-truth.json (see eval/README.md).
 *   2. Navigate to /eval.
 *   3. Click the eval buttons.  Results appear on-screen and can be
 *      downloaded as a timestamped JSON file.
 *
 * IMPORTANT: This page calls the live Claude API and incurs real costs.
 *            The per-call cost is logged to the browser console.
 */
import { useState } from "react";
import { callTaggingAPI, callSearchAPI, runKeywordSearch } from "../ai/prompts";
import type { TaggingItem, SearchItem, RankedResult } from "../ai/prompts";

// ── Ground-truth types ────────────────────────────────────────────────────────

interface GTItem {
  _example?: string;
  id: string;
  title: string;
  link: string;
  type: string;
  metadata?: { author?: string; provider?: string };
  correct_tags: string[];
}

interface GTQuery {
  _example?: string;
  id: string;
  query: string;
  relevant_item_ids: string[];
}

interface GroundTruth {
  items:   GTItem[];
  queries: GTQuery[];
}

// ── Metric helpers ────────────────────────────────────────────────────────────

interface PRF1 {
  precision: number;
  recall:    number;
  f1:        number;
  tp: number; fp: number; fn: number;
}

function computePRF1(predicted: string[], correct: string[]): PRF1 {
  const pSet = new Set(predicted);
  const cSet = new Set(correct);
  const tp   = [...pSet].filter((t) => cSet.has(t)).length;
  const fp   = pSet.size - tp;
  const fn   = cSet.size - tp;
  const p    = tp + fp === 0 ? 1 : tp / (tp + fp); // precision = 1 when nothing predicted but nothing expected
  const r    = tp + fn === 0 ? 1 : tp / (tp + fn);
  const f1   = p + r === 0 ? 0 : (2 * p * r) / (p + r);
  return { precision: p, recall: r, f1, tp, fp, fn };
}

/**
 * MRR — Mean Reciprocal Rank.
 * For each query, finds the rank of the first relevant result.
 * rankedIds: result IDs in order (best first).
 * relevantIds: set of IDs considered relevant.
 */
function reciprocalRank(rankedIds: string[], relevantIds: Set<string>): number {
  for (let i = 0; i < rankedIds.length; i++) {
    if (relevantIds.has(rankedIds[i])) return 1 / (i + 1);
  }
  return 0;
}

/**
 * NDCG@k — Normalised Discounted Cumulative Gain at cutoff k.
 * Assumes binary relevance (1 if relevant, 0 if not).
 */
function ndcgAtK(rankedIds: string[], relevantIds: Set<string>, k: number): number {
  const dcg = rankedIds
    .slice(0, k)
    .reduce((acc, id, i) => acc + (relevantIds.has(id) ? 1 / Math.log2(i + 2) : 0), 0);
  const idealCount = Math.min(relevantIds.size, k);
  const idcg = Array.from({ length: idealCount }, (_, i) => 1 / Math.log2(i + 2)).reduce(
    (a, b) => a + b,
    0
  );
  return idcg === 0 ? 1 : dcg / idcg;
}

function pct(n: number): string {
  return (n * 100).toFixed(1) + "%";
}

// ── Component ─────────────────────────────────────────────────────────────────

interface TagResult {
  itemId:    string;
  title:     string;
  predicted: string[];
  correct:   string[];
  metrics:   PRF1;
}

interface SearchQueryResult {
  queryId:      string;
  query:        string;
  relevantIds:  string[];
  aiRanked:     string[];  // item IDs ordered by Claude's score
  kwRanked:     string[];  // item IDs in keyword order
  aiRR:         number;
  kwRR:         number;
  aiNDCG5:      number;
  kwNDCG5:      number;
}

interface EvalResults {
  timestamp:    string;
  model:        string;
  tagResults:   TagResult[];
  searchResults: SearchQueryResult[];
  macroTag: PRF1;
  microTag: PRF1;
  aiMRR:    number;
  kwMRR:    number;
  aiMeanNDCG5: number;
  kwMeanNDCG5: number;
}

export default function EvalHarness() {
  const [gt,         setGt]         = useState<GroundTruth | null>(null);
  const [loadError,  setLoadError]  = useState<string | null>(null);
  const [tagLoading, setTagLoading] = useState(false);
  const [srchLoading, setSrchLoading] = useState(false);
  const [progress,   setProgress]   = useState("");
  const [results,    setResults]    = useState<EvalResults | null>(null);

  // ── Load ground truth ────────────────────────────────────────────────────

  async function loadGroundTruth() {
    setLoadError(null);
    setResults(null);
    try {
      const res  = await fetch("/eval/ground-truth.json");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw: GroundTruth = await res.json();
      // Filter out example rows
      const items   = raw.items.filter((it) => !it._example);
      const queries = raw.queries.filter((q) => !q._example);
      setGt({ items, queries });
    } catch (e) {
      setLoadError(`Could not load ground-truth.json: ${String(e)}`);
    }
  }

  // ── Run tagging evaluation ────────────────────────────────────────────────

  async function runTagEval() {
    if (!gt || tagLoading) return;
    const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
    if (!apiKey) {
      alert("No VITE_ANTHROPIC_API_KEY found. Add it to .env and restart.");
      return;
    }

    setTagLoading(true);
    setProgress("Calling Claude for tags…");

    try {
      const items: TaggingItem[] = gt.items.map((it, i) => ({
        index:  i,
        type:   it.type,
        title:  it.title,
        author: it.metadata?.author,
      }));

      const { tagsByIndex } = await callTaggingAPI(items, apiKey);

      const tagResults: TagResult[] = gt.items.map((it, i) => {
        const predicted = tagsByIndex[i] ?? [];
        const metrics   = computePRF1(predicted, it.correct_tags);
        return { itemId: it.id, title: it.title, predicted, correct: it.correct_tags, metrics };
      });

      // Macro average: mean of per-item P/R/F1
      const macro: PRF1 = {
        precision: tagResults.reduce((a, r) => a + r.metrics.precision, 0) / tagResults.length,
        recall:    tagResults.reduce((a, r) => a + r.metrics.recall,    0) / tagResults.length,
        f1:        tagResults.reduce((a, r) => a + r.metrics.f1,        0) / tagResults.length,
        tp: 0, fp: 0, fn: 0,
      };

      // Micro average: pool all TPs/FPs/FNs then compute
      const totalTP = tagResults.reduce((a, r) => a + r.metrics.tp, 0);
      const totalFP = tagResults.reduce((a, r) => a + r.metrics.fp, 0);
      const totalFN = tagResults.reduce((a, r) => a + r.metrics.fn, 0);
      const micro: PRF1 = computePRF1(
        Array(totalTP + totalFP).fill("x"),
        Array(totalTP + totalFN).fill("x")
      );
      micro.tp = totalTP; micro.fp = totalFP; micro.fn = totalFN;

      setResults((prev) => ({
        ...(prev ?? {
          timestamp: new Date().toISOString(),
          model:     "claude-haiku-4-5-20251001",
          searchResults: [], aiMRR: 0, kwMRR: 0, aiMeanNDCG5: 0, kwMeanNDCG5: 0,
        }),
        tagResults,
        macroTag: macro,
        microTag: micro,
        timestamp: new Date().toISOString(),
        model: "claude-haiku-4-5-20251001",
      } as EvalResults));

      setProgress("Tagging evaluation complete.");
    } catch (e) {
      setProgress(`Error: ${String(e)}`);
    } finally {
      setTagLoading(false);
    }
  }

  // ── Run search evaluation ─────────────────────────────────────────────────

  async function runSearchEval() {
    if (!gt || srchLoading) return;
    const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
    if (!apiKey) {
      alert("No VITE_ANTHROPIC_API_KEY found. Add it to .env and restart.");
      return;
    }

    setSrchLoading(true);
    const items: SearchItem[] = gt.items.map((it, i) => ({
      index: i,
      type:  it.type,
      title: it.title,
    }));
    // Map position index → item id (needed to check relevance)
    const indexToId: Record<number, string> = {};
    gt.items.forEach((it, i) => { indexToId[i] = it.id; });

    const searchQueryResults: SearchQueryResult[] = [];

    for (let qi = 0; qi < gt.queries.length; qi++) {
      const q   = gt.queries[qi];
      const rel = new Set(q.relevant_item_ids);
      setProgress(`Search eval: query ${qi + 1} / ${gt.queries.length} — "${q.query}"`);

      // AI search
      let aiRankedResults: RankedResult[] = [];
      try {
        const { results } = await callSearchAPI(q.query, items, apiKey);
        aiRankedResults = results;
      } catch (e) {
        console.error("[Eval] AI search failed for query:", q.query, e);
      }

      // Keyword search (synchronous)
      const kwIndices = runKeywordSearch(q.query, items);

      const aiRankedIds = aiRankedResults.map((r) => indexToId[r.index] ?? "");
      const kwRankedIds = kwIndices.map((i) => indexToId[i] ?? "");

      searchQueryResults.push({
        queryId:     q.id,
        query:       q.query,
        relevantIds: q.relevant_item_ids,
        aiRanked:    aiRankedIds,
        kwRanked:    kwRankedIds,
        aiRR:        reciprocalRank(aiRankedIds, rel),
        kwRR:        reciprocalRank(kwRankedIds, rel),
        aiNDCG5:     ndcgAtK(aiRankedIds, rel, 5),
        kwNDCG5:     ndcgAtK(kwRankedIds, rel, 5),
      });
    }

    const n = searchQueryResults.length || 1;
    const aiMRR        = searchQueryResults.reduce((a, r) => a + r.aiRR,    0) / n;
    const kwMRR        = searchQueryResults.reduce((a, r) => a + r.kwRR,    0) / n;
    const aiMeanNDCG5  = searchQueryResults.reduce((a, r) => a + r.aiNDCG5, 0) / n;
    const kwMeanNDCG5  = searchQueryResults.reduce((a, r) => a + r.kwNDCG5, 0) / n;

    setResults((prev) => ({
      ...(prev ?? {
        timestamp: new Date().toISOString(),
        model:     "claude-haiku-4-5-20251001",
        tagResults: [], macroTag: { precision: 0, recall: 0, f1: 0, tp: 0, fp: 0, fn: 0 },
        microTag:   { precision: 0, recall: 0, f1: 0, tp: 0, fp: 0, fn: 0 },
      }),
      searchResults: searchQueryResults,
      aiMRR, kwMRR, aiMeanNDCG5, kwMeanNDCG5,
      timestamp: new Date().toISOString(),
      model: "claude-haiku-4-5-20251001",
    } as EvalResults));

    setSrchLoading(false);
    setProgress("Search evaluation complete.");
  }

  // ── Download results ──────────────────────────────────────────────────────

  function downloadResults() {
    if (!results) return;
    const blob = new Blob([JSON.stringify(results, null, 2)], {
      type: "application/json",
    });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `eval-results-${results.timestamp.replace(/[:.]/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const hasTagResults  = results && results.tagResults.length > 0;
  const hasSrchResults = results && results.searchResults.length > 0;

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            Evaluation Harness
          </h1>
          <p className="mt-2 text-gray-600 text-sm">
            Runs the real AI tagging and search functions against your ground-truth
            data and computes Precision / Recall / F1 (tags) and MRR / NDCG@5
            (search).  See <code className="bg-gray-100 px-1 rounded">eval/README.md</code> for
            how to fill in the ground truth before running.
          </p>
          <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
            <strong>Cost warning:</strong> Each click makes live Claude API calls.
            Token counts and estimated USD cost are printed to the browser console.
          </div>
        </div>

        {/* Load ground truth */}
        <section className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
          <h2 className="font-semibold text-gray-800 mb-3">1. Load Ground Truth</h2>
          <button
            onClick={loadGroundTruth}
            className="bg-gray-800 hover:bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            Load /eval/ground-truth.json
          </button>
          {loadError && <p className="mt-2 text-red-600 text-sm">{loadError}</p>}
          {gt && (
            <p className="mt-2 text-green-700 text-sm">
              ✓ Loaded {gt.items.length} item{gt.items.length !== 1 ? "s" : ""} and{" "}
              {gt.queries.length} quer{gt.queries.length !== 1 ? "ies" : "y"}.
            </p>
          )}
        </section>

        {/* Run buttons */}
        <section className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
          <h2 className="font-semibold text-gray-800 mb-3">2. Run Evaluations</h2>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={runTagEval}
              disabled={!gt || tagLoading}
              className="bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white px-4 py-2 rounded-lg text-sm font-medium"
            >
              {tagLoading ? "Running…" : "Run Tagging Eval (P/R/F1)"}
            </button>
            <button
              onClick={runSearchEval}
              disabled={!gt || srchLoading}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white px-4 py-2 rounded-lg text-sm font-medium"
            >
              {srchLoading ? "Running…" : "Run Search Eval (MRR / NDCG)"}
            </button>
            {results && (
              <button
                onClick={downloadResults}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
              >
                ↓ Download Results JSON
              </button>
            )}
          </div>
          {progress && (
            <p className="mt-2 text-xs text-gray-500">{progress}</p>
          )}
        </section>

        {/* Tagging results */}
        {hasTagResults && (
          <section className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
            <h2 className="font-semibold text-gray-800 mb-4">
              Tagging Results — Precision / Recall / F1
            </h2>

            {/* Aggregate */}
            <div className="grid grid-cols-2 gap-4 mb-5">
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-xs text-gray-500 mb-1 font-medium uppercase">
                  Macro average (mean of per-item)
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  {(["precision", "recall", "f1"] as const).map((k) => (
                    <div key={k}>
                      <div className="text-lg font-bold text-purple-700">
                        {pct(results!.macroTag[k])}
                      </div>
                      <div className="text-[10px] text-gray-400 capitalize">{k}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-xs text-gray-500 mb-1 font-medium uppercase">
                  Micro average (pooled TP/FP/FN)
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  {(["precision", "recall", "f1"] as const).map((k) => (
                    <div key={k}>
                      <div className="text-lg font-bold text-purple-700">
                        {pct(results!.microTag[k])}
                      </div>
                      <div className="text-[10px] text-gray-400 capitalize">{k}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Per-item table */}
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-100">
                  <th className="pb-1 pr-2">Item</th>
                  <th className="pb-1 pr-2">Predicted tags</th>
                  <th className="pb-1 pr-2">Correct tags</th>
                  <th className="pb-1 text-right">P</th>
                  <th className="pb-1 text-right">R</th>
                  <th className="pb-1 text-right">F1</th>
                </tr>
              </thead>
              <tbody>
                {results!.tagResults.map((r) => (
                  <tr key={r.itemId} className="border-b border-gray-50">
                    <td className="py-1 pr-2 text-gray-700 max-w-[180px] truncate">
                      {r.title}
                    </td>
                    <td className="py-1 pr-2 text-purple-700">
                      {r.predicted.join(", ")}
                    </td>
                    <td className="py-1 pr-2 text-green-700">
                      {r.correct.join(", ")}
                    </td>
                    <td className="py-1 text-right">{pct(r.metrics.precision)}</td>
                    <td className="py-1 text-right">{pct(r.metrics.recall)}</td>
                    <td className="py-1 text-right font-medium">{pct(r.metrics.f1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {/* Search results */}
        {hasSrchResults && (
          <section className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
            <h2 className="font-semibold text-gray-800 mb-4">
              Search Results — MRR &amp; NDCG@5
            </h2>

            {/* Aggregate */}
            <div className="grid grid-cols-2 gap-4 mb-5">
              <div className="bg-blue-50 rounded-lg p-3">
                <div className="text-xs text-blue-600 mb-1 font-medium uppercase">
                  ✨ AI Semantic Search
                </div>
                <div className="grid grid-cols-2 gap-2 text-center">
                  <div>
                    <div className="text-lg font-bold text-blue-700">
                      {results!.aiMRR.toFixed(3)}
                    </div>
                    <div className="text-[10px] text-gray-400">MRR</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold text-blue-700">
                      {results!.aiMeanNDCG5.toFixed(3)}
                    </div>
                    <div className="text-[10px] text-gray-400">NDCG@5</div>
                  </div>
                </div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-xs text-gray-500 mb-1 font-medium uppercase">
                  🔤 Keyword Search
                </div>
                <div className="grid grid-cols-2 gap-2 text-center">
                  <div>
                    <div className="text-lg font-bold text-gray-700">
                      {results!.kwMRR.toFixed(3)}
                    </div>
                    <div className="text-[10px] text-gray-400">MRR</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold text-gray-700">
                      {results!.kwMeanNDCG5.toFixed(3)}
                    </div>
                    <div className="text-[10px] text-gray-400">NDCG@5</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Per-query table */}
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-100">
                  <th className="pb-1 pr-2">Query</th>
                  <th className="pb-1 text-right pr-2">AI RR</th>
                  <th className="pb-1 text-right pr-2">KW RR</th>
                  <th className="pb-1 text-right pr-2">AI NDCG@5</th>
                  <th className="pb-1 text-right">KW NDCG@5</th>
                </tr>
              </thead>
              <tbody>
                {results!.searchResults.map((r) => (
                  <tr key={r.queryId} className="border-b border-gray-50">
                    <td className="py-1 pr-2 text-gray-700">"{r.query}"</td>
                    <td className={`py-1 text-right pr-2 font-medium ${r.aiRR > r.kwRR ? "text-blue-600" : "text-gray-600"}`}>
                      {r.aiRR.toFixed(3)}
                    </td>
                    <td className={`py-1 text-right pr-2 font-medium ${r.kwRR > r.aiRR ? "text-blue-600" : "text-gray-600"}`}>
                      {r.kwRR.toFixed(3)}
                    </td>
                    <td className={`py-1 text-right pr-2 font-medium ${r.aiNDCG5 > r.kwNDCG5 ? "text-blue-600" : "text-gray-600"}`}>
                      {r.aiNDCG5.toFixed(3)}
                    </td>
                    <td className={`py-1 text-right font-medium ${r.kwNDCG5 > r.aiNDCG5 ? "text-blue-600" : "text-gray-600"}`}>
                      {r.kwNDCG5.toFixed(3)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {!hasTagResults && !hasSrchResults && !loadError && (
          <p className="text-sm text-gray-400 text-center mt-10">
            Load the ground truth and run an evaluation to see results here.
          </p>
        )}
      </div>
    </div>
  );
}
