# Each month, the accounts already winning a slideshow format in each app's niche are found and saved

Status: todo
App all apps, owner Claude, phase 2 (the loop can see).

## Why

Salim's X article of 11 Aug 2026 (x.com/rsalimx/status/2087180278930313392, step 2) says not to save an account because one post did well, since that post may be its only hit. Save the accounts with a wall of hits on one format. An account pulling millions of views with nothing to sell is a channel nobody has claimed yet.

## What we have today

Checked 30 Oct 2026.

- On 30 Oct the ten accounts named in his article were listed with yt-dlp, their top six posts by views fetched through tikwm's post API (yt-dlp only gets the soundtrack of a photo post), and each format written up. That covers the cover, the slide types, where the product appears, and what Postmosis's slideshow maker covers and misses. The notes are in ~/Documents/Postmosis/copy/_vault/originals/x-salim/account-teardowns.txt. The script is scratchpad keepy-scripts/accounts.py from that session; copy it into ~/.local/bin before reuse.
- Postmosis's Following page tracks up to 5 public Instagram or TikTok accounts.
- The pattern store (loop-pattern-db) is planned, not built.
- Nothing runs monthly.

## What to do

1. One niche list per app: money and careers (MoneyBees, FINternship), productivity and habits (ActivityTracker), small-business search (SearchBlueprint), solo professionals who post for clients (Postmosis).
2. Each month, find candidate accounts from TikTok search and the accounts the current ones are shown beside. For each, list the last 30 posts (yt-dlp, retried with pauses when TikTok refuses) and fetch the top six slideshows' slides.
3. Jev decides which accounts pass: steady hits on one format across the last 30 posts, and nothing sold. Keep the reasons.
4. For each account that passes, save its top slideshows and a short teardown (cover, slide types, text style, where the product goes, last slide) into the pattern store.
5. Report the new formats in the Monday read-back of the first week of each month.

## Done when

- One monthly run has saved at least three passing accounts per niche, each with its teardown.
- The accounts.py script lives in ~/.local/bin with a test for its post filter.
