# Brainly Frontend

A personal second-brain app — save YouTube videos and tweets, auto-tag them with AI, and search your library semantically.

---

## What it does

- Save YouTube videos and Twitter/X links as embedded cards
- **Auto-fill title** — paste a link and the title (and channel name) fills in automatically via free oEmbed APIs
- **AI auto-tagging** — Claude assigns 2–3 topic tags from an 18-category vocabulary; tags are cached in localStorage and not re-generated on reload
- **AI semantic search** — search in natural language; Claude returns results ranked by relevance (0–1 score) with a one-line reason per match
- **Keyword search** — instant client-side substring fallback; also available as a standalone mode for baseline comparison
- **Compare mode** — run AI and keyword search side-by-side on the same query; useful for dissertation evaluation
- **AI chatbot** — floating assistant that answers questions about your saved content
- Filter by content type (YouTube / Twitter) and by tag
- Delete any card; share your entire brain as a base64-encoded URL
- **Evaluation harness** at `/eval` — computes Precision/Recall/F1 (tags) and MRR/NDCG@5 (search) against your own ground-truth data

---

## Architecture (frontend-only by design)

This is a **fully client-side app**. There is no backend, no server, and no database.

| Concern | Solution |
|---|---|
| Content storage | `localStorage` in the browser |
| AI features | Direct `fetch` calls to `api.anthropic.com/v1/messages` from the browser |
| Auth | None required (single-user, local) |
| Sharing | Content is base64-encoded into the URL hash |

The Anthropic API key is stored in a Vite environment variable (`VITE_ANTHROPIC_API_KEY`), which is bundled into the JavaScript at build time.  This is acceptable for demos and academic projects — in production, API calls should be proxied through a backend to keep the key secret.

---

## AI pipeline

### Structured output via tool_use

All AI calls use Claude's **tool_use** (function-calling) feature with `tool_choice` set to force a specific tool.  This guarantees that the API returns a JSON object matching a schema we define — there is no regex parsing of free text and no risk of parse errors.

### Auto-tagging

1. When new content is added, the `useContentTags` hook detects un-tagged items.
2. All un-tagged items are batched into a single Claude call to minimise cost.
3. Each item's title **and** the oEmbed author/channel name are sent — this enriches vague titles (e.g. "Episode 12 | channel: 3Blue1Brown").
4. Claude is constrained to the 18-tag vocabulary via the tool schema's `enum` field.
5. Tags are saved to `localStorage` and are not re-generated on subsequent renders.

### Semantic search

1. The user types a query and selects AI, Keyword, or Compare mode.
2. In AI mode, Claude receives the query and a numbered list of all saved items.
3. Claude returns a ranked list with a 0–1 relevance score and one-line reason per match (tool_use schema enforces the types).
4. Results are displayed in rank order; the score and reason appear below each card.
5. In Keyword mode, a pure substring search runs client-side with no API call.
6. In Compare mode, both paths run in parallel and results appear side-by-side so you can observe differences in coverage and ordering.

### Chatbot

A floating panel that sends the full content inventory as a system prompt and handles free-form conversational queries.

### Cost logging

Every Claude API response includes `usage.input_tokens` and `usage.output_tokens`.  The app reads these and logs an estimated USD cost to the browser console (DevTools > Console).  Per-token prices are defined as named constants in `src/ai/costs.ts` — update them there if pricing changes.

---

## Tech stack

| Layer | Tech |
|---|---|
| Framework | React 19 + TypeScript |
| Styling | Tailwind CSS v4 |
| Routing | React Router v7 |
| Build tool | Vite 7 |
| AI | Anthropic Claude API (`claude-haiku-4-5-20251001`) |
| Storage | `localStorage` |

---

## Getting started

### 1. Clone and install

```bash
git clone <your-repo-url>
cd brainly-frontend
npm install
```

### 2. Add your API key

```bash
cp .env.example .env
# then edit .env and set:
# VITE_ANTHROPIC_API_KEY=sk-ant-...
```

Get a key from [console.anthropic.com](https://console.anthropic.com). The app works without a key — AI features are skipped and keyword search is used as a fallback.

### 3. Run

```bash
npm run dev
# open http://localhost:5173/dashboard
```

---

## Evaluation harness

See `eval/README.md` for the full guide.  Short version:

1. Edit `public/eval/ground-truth.json` — add items with correct tags and queries with relevant item IDs.
2. Open `http://localhost:5173/eval`.
3. Click **Load**, then **Run Tagging Eval** and/or **Run Search Eval**.
4. Download the results JSON.

---

## Project structure

```
src/
├── ai/
│   ├── prompts.ts          # All Claude API calls (tool_use, tagging, search, keyword fallback)
│   └── costs.ts            # Token pricing constants + logCost()
├── types.ts                # Shared Content, RankedContent types
├── pages/
│   ├── Dashboard.tsx       # Main page — content grid + search + state
│   ├── EvalHarness.tsx     # /eval — evaluation page
│   ├── SharedBrainView.tsx # Read-only shared brain view
│   └── Home.tsx
├── components/ui/
│   ├── Card.tsx            # Content card (YouTube embed / tweet)
│   ├── SmartSearch.tsx     # AI / Keyword / Compare search modes
│   ├── CreateContentModal.tsx  # Add content + oEmbed auto-fill
│   ├── AIChatbot.tsx       # Floating conversational assistant
│   └── Sidebar.tsx         # Type + tag filters
├── hooks/
│   └── useContentTags.ts   # Auto-tagging hook
└── utils/
    └── tagStore.ts         # localStorage tag helpers

eval/
└── README.md               # How to fill in ground truth and run evaluation

public/
└── eval/
    └── ground-truth.json   # Template — fill this in before running /eval
```

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `VITE_ANTHROPIC_API_KEY` | For AI features | Claude API key |

---

## Known limitations

- **API key exposed in browser** — the key is bundled into the JS bundle. Fine for demos; use a backend proxy for production.
- **No server-side storage** — all content lives in `localStorage`. Clearing browser data erases everything. No cross-device sync.
- **oEmbed CORS** — Twitter's oEmbed endpoint may be blocked by some browser extensions. Title auto-fill falls back silently.
- **Haiku model** — uses `claude-haiku-4-5-20251001` (fast and cheap). Upgrade to Sonnet for higher-quality tagging/search at higher cost.
- **Evaluation is manual** — the eval harness measures what Claude produces against your personal ground-truth judgements. It does not have a pre-built benchmark dataset.
- **Share links are encoded, not encrypted** — `encodeShare()` is base64, which is trivially reversible. Anyone holding the URL can read the entire brain, and a link cannot be expired or revoked once sent. Large brains may also exceed browser URL length limits.
- **Unused backend routes** — `Signin.tsx`, `Signup.tsx`, and `SharedBrain.tsx` still call `http://localhost:3000`, a server that is intentionally out of scope for this frontend-only project. The `/brain/:hash` route therefore does not resolve; use `/brain/view#<encoded>` instead. These files are retained to show the original client/server design.
- **No retry or backoff** — a rate-limited (429) or overloaded API response surfaces directly to the user rather than being retried. This matters most in the eval harness, which issues requests in quick succession.
