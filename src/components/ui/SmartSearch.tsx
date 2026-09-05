/**
 * SmartSearch — three-mode search component.
 *
 * Modes:
 *   AI       Uses Claude's semantic ranking (callSearchAPI).  Results arrive
 *            ordered most-to-least relevant, each with a 0-1 score and a
 *            one-line reason.  Enables MRR/NDCG metrics.
 *
 *   Keyword  Pure client-side substring match (runKeywordSearch).  Zero
 *            latency, no API cost, unranked.  Provides the baseline for
 *            the dissertation comparison.
 *
 *   Compare  Runs both paths in parallel and shows them side-by-side so
 *            you can directly observe differences in coverage and ordering
 *            for the same query.  The user then chooses which result set
 *            to apply to the main card grid.
 */
import { useState } from "react";
import { callSearchAPI, runKeywordSearch, type SearchItem } from "../../ai/prompts";
import type { Content, RankedContent } from "../../types";

type SearchMode = "ai" | "keyword" | "compare";

interface SmartSearchProps {
  contents: Content[];
  /** Called with ranked results (or null to clear).
   *  RankedContent = Content + optional _score / _reason / _searchMode fields. */
  onResults: (results: RankedContent[] | null) => void;
}

export function SmartSearch({ contents, onResults }: SmartSearchProps) {
  const [query,         setQuery]         = useState("");
  const [loading,       setLoading]       = useState(false);
  const [mode,          setMode]          = useState<SearchMode>("ai");
  const [resultCount,   setResultCount]   = useState<number | null>(null);
  // Used only in compare mode
  const [compareAI,      setCompareAI]      = useState<RankedContent[]>([]);
  const [compareKeyword, setCompareKeyword] = useState<RankedContent[]>([]);
  const [showCompare,    setShowCompare]    = useState(false);

  // Build a SearchItem list — index must equal position in contents array
  const items: SearchItem[] = contents.map((c, i) => ({
    index: i,
    type:  c.type,
    title: c.title,
  }));

  const search = async () => {
    const q = query.trim();
    if (!q || loading) return;

    setLoading(true);
    setResultCount(null);
    setShowCompare(false);

    const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;

    // ── Keyword mode (or no API key — graceful degradation) ──────────────
    if (mode === "keyword" || !apiKey) {
      const indices  = runKeywordSearch(q, items);
      const results: RankedContent[] = indices.map((i) => ({
        ...contents[i],
        _searchMode: "keyword" as const,
      }));
      setResultCount(results.length);
      onResults(results);
      setLoading(false);
      return;
    }

    try {
      // ── AI mode ──────────────────────────────────────────────────────────
      if (mode === "ai") {
        const { results: ranked } = await callSearchAPI(q, items, apiKey);
        const results: RankedContent[] = ranked.map((r) => ({
          ...contents[r.index],
          _score:      r.score,
          _reason:     r.reason,
          _searchMode: "ai" as const,
        }));
        setResultCount(results.length);
        onResults(results);
      }

      // ── Compare mode ─────────────────────────────────────────────────────
      else {
        // Keyword is synchronous; AI is async — run them together
        const kwIndices = runKeywordSearch(q, items);
        const { results: ranked } = await callSearchAPI(q, items, apiKey);

        const aiResults: RankedContent[] = ranked.map((r) => ({
          ...contents[r.index],
          _score:      r.score,
          _reason:     r.reason,
          _searchMode: "ai" as const,
        }));
        const kwResults: RankedContent[] = kwIndices.map((i) => ({
          ...contents[i],
          _searchMode: "keyword" as const,
        }));

        setCompareAI(aiResults);
        setCompareKeyword(kwResults);
        setShowCompare(true);
        // Don't call onResults yet — the user picks which set to apply
      }
    } catch {
      // On any error, fall back to keyword search so the UI stays usable
      const indices  = runKeywordSearch(q, items);
      const results: RankedContent[] = indices.map((i) => ({
        ...contents[i],
        _searchMode: "keyword" as const,
      }));
      setResultCount(results.length);
      onResults(results);
    } finally {
      setLoading(false);
    }
  };

  const clear = () => {
    setQuery("");
    setResultCount(null);
    setShowCompare(false);
    setCompareAI([]);
    setCompareKeyword([]);
    onResults(null);
  };

  // Apply one side of the compare panel to the main grid
  const applyResults = (results: RankedContent[]) => {
    onResults(results);
    setResultCount(results.length);
    setShowCompare(false);
  };

  // ── Rendering ─────────────────────────────────────────────────────────────

  const modeLabels: Record<SearchMode, string> = {
    ai:      "✨ AI Search",
    keyword: "🔤 Keyword",
    compare: "⚖️ Compare",
  };

  const placeholders: Record<SearchMode, string> = {
    ai:      'AI Search — try "coding tutorials" or "funny tweets"',
    keyword: "Keyword — exact substring match",
    compare: "Compare AI vs keyword — enter any query",
  };

  return (
    <div className="mb-6">
      {/* Mode selector */}
      <div className="flex gap-1 mb-2">
        {(["ai", "keyword", "compare"] as SearchMode[]).map((m) => (
          <button
            key={m}
            onClick={() => { setMode(m); setShowCompare(false); }}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
              mode === m
                ? "bg-purple-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {modeLabels[m]}
          </button>
        ))}
      </div>

      {/* Search bar */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
            placeholder={placeholders[mode]}
            className="w-full pl-4 pr-8 py-2.5 border border-gray-300 rounded-xl text-sm outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 bg-white"
          />
          {query && (
            <button
              onClick={clear}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 text-xs"
            >
              ✕
            </button>
          )}
        </div>
        <button
          onClick={search}
          disabled={loading || !query.trim()}
          className="bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-colors whitespace-nowrap"
        >
          {loading ? "Searching…" : "Search"}
        </button>
      </div>

      {/* Result count — shown in AI / Keyword mode */}
      {resultCount !== null && !showCompare && (
        <p className="text-xs text-gray-500 mt-1.5 ml-1">
          {resultCount === 0
            ? "No matches found."
            : `${resultCount} result${resultCount === 1 ? "" : "s"} for "${query}".`}
          <button onClick={clear} className="ml-2 text-purple-600 hover:underline">
            Clear
          </button>
        </p>
      )}

      {/* ── Compare panel ──────────────────────────────────────────────── */}
      {showCompare && (
        <div className="mt-3 border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
          {/* Header */}
          <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-600">
              Comparison for "{query}"
            </span>
            <button
              onClick={clear}
              className="text-xs text-gray-400 hover:text-gray-700"
            >
              ✕ Clear
            </button>
          </div>

          {/* Two columns */}
          <div className="grid grid-cols-2 divide-x divide-gray-200">
            {/* Keyword column */}
            <div className="p-3">
              <div className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">
                🔤 Keyword ({compareKeyword.length})
              </div>
              {compareKeyword.length === 0 ? (
                <p className="text-xs text-gray-400 italic">No keyword matches</p>
              ) : (
                <ol className="space-y-1.5">
                  {compareKeyword.slice(0, 8).map((r, i) => (
                    <li key={i} className="text-xs text-gray-700 flex items-start gap-1">
                      <span className="text-gray-400 shrink-0">{i + 1}.</span>
                      <span
                        className={`shrink-0 inline-block px-1 rounded text-[10px] ${
                          r.type === "youtube"
                            ? "bg-red-50 text-red-600"
                            : "bg-blue-50 text-blue-600"
                        }`}
                      >
                        {r.type}
                      </span>
                      <span className="truncate">{r.title}</span>
                    </li>
                  ))}
                </ol>
              )}
              <button
                onClick={() => applyResults(compareKeyword)}
                className="mt-3 w-full text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 py-1.5 rounded-lg transition-colors"
              >
                Apply keyword results →
              </button>
            </div>

            {/* AI column */}
            <div className="p-3">
              <div className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">
                ✨ AI Semantic ({compareAI.length})
              </div>
              {compareAI.length === 0 ? (
                <p className="text-xs text-gray-400 italic">No AI matches</p>
              ) : (
                <ol className="space-y-2">
                  {compareAI.slice(0, 8).map((r, i) => (
                    <li key={i} className="text-xs text-gray-700">
                      <div className="flex items-center gap-1">
                        <span className="text-gray-400 shrink-0">{i + 1}.</span>
                        <span
                          className={`shrink-0 inline-block px-1 rounded text-[10px] ${
                            r.type === "youtube"
                              ? "bg-red-50 text-red-600"
                              : "bg-blue-50 text-blue-600"
                          }`}
                        >
                          {r.type}
                        </span>
                        {r._score !== undefined && (
                          <span className="ml-auto shrink-0 font-mono text-[10px] text-purple-600">
                            {(r._score * 100).toFixed(0)}%
                          </span>
                        )}
                      </div>
                      <div className="truncate mt-0.5">{r.title}</div>
                      {r._reason && (
                        <div className="text-[10px] text-gray-400 truncate mt-0.5 italic">
                          {r._reason}
                        </div>
                      )}
                    </li>
                  ))}
                </ol>
              )}
              <button
                onClick={() => applyResults(compareAI)}
                className="mt-3 w-full text-xs bg-purple-50 hover:bg-purple-100 text-purple-700 py-1.5 rounded-lg transition-colors"
              >
                Apply AI results →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
