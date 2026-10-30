# Every guide is re-checked against page one each quarter

Status: todo
App Postmosis (postmosis.com), owner Claude, phase 2 (The page sets rivals rank with).

## Why

Platform numbers move, and the platforms' own pages disagree while they do. Instagram's Help Centre says "You can use up to 5 tags on a post", while its Graph API page still says 30 hashtags. The Help Centre takes photos from 1.91:1 to 3:4, while the API stops at 4:5. YouTube Help now says Shorts can run up to three minutes (copy/_tools/platform-facts.json, read 28 Oct 2026). A guide that keeps last year's number loses the click to one that changed.

Page one moves too. The guides were judged against the page ranking first in a read of 28 Oct (copy/_guides/serp.json), and that page can change any week.

## What we have today

Checked 30 Oct 2026 against ~/postmosis-site origin/main (2b81272) and the vault.

- Every guide and vault page shows a last-checked date and dates every source (the Markdown copy prints "Last checked"; tests/guides.test.ts dates every source read).
- copy/_guides/scripts/facts.py holds 42 sources and 151 verbatim quotes, and checks each quote is still in the saved page text in copy/_guides/sources. It does not re-fetch the pages. grab.py does that, one URL at a time, with Scrapling.
- The vault's facts sit in copy/_vault/facts.json (202 entries), built from facts_b*.py batches, and check.py gates each vault page.
- copy/_guides/serp.json holds page one for each guide's head phrases, read on 28 Oct with DataForSEO organic live (serp.py).
- Nothing re-runs any of this on a schedule.

## What to do

1. Write copy/_guides/scripts/refresh.py. For every source in facts.py and in the vault's facts batches, re-fetch the page with grab.py's fetcher into a dated copy, then run the quote check against the new text. List each quote that changed or vanished, with the guide sections that cite it. Scrapling is free.
2. Re-read page one for each guide's head phrase with serp.py: 18 phrases at USD 0.002 each for the first 10 results on DataForSEO live (credit-prices.ts), about USD 0.04. Stop and ask Leo before it runs.
3. Have Jev compare each guide with the live top three in the searcher's shoes (judge_guide.py). Jev is a paid call: state the estimate and wait for Leo's yes.
4. Rewrite only the sections that lost or that cite a changed quote, through pages.py, aicheck under 15 and brief-check against ~/Documents/Postmosis/product-marketing.md, then to_ts.py and heavy npm run check. Bump the page's updated date, which feeds dateModified.
5. Push to main, then run postmosis-indexnow-submit.sh.
6. Schedule step 1 with launchd each quarter, first run 30 Jan 2027, writing its report to copy/_guides/refresh-<date>.md. Steps 2 to 4 run after Leo's yes each quarter.
7. Flip this card's status and ours line in src/data/seoNorthStar.ts and this spec's Status line.

## Done when

- refresh.py runs and lists every changed or vanished quote across guide and vault sources.
- The first quarterly pass is done: every guide re-checked, changed facts rewritten, dates bumped and IndexNow run.
- The quarterly launchd job exists and has written its first report.

## Open questions

None.
