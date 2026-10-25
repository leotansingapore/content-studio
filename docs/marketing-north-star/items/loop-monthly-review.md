# Each month the weakest format is swapped out

Status: todo
App all apps, owner Leo + Claude, phase 2 (the loop can see).

## Why

Oren John (58:26): "every business should have, in my opinion, between three and five formats you're testing ... Those formats become your pillars." At 59:11 he says how to judge them: at the end of every month, a couple of days after so the posts have room to fill out, "compare the views, the saves, the shares, the hook rate, new followers versus old followers", pillar against pillar and month on month. At 59:56 comes the rule: "if it does worse twice or like two months in a row, we're going to swap it out for something else."

Without this, a format that stopped working keeps getting a third of the week's posts because nobody looked.

## What we have today

Checked 26 Oct 2026.

- ~/Documents/moneybees-reels/tools/ig_week.py groups @the_moneybees posts each week by the playbook type on their board card (FEEL, TWOPATH, COMPARE, COST, MYTH, PICK, NEWS, FESTIVE) and prints the median saves plus shares per 1,000 reach for each type. It compares the week with the four weeks before it. It runs by hand, covers MoneyBees only, and never looks a month back.
- Content Studio's Analytics page breaks the posts tracked in Content Studio down by platform, pillar, format and hook formula, and compares periods (src/lib/analytics.ts, `getBreakdown`, `comparePeriods`). Posts made by the reels board or the at-social jobs are not Content Studio drafts, so they are not in it.
- So the card's ours line ("No format-level reporting") is too strong: there are weekly format numbers for one account, and per-format breakdowns for Content Studio drafts. Nothing compares formats month on month across our accounts or flags two losing months.
- The Graph API refuses `follows` for reels (error #100, noted in ig_week.py and the playbook), so new followers are only known for the whole account. Hook rate is not available for organic posts; a reel's average watch time (`ig_reels_avg_watch_time`) is the nearest number.
- Each account's formats are written down in different places: the MoneyBees playbook's post types (playbook.md), the at-social plan for ActivityTracker (DEFAULT_PLAN in ~/Documents/at-social/tools/concepts.py), and nothing written for @finternshipofficial.

## What to do

1. Leo, once: name three to five formats per account, in a short table this spec's builder adds to docs/marketing-north-star/formats.md. Recommended starting sets: for @the_moneybees its existing playbook types, grouped into at most five; for @activity_tracker_io the at-social plan's kinds; for @finternshipofficial whatever the board's last 30 posts show, grouped by Jev in step 3.
2. Claude: in tools/readback.py (built by loop-monday-readback), on the first Monday of each month, add a month table per account. Each format gets the number of posts in the calendar month before, the median views, the median saves plus shares per 1,000 reach, and the median average watch time for reels. The account's net new followers for the month go on a line of their own. Posts younger than three days at month end wait for the next month's table, as Oren advises.
3. Every post needs a format, which is a classification, so Jev does it. The board card's type is used when it has one. Otherwise Jev (pinned `jev-1.13.0`) picks one format from that account's list in formats.md, given the caption and the media type. If Jev cannot answer, the post is counted as "unlabelled" and the table says how many.
4. Claude: a format "lost" a month when its median views and its saves plus shares per 1,000 reach were both below the account's medians for that month. A format that lost two months running gets "swap?" beside its row. The first table, on Monday 2 Nov 2026, also reads September and October back from the Graph API, so the two-month flag can work from day one.
5. Leo, in the Monday 30-minute slot: for each "swap?" format, decide to swap or keep, and name the replacement. Claude records the decision under that account in formats.md, and changes the posting plan for that account (playbook.md's weekly mix for MoneyBees, DEFAULT_PLAN in tools/concepts.py for ActivityTracker, the reels board brief for FINternship).
6. Tests in tests/test_readback.py: the month window, the three-day hold, the "lost" rule and the two-month flag, with fixture months.

## Done when

- formats.md lists each account's formats, with Leo's yes.
- On Monday 2 Nov 2026 the read-back message carries a month table for each Instagram account, with October beside September.
- A format below both medians in two straight months shows "swap?" (checked with a fixture test, and on real data when it happens).
- Every "swap?" has Leo's decision recorded in formats.md within a week.

## Open questions

1. Who names each account's formats? Recommended: Leo approves a list Claude proposes from each account's last 30 posts, so the formats reflect what the account already makes.
2. Judge a format on views and saves plus shares together, or on views alone? Recommended: both. Views alone rewards hooks that do not hold attention, and saves plus shares is the number the MoneyBees playbook already tracks.
