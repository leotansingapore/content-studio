# Every Monday, last week's winners arrive on Telegram

Status: done (27 Oct 2026, ~/.local/bin/marketing-readback; the card's ours line says what was built and what is not yet)
App all apps, owner Claude, phase 2 (the loop can see).

## Why

Kenyon of Sideshift (50:05) gives the signal for an organic post worth paying for: a video that "gets 5 to 10x the normal number of views" for that creator, "8 to 10% or more engagement", and "strong comment sentiment meaning people asking about the product." Oren John (1:24:16) gives the rhythm: "Creative, buying the media, getting the results, making new decisions on creative. Repeat forever", with new ads every week. At 36:21 he describes the agent that does his Friday version: it pulls the ad results and sends his team a diagnosis.

Every later card leans on this one. The partnership ads, the Thursday creator call, the monthly format review and the day-30 verdict all start from "which posts won last week, and what did they bring in".

## What we have today

Checked 26 Oct 2026. Nothing was run.

- ~/.local/bin/moneybees-ads-report.py, through moneybees-ads-report.sh and launchd com.leo.moneybees-ads-report, posts Meta spend, leads and cost per lead for the MoneyBees ad account to a Telegram group (META_ADS_BOT_TOKEN, META_ADS_CHAT_ID). It runs on Sundays, Mondays and Thursdays at 10:00, not once a week. It reads at campaign level (`level: campaign`, last_7d against last_14d), so there is no cost per lead per ad set yet.
- ~/Documents/moneybees-reels/tools/ig_week.py already reads our own posts: for @the_moneybees it pulls each post of the week from the Instagram Graph API (reach, saves, shares, likes, comments, follows), labels it with the board card's playbook type, and compares the week with the four before it. It writes ~/.local/share/moneybees-reels/ig-week/<ISO week>.json and can post a line to Lark. It is run by hand (one file so far, 2026-W43) and has a test (tests/test_ig_week.py). It does not read views, watch time or comment text.
- The same system-user token (META_ADS_ACCESS_TOKEN in ~/.config/agents.env) already reaches three Instagram accounts, the IG map in tools/publish_ig.py: the_moneybees, finternshipofficial and activity_tracker_io. Board cards live in the `studio_cards` table and carry the posted media id and permalink.
- Content Studio's Analytics page shows Zernio's numbers for accounts connected there (supabase/functions/social/metrics.ts), with breakdowns by platform, pillar, format and hook formula, for posts made in Content Studio only.
- Jev is already used this way elsewhere: post-score and remix-patterns in Content Studio, and hook-bank in the weekly top-posts job.
- Leads from the career funnel land in themoneybees.co's contact_submissions table (source_page `finternship_ebook` or `careers_page`), then on the MoneyBees board in ActivityTracker as a card that the assistant books. Nothing ties a booked call to a post or a creator yet; that is loop-creator-links.
- So the card's ours line is wrong in two places: the ads report is not weekly and not per ad set, and something does read our own posts (ig_week.py, by hand, MoneyBees only).

## What to do

All steps are Claude's unless they say otherwise. Every read is a GET; the job writes only its own files and one Telegram message.

1. Build `tools/readback.py` in ~/Documents/moneybees-reels, reusing ig_week.py's `get`, `insights`, `scrub` and card matching (import them, do not copy). It loops over every account in the IG map. For each post in the week (the same window as ig_week: the 7 days that ended 24 hours before the run) it reads views, reach, likes, comments, saves, shares, and for reels `ig_reels_avg_watch_time`. The format comes from the board card's type, else Graph's media_product_type.
2. Baseline per account: the median views of its previous 30 posts. Each post gets `views_x` (its views over that median) and `engagement` ((likes + comments + saves + shares) / views; reach for photo posts). Thresholds start at Kenyon's numbers, `views_x >= 5` and `engagement >= 0.08`, as constants at the top of the file. After four Mondays, Claude resets them from our own data and writes the new values and the date on this card.
3. Comment intent, which is a decision, so Jev makes it. For each post that clears either threshold, plus each account's top three by views, read up to 50 comments (`/{media-id}/comments?fields=text,timestamp`). Jev (TypeSafe, pinned `jev-1.13.0`; the wrapper sources ~/.zshenv for TYPESAFE_API_KEY, as com.leo.reel-triage does) answers one yes or no per comment: "Is this person asking how to buy, join, book, or how much it costs?" A post's intent count is the yeses. If Jev times out or the token is missing, a short keyword list (join, sign up, how much, price, interview, DM, link) counts instead, and the card says "intent by keyword". Comments that are not in English always use the keyword list, because Jev reads English best. If the token lacks the scope to read comments, stop and ask Leo; adding a permission is an access change.
4. Which posts to promote, also Jev's call. Candidates are the posts that cleared at least one threshold. Jev ranks them in one Choice request, given each post's numbers, intent count and caption, against the question "Which of these is most likely to bring booked calls if run as an ad?" The top one to three are the promote list. Fallback without Jev: rank by `views_x`, then intent count, and mark the list "ranked by views".
5. Ads at ad-set level. Read the MoneyBees ad account with `level: adset`, last_7d: spend, leads, cost per lead. Reuse `meta_api` and `extract_leads` from moneybees-ads-report.py. Kill an ad set that spent 3 or more times the account's 4-week cost per lead with no lead. Mark one "scale" when it has 5 or more leads at or under that cost per lead. Everything in between is "keep testing". These rules follow Oren's testing rule and need no model.
6. Booked calls per creator link: until loop-creator-links ships, this section reads "waiting on loop-creator-links". After that it counts the week's contact_submissions per utm_source, and how many of those cards got an appointment.
7. The message, plain text, to the same Telegram group the ads report uses, so Leo reads spend and posts in one place. Action first, numbers last, one screen long. The figures below are made up to show the layout.

```
Monday read-back, 19 to 25 Oct

Promote this week
1. @finternshipofficial reel, 21 Oct: 6.2x its usual views, 9% engagement, 4 people asking how to join. <permalink>

Kill
- ad set careers_founder_talking-head: SGD 180 spent, no leads

Test next (from the promoted posts)
- hook "...", format talking head

Numbers
@the_moneybees 5 posts, median views 1,240, best 3.1x
@finternshipofficial 3 posts, median views 2,050, best 6.2x
@activity_tracker_io 9 posts, median views 410, best 1.8x
Booked calls by creator link: waiting on loop-creator-links
```

8. Store each week's rows as ~/.local/share/marketing-readback/<ISO week>.json, and upsert every post into the shared post store that loop-pattern-db creates.
9. Run it: `~/.local/bin/marketing-readback.sh` wrapper in the style of moneybees-ig-publish.sh (a mkdir lock, `cd ~/Documents/moneybees-reels`, a log in ~/Library/Logs/marketing-readback.log, `date +%F` into ~/.local/state/marketing-readback/last-ok on success), and launchd `com.leo.marketing-readback`, Mondays 08:00, run by /bin/bash. Add a row for it to the stamp table in ~/.local/bin/automation-health.py with an 8-day limit. Never run automation-health to test it, because it posts to Lark.
10. Tests in tests/test_readback.py with fixture rows: the thresholds, the baseline, the ad-set rules, the Jev fallback path and the message layout. `--dry` prints the message and sends nothing.

## Done when

- `python3 tools/readback.py --dry` prints a message covering all three Instagram accounts and the ad sets, with real numbers.
- `python3 -m pytest tests/test_readback.py` passes.
- `launchctl list | grep marketing-readback` shows the job, and the first message lands in the Telegram group at 08:00 on Monday 2 Nov 2026.
- On that message, either the intent counts came from Jev, or the line "intent by keyword" says why not.
- automation-health has the stamp row, and ~/.local/state/marketing-readback/last-ok carries that Monday's date.

## Open questions

1. Post it to the ads report's Telegram group, or to Leo's own chat? Recommended: the ads report's group, so cost per lead and post winners are read together.
2. Start with Kenyon's thresholds (5x views, 8% engagement) and reset them after four Mondays of our own data? Recommended: yes, as the plan says.
3. Add TikTok (@activity_tracker_io, through Zernio's analytics) in the first version? Recommended: no. Instagram first, then TikTok once Zernio's analytics have been seen working against a live account.
