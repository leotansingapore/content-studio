# Trend scout (CI)

The `/trends` page renders a static file, [`src/data/trends.json`](../src/data/trends.json).
A GitHub Actions job refreshes that file every morning by studying what's
trending worldwide and rewriting each trend into content a Singapore AIA
financial consultant can post — hooks, talking points, and a CTA.

- **Workflow:** [`.github/workflows/trend-scout.yml`](../.github/workflows/trend-scout.yml)
- **Generator:** [`scripts/trend-scout.mjs`](../scripts/trend-scout.mjs)

## How it works

1. Runs daily at **22:00 UTC (06:00 SGT)**, or on demand via **Actions → Trend
   scout → Run workflow**.
2. Calls the Claude API (`claude-opus-4-8`) with the **web search** tool so the
   trends are grounded in real, current events — not the model's memory.
3. Validates and normalises the model's output against the `TrendEntry` shape
   (enums, required fields, real `source_url`), stamps `date_found` /
   `observed_at` to today (SGT), assigns stable ids, and de-dupes.
4. Writes `src/data/trends.json` **only if** at least `TREND_MIN` (default 12)
   valid trends survive — a thin or failed run never overwrites the last good
   drop.
5. Commits to `main`; Vercel's git integration deploys the updated page.

## Enabling it

The job needs one repo secret. Without it, the job fails fast and writes nothing.

1. GitHub → the repo → **Settings → Secrets and variables → Actions → New
   repository secret**.
2. Name: `ANTHROPIC_API_KEY` — value: an Anthropic API key
   (console.anthropic.com → API keys).
3. Test it: **Actions → Trend scout → Run workflow** (optionally set a smaller
   `count` for a cheap first run).

## Running locally

```bash
ANTHROPIC_API_KEY=sk-ant-... TREND_COUNT=6 node scripts/trend-scout.mjs
```

| Env var | Default | Purpose |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | — | Required. Anthropic API key. |
| `TREND_COUNT` | `24` | Target number of trends. |
| `TREND_MIN` | `12` | Minimum valid trends, or the run fails without writing. |
| `TREND_MODEL` | `claude-opus-4-8` | Model id. |

The JSON parse / validate / finalize functions in `trend-scout.mjs` are pure and
exported, so they can be exercised without spending API quota.
