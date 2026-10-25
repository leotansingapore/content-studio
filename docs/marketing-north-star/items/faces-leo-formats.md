# Three founder formats tested against each other each month

Status: todo

All apps, owned by Leo + Claude, phase 3 (Leo on camera).

## Why

Oren John (0:58:26): "every business should have, in my opinion, between three and five formats you're testing... Those formats become your pillars", run "three to four times a month". At 0:59:11 he says to wait a couple of days after month end, then "compare the views, the saves, the shares, the hook rate, new followers versus old followers... compare them month over month". At 1:01:26 he sets the clock: some traction in 3 to 5 months, good by month 6.

Leo's reels are our cheapest test, with no creator fee and no ad spend. Fixed formats let the monthly review (loop-monthly-review) tell a weak topic from a weak format.

## What we have today

Checked 26 Oct 2026.

- `~/.local/bin/generate-weekly-content.sh` (launchd `com.leo.weekly-content-generator`, Sundays 12:00) asks the Claude CLI for three reel scripts and one carousel for @leotan_js. Its prompt aims every post at recruiting new advisers into FINternship.
- It already has formats, which it calls pillars (origin-story, systems, recruitment, mindset and team-spotlight), and the model picks whichever it likes each week; the W43 file written on 25 Oct used origin-story and systems for two reels and recruitment for the third reel and the carousel.
- Output goes to `~/social-media-manager/generated/<ISO week>.json` and to `Obsidian Vault/Content/Weekly/<week> Content Plan.md`.
- The prompt lists Leo's first-year income as a brand fact, and W43's first reel title leads with it. The careers brief (`tiny-word-hive/.agents/product-marketing.md`, section "Careers page") says income is "mechanics only, never a figure or an 'earn up to'".
- Nothing measures Leo's posts by format. @leotan_js is not linked to Business Manager (leaks-leo-ig-linked), so there are no Graph API insights. The reels board lists 16 cards for brand "leo" in `~/Documents/moneybees-reels/studio/external.json`, each with a style and none with a format.
- Apify's Instagram scraper runs from `content-studio/scripts/refresh-top-posts.mjs` with a cost cap. `at-sql` in `~/.local/bin` runs read-only SQL against the ActivityTracker production database.

The card's ours line ("No formats are set for Leo's account") is wrong: the generator has five pillars, the model picks among them freely, and none of them is one of the three formats the card names.

## What to do

1. Leo + Claude: settle the three formats. The card's starting set:
   - A, what top advisers do differently. One finding from ActivityTracker usage, aggregated, with no person or district identifiable. Written to advisers and leaders; names ActivityTracker.
   - B, adviser tools Leo builds with AI. He shows something he built that week and what it saves an adviser, on camera with a Recordly screen recording, and names the app the tool lives in.
   - C, agency and career life. What a new adviser's first months look like, written to the reader in the careers brief, and it ends on the briefing link.
2. Claude: change the generator so each week has exactly one script per format, each carrying a `format` field (A, B or C) in place of the `pillar` enum, dated for the posting days set in faces-leo-weekly; the carousel stays as it is. Back up the script first (`generate-weekly-content.sh.bak-<date>`), write the new version to a temp file and `mv` it in, never edit it in place.
3. Claude: format A needs one fact a week. Before the CLI call, read one aggregate with `at-sql`, for example the median activities logged per week by the top quarter of advisers against everyone else over the last 30 days, and only when the group spans at least 5 districts. Put the numbers in the prompt as the only facts format A may use. If the query fails, the A script says "no fact this week" and Leo films a second B.
4. Claude: format C follows the careers brief: no income figure, no "earn up to", no AIA in the body. Take the income line out of the prompt's brand facts or mark it "not for use on camera".
5. Claude: after the CLI call, run `aicheck` and `brief-check` (careers brief) on each script and log the scores beside the week's file.
6. Claude: every finished founder reel goes on the reels board with its format. Add `--format A|B|C` to `studio.py add`, or put the letter at the front of the title ("A: ...") if that is the smaller change. The monthly table in loop-monthly-review groups by it.
7. Claude: numbers until @leotan_js is linked. On the 2nd of each month, scrape the account's last 30 posts with the same Apify actor (cap US$1) and join them to board cards by permalink, which gives views and comments but no saves or shares. Those, and new followers, need Insights: Leo sends the month's Insights screenshots, or the account gets connected in Zernio, whichever comes first.
8. Leo: read the table after each month. A format that loses two months running is swapped (Oren's rule). Jev picks the replacement from a short list of candidate formats, on "which would an adviser most likely send to a colleague", and the language model writes its description for the prompt.

## Done when

- Each Sunday the generator writes one A, one B and one C script, each with a `format` field and an aicheck score under 15.
- Format A scripts use only numbers from that week's `at-sql` read, and none names a person or a district.
- No format C script contains an income figure.
- The first monthly table shows views per format for Leo's account, with at least 3 posts in each format.
- The card's status and ours line in `marketingNorthStar.ts` describe what the generator now writes and where the monthly table lives.

## Open questions

- May aggregated ActivityTracker usage appear in public reels? Recommended: yes, as an aggregate over 5 or more districts only, after checking that ActivityTracker's terms allow it.
- Leo's account would speak to advisers (A, B) and to career seekers (C). Keep both? Recommended: yes for three months, since the plan makes Leo the one face; the monthly table shows if C drags the other two down.
- Leo's first-year income in his reels: keep or drop? Recommended: drop it from scripts until leaks-aia-answer says what recruitment content may state, because these reels can become ads.
