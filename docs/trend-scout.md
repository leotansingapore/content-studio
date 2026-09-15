# Trend scout (CI)

The `/trends` page renders a static file, [`src/data/trends.json`](../src/data/trends.json).
A GitHub Actions job refreshes it every morning from **real posts that are
going viral on TikTok and Instagram**, then rewrites each one into content a
Singapore AIA financial consultant can post: hooks, talking points and a CTA.

- **Workflow:** [`.github/workflows/trend-scout.yml`](../.github/workflows/trend-scout.yml)
- **Generator:** [`scripts/trend-scout.mjs`](../scripts/trend-scout.mjs)
- **Tests:** [`scripts/trend-scout.test.mjs`](../scripts/trend-scout.test.mjs) (run by CI)

## How it works

1. Runs daily at **02:00 UTC (10:00 SGT)**, or on demand via **Actions → Trend
   scout → Run workflow**.
2. Scrapes posts via Apify, three actor runs in parallel:
   - `apify~instagram-hashtag-scraper`: finance hashtags (`IG_HASHTAGS`)
   - `clockworks~tiktok-scraper`: finance hashtags (`TIKTOK_HASHTAGS`)
   - `apify~instagram-scraper`: recent posts from the curated SG creators in
     `src/data/advisors.json`
3. Ranks posts by real engagement (likes + 3× comments + 5× shares), drops
   anything under `TREND_MIN_ENGAGEMENT`, and caps any one author at 2.
4. Streams one Claude call (`claude-opus-4-8`) that writes a content kit per
   post it can honestly ride. The URL and engagement numbers always come from
   the scraped post, never from the model.
5. Writes `trends.json` **only if** at least `TREND_MIN` (default 12) valid
   trends survive, so a thin or failed run never overwrites the last good drop.
6. Commits to `main`; Vercel's git integration deploys the updated page.

**Only this job should write `trends.json`.** If another scheduled job (for
example a Claude routine committing "world-trend drop" news drops) also writes
it, pause that job, or the two overwrite each other.

## Enabling it

The job needs **two** repo secrets. Without either, it fails fast and writes nothing.

1. GitHub → the repo → **Settings → Secrets and variables → Actions → New
   repository secret**.
2. `APIFY_TOKEN`: console.apify.com → Settings → API & Integrations → Personal API token.
3. `ANTHROPIC_API_KEY`: console.anthropic.com → API keys.
4. Test it: **Actions → Trend scout → Run workflow** (set a smaller `count`
   for a cheaper first run).

## Running locally

```bash
APIFY_TOKEN=apify_... ANTHROPIC_API_KEY=sk-ant-... TREND_COUNT=6 TREND_MIN=3 node scripts/trend-scout.mjs
```

| Env var | Default | Purpose |
| --- | --- | --- |
| `APIFY_TOKEN` | — | Required. Pays for the scrape. |
| `ANTHROPIC_API_KEY` | — | Required. Writes the content kits. |
| `TREND_COUNT` | `24` | Target number of trends. |
| `TREND_MIN` | `12` | Minimum valid trends, or the run fails without writing. |
| `TREND_MIN_ENGAGEMENT` | `3000` | Minimum likes + comments for a post to count as viral. |
| `TREND_MODEL` | `claude-opus-4-8` | Model id. |
| `IG_HASHTAGS` / `TIKTOK_HASHTAGS` | finance defaults | Comma-separated hashtag overrides. |
| `APIFY_IG_ACTOR` / `APIFY_IG_HASHTAG_ACTOR` / `APIFY_TIKTOK_ACTOR` | see above | Actor overrides. |

The scrape plan, normalizers, ranking and finalize steps are pure and exported,
so the tests cover them without spending Apify or Anthropic quota. The tests
also pin each actor's input to the fields that actor accepts.
