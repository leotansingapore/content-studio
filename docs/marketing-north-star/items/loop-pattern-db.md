# Every post we or our creators made is searchable by hook, concept and structure

Status: started
App all apps, owner Claude, phase 2 (the loop can see).

## Why

Angus Sewell's reel (around 0:29; there is no transcript on file, so this comes from 01-video-notes.md) says the hard part of creator work is getting a good video, and his fix is a database. Once creators sign, scrape and transcribe every post each one has made, and store per post the hook, the first three lines, the concept, the structure and the numbers. Then rank their hooks, concepts and structures by views and write from their best pattern.

Oren John describes the same breakdown in his Video Database app (1:06:01): for each video, "what was their title hook, their verbal hook, and their visual hook? What's the narrative framework they have? There's a transcript you can grab", plus a simple outline. Two later cards depend on this store. pilot-own-pattern-scripts writes new creators' drafts from it, and the Monday read-back's "test next" line reads it.

## What we have today

Checked 26 Oct 2026.

- Content Studio's weekly top-posts job (launchd com.leo.top-posts-refresh, Sundays 21:00, ~/.local/bin/content-studio-drop.sh top-posts) scrapes the peer advisers in src/data/advisors.json with Apify's `apify~instagram-scraper`. It writes their top three posts each to src/data/topPosts.json with a breakdown per post: the hook, the format, why it worked, how to adapt it, and Jev's tags (formula, angle, topic, emotion, audience). scripts/hook-bank.mjs files their opening lines under Write's hook formulas in src/data/hookBank.json. So a per-post breakdown does exist, which the card's ours line misses, but only for other advisers' top posts.
- Content Studio's remix-patterns function has Jev tag a followed account's best posts by hook formula, structure and topic. The result is kept in the app per account and nothing is stored on the server. track-accounts checks one public account through Apify, about 15 posts a check.
- The reel-analyzer skill breaks down one reel by hand, frame by frame plus transcript. The outlier-finder skill finds posts at 3x an account's usual and writes a swipe note into ~/Documents/Social Content Vault.
- whisper-cli is installed at /opt/homebrew/bin/whisper-cli, with the model ~/.local/share/whisper/ggml-small.en.bin.
- Our own posts' numbers come from the Graph API through ~/Documents/moneybees-reels/tools/ig_week.py (MoneyBees only, by hand). For our own reels the API also gives average watch time, which is the nearest thing to retention we can read.
- Nothing stores our own posts or our creators' posts with a transcript, first three lines, concept and structure.
- Apify charges per result: refresh-top-posts.mjs uses US$0.0027 per result as its ceiling, so 50 posts for one creator costs about US$0.14.

## What to do

1. Claude: one store, shared with the Monday read-back: a SQLite file at ~/.local/share/marketing-loop/posts.db, using Python's own sqlite3 with an FTS5 index, so nothing new is installed. Table `posts`, one row per post: platform, account, whose (ours, creator or peer), permalink, posted_at, media type, format, caption, transcript, hook, first_three_lines, concept, structure, views, reach, likes, comments, saves, shares, avg_watch_s, views_x (against the account's median), source and fetched_at. The FTS index covers caption, transcript, hook and concept.
2. Our posts: tools/readback.py (loop-monday-readback) upserts every post it reads each Monday. The first run also back-fills the last 90 days of the three Instagram accounts in the IG map.
3. Creators' posts: for each creator in the roster (loop-roster), run `apify~instagram-scraper` on their last 50 posts when they are added, then their new posts each Monday. State the cost before a batch and cap each run at US$1, the way refresh-top-posts.mjs does with TOP_POSTS_MAX_USD.
4. Transcripts: for each reel, fetch the video with yt-dlp, take the audio with ffmpeg, and run whisper-cli with the small.en model. Leave the transcript empty when a reel has no speech, and keep going. Everything runs locally and costs nothing.
5. The hook and first three lines come from code: the first transcript sentence (or the caption's first line when there is no speech), and the first three transcript sentences.
6. The labels are decisions, so Jev makes them (pinned `jev-1.13.0`). It tags each post's hook formula from Write's list (the same list hookBank.json uses), its structure from a fixed list (storytime, numbered list, myth then fact, day in the life, explainer, street interview, comparison, other) and its topic. If Jev is down the tags stay empty and the next run fills them. Only the one-line concept is written by a language model, through `claude -p --model sonnet`.
7. Retention for creators: when a creator sends Instagram Insights screenshots, the average watch time goes on their roster row by hand and the next run copies it into the store. Nobody asks a creator for their login.
8. Search: a CLI, ~/.local/bin/marketing-loop, with `marketing-loop search "<words>" [--account <handle>] [--structure <name>] [--whose creator]`. It prints the top matches with their views_x and permalink. The Monday read-back's "test next" line and pilot-own-pattern-scripts query the same file.
9. Tests: the upsert (a post read twice stays one row with new numbers), the code rules for hook and first three lines, the empty-transcript path, and the Jev-down path, with fixture posts.

## Done when

- posts.db holds the last 90 days of @the_moneybees, @finternshipofficial and @activity_tracker_io, with numbers and, for reels with speech, transcripts.
- One creator from the roster has their last 50 posts in it with transcripts and Jev's tags, and the run's Apify cost is noted on this card.
- `marketing-loop search` finds posts by a word in the transcript and filters by structure.
- The tests pass, and a second Monday run updates numbers without duplicating rows.

## Open questions

1. A local SQLite file for the pilot, or a table in Content Studio's database from the start? Recommended: SQLite now. It needs no schema change on a production database, and it moves into Content Studio with scale-review-in-studio once five creators post.
2. Should peer advisers' posts from topPosts.json go into the same store? Recommended: yes, marked whose = peer, so a search can compare our creators with the advisers who already win.
