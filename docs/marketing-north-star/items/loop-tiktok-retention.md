# Each TikTok clip's retention curve is read at 48 hours, and the next cut starts where viewers left

Status: todo
App all apps, owner Claude, phase 2 (the loop can see).

## Why

Angus Sewell's reel DdB8LT-xC0Y (Leo's ActivityTracker note "Check / do IG Reel: DdB8LT-xC0Y", 25 Oct) cuts one long recording into ten clips with an AI editor, posts them to TikTok, and after 48 hours has an agent open TikTok Studio and save each post's retention curve plus saves and watch time. The agent joins each curve to the clip's transcript and re-edits the next batch from the seconds where viewers drop. He picks TikTok because Instagram does not show a retention curve.

## What we have today

Checked 30 Oct 2026.

- TikTok posting runs through Zernio for the ActivityTracker account (TIKTOK map in ~/Documents/moneybees-reels/tools/publish_ig.py).
- ~/Documents/moneybees-reels/tools/ig_week.py reads Instagram reach and saves. Nothing reads a per-second TikTok retention curve.
- The podcast-clips skill already cuts Jev-picked 9:16 clips from one recording.
- Leo queued the read-only test on 30 Oct (queue item 9 in ~/Documents/Postmosis/copy/_vault/queue-1030.txt).

## What to do

1. Read Zernio's API docs and check whether per-post TikTok analytics include a retention curve. Do not guess an endpoint.
2. If they do not, pull it from TikTok Studio with one Browser Use v4 browser and a Profile: read https://docs.browser-use.com/llms.txt first, pass maxCostUsd, state the cost, and stop the browser afterwards. Capture the insight response for each owned post (video_retention_rate_realtime, views, saves, average watch time, completion). Pace requests, stop at a login challenge, and never print cookies or keys.
3. Store dated JSON snapshots under ~/.local/share/moneybees-reels/tt-retention/, only for posts at least 48 hours old, with missing metrics as null.
4. Join each curve to the clip's transcript and write analysis.md: 3-second retention, saves per view, the sharpest drops with the line spoken at that second, and edit ideas with their evidence and how sure they are.
5. Add one assert-based test for the curve parser. Run it on the last 10 ActivityTracker TikTok posts and show Leo the table and analysis.md before it goes on any schedule.

## Done when

- tools/tt_retention.py runs on the last 10 posts and writes the snapshots and analysis.md.
- Leo has read the first analysis and decided whether it goes on a weekly schedule and into the podcast-clips skill.
