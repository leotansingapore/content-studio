# Refreshing the Top Posts swipe file

The `/swipe` page and the "Top performing posts" section on each advisor read
from `src/data/topPosts.json`. It is static so the app needs no backend, no
Apify token, and end users never trigger paid scraping. Refresh is a quick,
repeatable pipeline run on request.

## What is in the data

For every Instagram profile in `src/data/advisors.json` we keep the **top 3
recent posts by engagement** (likes + 3x comments). Tier-1 profiles are
advisors; everyone else (creators, firms) shows as an influencer on /swipe and
is ranked reels first, as UGC inspiration. We store text only - caption,
metrics, type, permalink, and an AI "idea breakdown" - plus a cover image we
download once and commit (`public/covers/`), because Instagram CDN URLs expire.

## Refresh (one command)

```
APIFY_TOKEN=apify_... node scripts/refresh-top-posts.mjs
```

It prints the profile count and the Apify cost estimate first and refuses to
start above `TOP_POSTS_MAX_USD` (default 1.5; a run is about US$0.75 for 48
profiles x 6 posts). Then it runs `build-top-posts.mjs`, `fetch-covers.mjs`
(and deletes covers no post uses) and `gen-ideas.mjs` (free Claude CLI).
Idempotent: ideas and covers already present are kept. Flags: `--estimate`
prints the cost and stops; `--dataset file.json` rebuilds from a saved scrape
at no cost.

## Schedule

Weekly on Leo's Mac: launchd `com.leo.top-posts-refresh` (Sundays 21:00 SGT)
runs `~/.local/bin/content-studio-drop.sh top-posts` in a private worktree,
commits only `src/data/topPosts.json` and `public/covers`, rebases and pushes
(the push is the deploy). Log `~/Library/Logs/top-posts-refresh.log`, stamp
`~/.local/state/top-posts-refresh/last-ok`, watched by automation-health.
