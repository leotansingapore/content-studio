# Leo films three reels every Tuesday

Status: started

All apps, owned by Leo, phase 3 (Leo on camera).

## Why

Oren John (0:44:01): someone talking on camera about the business is "the number one most effective and easiest way to promote your business on Instagram", and it "could be the founder". At 0:44:47 he puts the pace at "a three times a week kind of minimum proposition to be gaining traction".

The other face cards hang off this habit. The format test needs reels to compare, cross-posting needs reels to send, and Leo's own posts are the first partnership ads we can run without paying anyone.

## What we have today

Checked 26 Oct 2026.

- `~/.local/bin/generate-weekly-content.sh` runs on Sundays at 12:00 (launchd `com.leo.weekly-content-generator`), not Monday as the card says. It writes three reel scripts and a carousel to `~/social-media-manager/generated/<ISO week>.json` and an Obsidian note at `Obsidian Vault/Content/Weekly/<week> Content Plan.md`.
- Nothing tells Leo the scripts exist. The social-media-manager web app they were written for had its last commit in March.
- The scripts are dated Monday, Wednesday and Friday (W43: 26, 28 and 30 Oct), so a Tuesday filming day already misses the first date.
- The `talking-head-reel` skill turns a recording into a finished reel in Leo's saved signature, run in a Claude session. Every final plays at 1.10x.
- The reels board (`~/Documents/moneybees-reels`, brand `leo`) holds 16 Leo cards. Approving a card gives it the next free 19:30 slot, one per brand per day (`studio/api/_slot.js`), so there is no Wed, Fri and Sun pattern.
- `tools/publish_ig.py` has no route for brand `leo`. @leotan_js is neither in its `IG` map nor connected through Zernio (`IG_ZERNIO`), so leo cards get "post it by hand". That waits on leaks-leo-ig-linked.
- How often Leo posts now is not measured. The inventory's figure of about two reels a week dates from March.

The card's ours line is partly wrong. The scripts are written Sunday noon and land nowhere Leo looks, "Leo films about two a week" is a March posting figure, and the build line's "Zernio posts them" cannot happen until leaks-leo-ig-linked is done.

## What to do

1. Claude: change the generator's dates to the Wednesday, Friday and Sunday after the Tuesday it writes for; the carousel keeps Saturday. Back up the script, write the new version to a temp file and `mv` it in.
2. Claude: at the end of the generator, DM Leo on Telegram with team-posts' `dm()` pattern (`~/.claude/channels/telegram/.env`). One message: "3 scripts for Tuesday are ready", each title with its first line, and the Obsidian note's path.
3. Leo, Tuesday, 45 minutes: film the three scripts in one sitting, phone on a stand, same spot each week (Oren's evergreen set). Two takes each at most, then AirDrop them to the Mac.
4. Leo, or Claude in a session: run `talking-head-reel` on each take in Leo's signature. Then add it to the board with `python3 tools/studio.py add <mp4> --brand leo --slug <week>-<n> --style <signature> --title "<format letter>: <title>"`.
5. Leo: approve on the board. Until leaks-leo-ig-linked is done, post by hand on Wed, Fri and Sun at 19:30 and paste each permalink back on its card.
6. Claude, after leaks-leo-ig-linked: give brand `leo` a route in `publish_ig.py`. Use the `IG` map if the account comes through the Business Manager token, or `IG_ZERNIO` if it is connected under Content Studio's Leo profile. Give brand `leo` its own slot days in `_slot.js` (Wed, Fri and Sun at 19:30, other brands stay daily) and extend the file's built-in asserts to cover it. Check with `node studio/api/_slot.js` and `publish_ig.py --check`.
7. Claude: count Leo's posted reels per week from the board and add the number to the Friday summary.

## Done when

- Four Tuesdays in a row, three reels are filmed and on the board by Tuesday night.
- Twelve founder reels go up in the month, on Wednesdays, Fridays and Sundays.
- The Sunday DM arrives with nobody running anything.
- After leaks-leo-ig-linked, an approved leo card posts on its own at the next Wed, Fri or Sun 19:30 slot and the board records its permalink.
- The card's status and ours line in `marketingNorthStar.ts` give the real script day and how the reels get posted.

## Open questions

- Film on Tuesdays? Recommended: yes, as the plan says. Scripts arrive Sunday and Monday is for the read-back and the briefs.
- Post at 19:30? Recommended: keep the board's 19:30 until the monthly format table says another time does better.
