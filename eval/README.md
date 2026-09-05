# Evaluation Harness

This directory documents the offline evaluation setup for the Brainly AI pipeline.
The actual evaluation runs **in the browser** at `/eval` — there is no separate Node script because the app is frontend-only and all AI calls go directly to the Anthropic API.

---

## What is evaluated

| Feature | Metric |
|---|---|
| Auto-tagging | Precision, Recall, F1 per item + macro & micro averages |
| AI semantic search | MRR (Mean Reciprocal Rank), NDCG@5 |
| Keyword search | MRR, NDCG@5 (baseline for comparison) |

---

## Files

| File | Purpose |
|---|---|
| `public/eval/ground-truth.json` | Data you fill in — items with correct tags, queries with relevant item IDs |
| `src/pages/EvalHarness.tsx` | React page that runs the eval and shows results |
| `eval/README.md` | This file |

---

## Step-by-step

### 1. Fill in the ground truth

Open `public/eval/ground-truth.json`.

**Delete every row that has `"_example": "DELETE THIS ROW"` — they are placeholders only.**

Then add your own data.

#### Items (for tagging evaluation)

```json
{
  "id": "unique-string-you-choose",
  "title": "Exact title of the saved item",
  "link": "https://...",
  "type": "youtube",
  "metadata": { "author": "Channel name", "provider": "YouTube" },
  "correct_tags": ["programming", "education"]
}
```

- `id` — any unique string; used to match query results
- `type` — `"youtube"` or `"twitter"`
- `metadata.author` — channel/username (optional but improves tagging quality)
- `correct_tags` — YOUR judgement of which tags from the 18-tag vocabulary are correct

The 18 allowed tags are:
`programming · design · finance · music · sports · news · humor · science · health · business · education · entertainment · technology · politics · art · cooking · travel · gaming`

#### Queries (for search evaluation)

```json
{
  "id": "q-1",
  "query": "The search query string",
  "relevant_item_ids": ["id-of-relevant-item-1", "id-of-relevant-item-2"]
}
```

- `query` — natural-language query as a user would type it
- `relevant_item_ids` — YOUR judgement: which items from the `items` array are truly relevant to this query (by their `id` fields)

**Recommendation:** use at least 10 items and 5 queries for meaningful metrics.

---

### 2. Run the evaluation

1. Start the dev server: `npm run dev`
2. Open [http://localhost:5173/eval](http://localhost:5173/eval)
3. Click **Load /eval/ground-truth.json**
4. Click **Run Tagging Eval** (calls Claude once for all items)
5. Click **Run Search Eval** (calls Claude once per query — watch the console for cost logs)
6. Click **↓ Download Results JSON** to save the output

---

### 3. Understanding the metrics

#### Tagging — Precision, Recall, F1

For each item:
- **Precision** = (correctly predicted tags) / (all predicted tags) — are the predicted tags accurate?
- **Recall** = (correctly predicted tags) / (all correct tags) — are all correct tags found?
- **F1** = harmonic mean of P and R

**Macro average** — mean of per-item P/R/F1 (treats every item equally)
**Micro average** — pools all TP/FP/FN counts (items with more tags have more weight)

Values range from 0 to 1 (shown as %). Higher is better.

#### Search — MRR and NDCG@5

**MRR (Mean Reciprocal Rank)**
- For each query, finds the first relevant result and scores `1 / rank`
- A first-position hit scores 1.0; second scores 0.5; third scores 0.33; etc.
- Mean over all queries. Ranges 0–1; higher is better.

**NDCG@5 (Normalised Discounted Cumulative Gain at cutoff 5)**
- Measures ranking quality considering the top-5 results
- Perfect ranking (all relevant items at the top) = 1.0
- Ranges 0–1; higher is better

The table highlights the better score (AI vs keyword) in blue for each query.

---

### 4. Saving and comparing runs

Download results after each run. The filename includes a timestamp. Compare across runs by diffing the JSON files or importing them into a spreadsheet.

---

## Notes

- The evaluation calls the live Claude API and incurs real cost. Per-call estimates are logged to the browser console — open DevTools > Console before running.
- The eval runs **in-memory** — it does not read or write your saved content in localStorage.
- For the dissertation, run the evaluation at least twice to check for consistency (Claude may give slightly different outputs between runs).
