# One base holds every creator, their posts, pay and status

Status: todo
App all apps, owner Claude, phase 2 (the loop can see).

## Why

Angus Sewell's reel (around 0:16; no transcript on file, so this is from 01-video-notes.md) puts tracking third in his stack: log every creator in one base, so the agent and the people working the program read the same list. Kenyon of Sideshift (3:47) says "the first person I usually think about bringing on is just like a general manager, admin ops", someone who takes over "video reviews", "sending out updates to creators on a daily basis" and check-ins. That person needs one place that holds the creators, their videos and what they are owed. At 36:24 he adds that top creators can later take on managing, which also starts from knowing who is doing well.

Hector Serrano (Wispr Flow) adds the reason to get pay right from day one: a program that treats creators as transactions loses its best ones, "because they're going to go to other brands that treat them better and actually reward them for the hard work." A roster where every payout row has a paid date is how we keep the "pay creators on time" principle.

## What we have today

Checked 26 Oct 2026.

- No creator roster exists. Searched memory, the App Growth Playbook folder and both repos; no base, sheet or table holds creators.
- lark-cli is installed at /opt/homebrew/bin/lark-cli, and the lark-base skill covers creating a Base, its tables, fields, views and formulas (`lark-cli base`, acting as Leo with `--as user`).
- Content Studio approves its own AI makes but takes no outside submissions; moving review there is a later card (scale-review-in-studio).
- The pay rules this Base has to hold are on the page already: a SGD 300 floor for 8 approved videos a month, plus a bonus per booked call, with the floor falling away once bonuses pass it (pilot-smart-retainer). The bonus amount is still Leo's decision.

## What to do

1. Claude: create a Lark Base named "Creator roster" in Leo's Lark, as Leo (`--as user`), with three tables.
   - Creators: handle, platform, name, app (FINternship, ActivityTracker, SearchBlueprint, CMFAS Prep), kind (agency adviser, outside creator, customer), niche, status (shortlist, contacted, onboarding, active, paused, rotated out), how we found them, onboarding call date, contract signed date, partnership-ad permission (yes or no, with the date), collab with the brand account (yes or no), floor in SGD, video quota, bonus per booked call, tracked links per channel (from loop-creator-links), median views (filled weekly from loop-pattern-db), payout method, and notes.
   - Submissions: creator (linked), brief (a link to its Lark Doc, from loop-brief-template), due date, video link, submitted at, review state (waiting, changes asked, approved, rejected), feedback (text plus a voice note or Loom link), compliance checked (yes or no, by whom), approval code if leaks-aia-answer asks for one, posted URL, posted at, views after 7 days, and whether it ran as an ad (with the ad set name).
   - Payouts: creator (linked), month, approved videos (a count from Submissions), quota met (a formula), floor, booked calls, bonus total, amount owed (a formula), due date (7 days after month end), paid date, payment reference, and paid by.
2. Claude: the amount-owed formula follows Hector's smart retainer. If the quota is met, the creator gets the larger of the floor and the bonus total; if not, the bonus total alone. Check it against three sample rows before anyone is paid: quota met with bonuses under the floor (pays the floor), quota met with bonuses over it (pays the bonuses), and quota missed (pays the bonuses only). Delete the sample rows afterwards.
3. Claude: views to set up: "Active creators", "Reviews waiting" (Submissions in waiting, oldest first), and "Unpaid" (Payouts with no paid date, past due first).
4. Claude: on the 1st of each month, add a Payouts row per active creator for the month before. This runs inside the Monday read-back on the first Monday, or by hand until that job exists.
5. Claude: give the read-back what it needs. It reads Creators for the handles to scrape and the tracked links to count, and the Friday summary (loop-friday-summary) reads the three views' counts.
6. Leo: say who else may open the Base. Recommended: Leo only now, and the VA from scale-va-ops later with edit rights on Submissions and Payouts.
7. Payout methods and contact details stay in the Base only. Never copy them into this repo, a spec or a Telegram message.

## Done when

- The Base exists with the three tables, their fields and the three views, and Leo can open it.
- The amount-owed formula gives the right answer on the three sample rows, recorded on this card before the rows are deleted.
- The brief template's Lark Doc is linked from the Submissions table.
- The first real creator row exists when pilot-advisor-creators or pilot-outside-creators signs someone.

## Open questions

1. A Lark Base now, or a table in Content Studio from the start? Recommended: Lark Base now. It needs no build, and the VA can use it on day one; review moves into Content Studio once five creators post (scale-review-in-studio).
2. Pay within 7 days of month end? Recommended: yes, and put that date in each creator's contract, so "on time" has a date to check against.
