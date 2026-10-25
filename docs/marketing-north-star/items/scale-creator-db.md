# A creator database once the roster passes 20

Status: todo
App all apps, owner Leo, phase 7 (Scale what won).

## Why

Angus Sewell's reel (the card cites 0:12; there is no transcript on file to check the second) puts a creator database at the top of his outreach stack: Modash, with 380M+ creators across Instagram, TikTok and YouTube, or HypeAuditor, to find creators by niche at scale (01-video-notes.md, section 4). He says one tool in his stack overcharges without naming it, and Modash is the likely one.

Hector Serrano (Wispr Flow) shows why we do not need it yet: with no programme history, he recruits by Instagram keyword search, then works through the followers and commenters of creators who fit, and gets a starting group with 100 to 200 DMs over a few days. His ramp, 5 then 10 then 20 then 40, is where a search tool starts to save real time.

## What we have today

Checked 26 Oct 2026.

- No creator database. Recruiting is Instagram keyword search by hand plus Apify scrapes, screened by whisper-cli transcripts and Jev (pilot-outside-creators, todo).
- Modash's pricing page (modash.io/pricing, read 26 Oct 2026) lists Essentials at US$199 a month as US$2,388 paid yearly, and Performance at US$499 a month as US$5,988 paid yearly, with Enterprise from US$14,700 a year. Its FAQ says yearly billing saves US$100 a month on both, which puts Essentials at about US$299 month to month. The trial is 14 days with no card. Confirm the price on the day before paying.
- The roster that "passes 20" is counted in is loop-roster, which is todo.
- The skip list keeps automated DMs off the table whatever tool finds the creators.

The card's question ("about $199 to $299 a month") matches the page: US$199 a month billed yearly, about US$299 month to month.

## What to do

1. Claude watches the roster count. When it reaches 20 active creators (active means at least one approved video in the last 30 days), Claude tells Leo on Telegram once.
2. Leo starts the 14-day Modash trial, with no card if the trial still allows it, and sets a calendar reminder for day 12 so nothing bills by accident.
3. Claude writes the test before the trial starts, in ~/Documents/creator-db-trial/plan.md: the niches we recruit in (first job and careers in Singapore, financial advisers, CMFAS takers, SEO and agency owners for SearchBlueprint) and the filters for each (country, follower range, engagement, language).
4. During the trial, Claude runs the same niche searches two ways: Modash's filters, and our keyword search plus follower and commenter walk. Both lists go through the same Apify scrape and Jev fit check (pinned jev-1.13.0) that pilot-outside-creators uses. If Jev returns nothing, Leo reads the lists.
5. Claude counts the creators who pass Jev's check that only Modash found, and how long each method took a person. Exports from Modash go into the roster as candidates; nobody is messaged by a tool.
6. On day 12 Claude writes a one-page verdict: fit creators only Modash found, hours saved, and the monthly price. Leo keeps or cancels before day 14.

## Done when

- The trial started only after the roster passed 20 active creators.
- The plan file named the niches and filters before the trial began.
- The verdict shows fit creators found only by Modash and the hours each method took, side by side.
- Leo kept or cancelled before the trial's last day, and no unplanned charge happened.

## Open questions

- Keep Modash if it finds how many extra fit creators a month? Recommended: at least five fit creators a month that keyword search missed, since at the month-to-month entry price that is about US$60 per new candidate, and fewer means the hand search is still cheaper.
- Modash or HypeAuditor? Recommended: trial Modash first, as Angus does, and only try HypeAuditor if Modash fails the test on Singapore creators in particular.
