# Every title and description fits the search result

Status: done
App Postmosis (postmosis.com), owner Claude, phase 1 (Indexed and measured).

## Why

Google shortens a title or snippet that does not fit the result, and the part it cuts is often the brand or the point. Google measures that width in pixels and publishes no character count, so the site holds titles to 60 characters and descriptions to 155 as a working rule (TITLE_MAX and DESCRIPTION_MAX in tests/guards.test.ts). The census did not measure the rivals' titles.

## What we have today

Checked 30 Oct 2026 against ~/postmosis-site origin/main (2b81272) and the title and description of all 113 live pages.

- Site commit 01ddb7e shortened 68 titles and 37 descriptions that ran past the limits, keeping each head phrase first and leaving H1s and body copy alone (its commit message).
- tests/guards.test.ts reads every built page and fails a title over 60 characters with " | Postmosis", a description over 155, or a title that names Postmosis twice. It failed 69 pages on the launch build before that fix.
- The routes registry test fails on any duplicate title or description (guards.test.ts).
- On the live site on 30 Oct, no title is over 60 characters and no description over 155, the vault pages shipped after 01ddb7e included.

## What to do

1. Nothing to build. New pages go through the same guard, which heavy npm run check runs.
2. Write each title with its head phrase first and the brand once, as 01ddb7e did, and never pad one out to the limit.
3. Once pm-seo-scoreboard has four weeks of data, list pages with impressions and a low click rate, and rewrite their titles first.

## Done when

- The guard passes on every build, and every live title and description stays within its limit. Met on 30 Oct 2026.

## Open questions

None.
