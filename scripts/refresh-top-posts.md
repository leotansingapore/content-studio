# Refreshing the Top Posts swipe file

The `/swipe` page and the "Top performing posts" section on each advisor read
from `src/data/topPosts.json`. It is static so the app needs no backend, no
Apify token, and end users never trigger paid scraping. Refresh is a quick,
repeatable pipeline run on request.

## What is in the data

For each tier-1 advisor (individual financial advisors) we keep their **top 3
recent posts by engagement** (likes + 3x comments). We store text only - caption,
metrics, type, permalink, and an AI "idea breakdown" - because Instagram CDN
image URLs expire within days. Cards link out to the live post for the visual.

## Steps to refresh

1. **Scrape** the tier-1 advisor Instagram profiles with the Apify
   `apify/instagram-scraper` actor:
   - `resultsType: "posts"`, `resultsLimit: 6`
   - `directUrls`: every tier-1 advisor profile URL. Regenerate the list with:
     ```
     node -e "const d=require('./src/data/advisors.json');console.log(JSON.stringify(d.filter(e=>e.platform==='instagram'&&e.tier===1).map(e=>'https://www.instagram.com/'+e.handle.replace('@','')+'/')))"
     ```
   - Save the run's dataset to a JSON file, e.g. `dataset.json` (bare array or
     the `{ items: [...] }` wrapper both work).

2. **Rank + write** the data file:
   ```
   node scripts/build-top-posts.mjs dataset.json
   ```
   This keeps the top 3 per advisor and preserves any existing idea breakdowns.

3. **Generate idea breakdowns** for new posts (uses the free Claude CLI):
   ```
   node scripts/gen-ideas.mjs
   ```
   Idempotent - only fills posts that do not already have an idea.

4. **Ship it**:
   ```
   npm run build   # sanity check
   git add src/data/topPosts.json && git commit -m "chore: refresh top posts" && git push
   ```
   The repo auto-deploys on push.

## Notes

- To include finance creators (tier 2) as well, drop the `&&e.tier===1` filter in
  step 1.
- Cadence suggestion: monthly, or whenever an advisor's strategy shifts.
- A future upgrade path (not built) is a Supabase Edge Function holding the Apify
  token so the app can self-refresh; deferred because it exposes paid scraping to
  end users and needs cost guardrails.
