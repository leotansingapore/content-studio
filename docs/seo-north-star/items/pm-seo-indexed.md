# Every page in the sitemap is indexed by Google

Status: started
App Postmosis (postmosis.com), owner Claude, phase 1 (Indexed and measured).

## Why

A sitemap lists what a site asks to have indexed, not what Google keeps. Predis lists 68,179 URLs, yet all 30 URLs sampled from its sitemap-prune files answer 410, and so do 10 of 30 sampled English blog posts (census.md and the predis.ai liveness_sample in census.json, 30 Oct 2026). None of the eight rivals publishes its indexed share, so the only way to know ours is to check it.

Phase 3 waits on this card. Pages from data get built only once Google keeps what we already publish (SEO_PHASES).

## What we have today

Checked 30 Oct 2026 against the live sitemap (113 URLs), Search Console's API through seo-visibility's gdata.py, ~/postmosis-site origin/main (2b81272) and ~/.local/bin.

- Search Console's domain property for postmosis.com was verified on 29 Oct 2026. The service account seo-visibility uses can read it: gdata.py gsc-sitemaps answers for sc-domain:postmosis.com.
- Google last downloaded the sitemap on 29 Oct 2026 at 02:45 UTC, with 79 URLs and 0 errors. The live sitemap has 113, so the 34 added since wait for Google's next read.
- URL Inspection on all 113 sitemap URLs, 30 Oct: 96 submitted and indexed, 15 unknown to Google, and 2 discovered but not indexed (/templates/linkedin-post and /guides/linkedin-image-size). All 15 unknown URLs are vault pages: 13 shipped on 30 Oct (d33ad56, 6b3844d, 2b81272), plus heygen-avatar and ai-video-examples from 660b4e5 on 29 Oct. The vault section is 19 of 34 indexed.
- ~/.local/bin/postmosis-indexnow-submit.sh sends every sitemap URL to IndexNow (Bing, Yandex and others) with the key the site serves since f044469. It runs only by hand.
- The weekly check this card needs already runs for two other sites: ~/.local/bin/sb-index-watch and moneybees-index-watch, launchd jobs that inspect sitemap URLs through gdata.py. sb-index-watch saves one JSONL file per run. Nothing like it runs for postmosis.com.

## What to do

1. Copy ~/.local/bin/sb-index-watch to ~/.local/bin/postmosis-index-watch. Read https://postmosis.com/sitemap.xml, inspect every URL with gdata.call against sc-domain:postmosis.com, and save <date>.jsonl under ~/Documents/Postmosis/research/index-watch/. Keep its back-off and its resume from a half-done file. The API is read-only and free, 2,000 inspections a day per property (sb-index-watch header), against 113 URLs today.
2. Group rows by first path segment and append one line per run to progress.md: inspected, indexed, and the indexed share per section.
3. Flag any section under 70% indexed, and any URL indexed last week that is not now.
4. When the sitemap holds URLs the last run did not see, run postmosis-indexnow-submit.sh and resubmit the sitemap through the Search Console sitemaps API (gdata.call with its write scope; seo-visibility has no postmosis site entry for gsc-sync-sitemaps). Both are free, and the README already says to run IndexNow after a deploy that adds pages. Both send to a third party on Leo's behalf, so ask Leo once before the job runs them on its own.
5. Add --self-test, which checks the grouping and the 70% flag on fixed rows and touches nothing, the way sb-index-watch does.
6. Schedule it weekly with launchd as com.leo.postmosis-index-watch, Saturdays 09:00, beside sb-index-watch (Saturdays 08:00).
7. Stop and ask Leo which channel gets the flag, the Lark alerts group or Telegram, before it posts anything. Post only when a section is under 70% or a page drops out. A quiet week posts nothing.
8. Flip this card's status and ours line in src/data/seoNorthStar.ts and this spec's Status line.

## Done when

- postmosis-index-watch runs weekly under launchd and passes --self-test.
- progress.md shows the indexed share per section for two weekly runs in a row.
- Every section is 70% indexed or more, or the flag names each missing URL and its coverage state.
- IndexNow and the sitemap resubmit run on their own when the sitemap grows.

## Open questions

None.
