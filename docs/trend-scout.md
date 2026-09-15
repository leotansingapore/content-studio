# Trend scout (CI)

The `/trends` page renders a static file, [`src/data/trends.json`](../src/data/trends.json).
A GitHub Actions job refreshes it every morning from **real finance videos doing
well on TikTok and Instagram**, and pushes the new drop live with no approval step.

- **Workflow:** [`.github/workflows/trend-scout.yml`](../.github/workflows/trend-scout.yml)
- **Generator:** [`scripts/trend-scout.mjs`](../scripts/trend-scout.mjs)
- **Tests:** [`scripts/trend-scout.test.mjs`](../scripts/trend-scout.test.mjs) (run by CI)

## How it works

1. Runs daily at **01:50 UTC (09:50 SGT)**, or on demand via **Actions → Trend
   scout → Run workflow**. GitHub can start scheduled runs late.
2. **Finds candidates** via Apify, two runs in parallel:
   - `clockworks~tiktok-scraper`: finance hashtags (`TIKTOK_HASHTAGS`). Videos
     from the last 14 days are ranked by likes + 3× comments + 5× shares, with
     at most 2 per creator. The top 12 are shortlisted.
   - `apify~instagram-reel-scraper`: the latest reels (pinned ones skipped) from
     the SG creators in `src/data/advisors.json` plus a few large global finance
     accounts (`IG_CREATORS` adds more). A reel is picked when it is recent, has
     5,000+ views and beat that creator's median views by 1.5× or more. Up to 6
     are shortlisted.

   Instagram hashtag feeds are not used: they return brand-new posts with
   almost no engagement.
3. **Pulls transcripts** for the shortlist: TikTok's own subtitles (the scraper
   transcribes videos that have none) and the reel scraper's transcript add-on.
4. **Streams one Claude call** (`claude-opus-4-8`) with each video's caption,
   transcript, real numbers and outlier ratio. Claude picks the best 12 it can
   honestly adapt for Singapore consultants and skips promotions, recruitment
   posts, stock or fund picks, and anything unclear.
5. Validates the kits. URLs and numbers always come from the scraped video,
   never from the model. Writes `trends.json` **only if** at least `TREND_MIN`
   (default 8) valid trends survive, so a thin or failed run never overwrites
   the last good drop.
6. Commits to `main`; Vercel's git integration deploys the updated page.

**Only this job should write `trends.json`.** A separate Claude routine has been
committing news-based "world-trend drop" files at about 01:30 UTC. Pause it, or
the page shows news until this job runs.

## Cost

About US$1 of Apify credit a run (TikTok hashtags, creator reels, transcripts),
or roughly US$25–30 a month, plus one Claude call.

## Enabling it

The job needs **two** repo secrets. Without either, it fails fast and writes nothing.

1. GitHub → the repo → **Settings → Secrets and variables → Actions → New
   repository secret**.
2. `APIFY_TOKEN`: console.apify.com → Settings → API & Integrations → Personal API token.
3. `ANTHROPIC_API_KEY`: console.anthropic.com → API keys.
4. Check it: **Actions → Trend scout → Run workflow** with **dry_run** ticked
   prints the drop in the log without committing anything.

## Running locally

```bash
APIFY_TOKEN=apify_... ANTHROPIC_API_KEY=sk-ant-... TREND_OUT=/tmp/trends.json node scripts/trend-scout.mjs
```

| Env var | Default | Purpose |
| --- | --- | --- |
| `APIFY_TOKEN` | — | Required. Pays for the scrape and transcripts. |
| `ANTHROPIC_API_KEY` | — | Required. Writes the content kits. |
| `TREND_COUNT` | `12` | Target number of trends. |
| `TREND_MIN` | `8` | Minimum valid trends, or the run fails without writing. |
| `TREND_MIN_ENGAGEMENT` | `1000` | TikTok floor on likes + comments. |
| `TREND_MAX_AGE_DAYS` | `14` | Ignore videos older than this. |
| `TREND_MODEL` | `claude-opus-4-8` | Model id. |
| `TIKTOK_HASHTAGS` | finance defaults | Comma-separated hashtag override. |
| `IG_CREATORS` | — | Extra comma-separated Instagram handles. |
| `TREND_OUT` | `src/data/trends.json` | Where to write the drop. |

The scrape plan, normalizers, ranking, outlier picking, subtitle parsing,
prompt and finalize steps are pure and exported, so the tests cover them
without spending Apify or Anthropic quota. The tests also pin each actor's
input to the fields that actor accepts.
