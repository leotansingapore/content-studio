# Creators who stop performing are rotated out

Status: todo
App all apps, owner Leo + Claude, phase 7 (Scale what won).

## Why

Kenyon of Sideshift (44:46) gives this as the kind of job his platform's agent should do in one line: "cut all of your creators that are averaging, you know, under 300 views a post ... these guys are shadowbanned. Pay them out for the work that they've done or what I owe them and then cut them." It is his example of routine creator ops, and it carries his number and his order of steps: pay what is owed, then cut.

Hector Serrano (Wispr Flow) grows a team in steps, "going from five to 10, from 10 to 20, from 20 to 40", then coasts at 40 to 60 and only adds "killers". Bringing on too many at once breaks the culture and leaves nobody coached. He also warns that creators compare brands by payout per creator, so a small team that pays well beats a big one that pays thin.

So rotation keeps the group small and paid, and makes room for better people.

## What we have today

Checked 26 Oct 2026.

- No creator has been signed and no roster exists. loop-roster (todo) defines the Lark Base with creators, submissions and payouts.
- Views per post per creator will come from the pattern store (loop-pattern-db, started) and the Monday read-back (loop-monday-readback, started, but no job exists yet in ~/.local/bin or ~/Library/LaunchAgents). Booked calls per creator come from loop-creator-links (started).
- The monthly format review (loop-monthly-review, todo) is the meeting this check joins.
- No creator agreement exists yet (02-inventory.md, Characters), so there are no written terms for how a creator leaves or what happens to their videos already running as ads.

## What to do

1. Claude adds two numbers per creator to the monthly review, from the roster and the pattern store: average views per post over the last 30 days, and booked calls through their link or ads in each of the last two months.
2. A creator is flagged when either rule holds: an average under 300 views a post across at least four posts, or no booked call in two months running. Both are arithmetic on counts, so no model decides the flag. Creators in their first 30 days are never flagged.
3. Leo decides each flagged case at the monthly review: keep with one change to try (a new format, a new hook), or rotate out. Claude shows each flagged creator's last three reviews from the roster beside the numbers, so the call is made on more than one figure.
4. A creator who is rotated out goes in Kenyon's order. First, pay everything owed for approved videos and booked calls by the next payout date. Then a short, kind message from Leo saying the month's numbers and thanking them, with no chasing afterwards. Then their status is set to "alumni" in the roster, and their partnership-ad permissions are checked so no ad runs past the end date they agreed.
5. Replace through the referral bonus first (scale-referral-bonus), then keyword search (pilot-outside-creators). Grow in Hector's steps, 5 then 10 then 20 then 40, and add a step only when the current group's median creator clears the read-back's bar.
6. Claude adds a leaving clause to the creator agreement before anyone signs: notice of one month, pay for approved work always settled, and how long their videos may keep running as ads after they leave. Leo approves the wording.

## Done when

- The monthly review shows both numbers for every active creator, and the flagged list follows the two rules exactly.
- Every creator rotated out was paid in full on or before the next payout date, and the roster shows the paid date.
- No partnership ad from an alumni creator runs past the end date they agreed.
- The creator agreement has the leaving clause, and every signed creator signed that version.

## Open questions

- Is 300 views the right floor for us? Recommended: start with Kenyon's 300 and reset it after two months of our own read-back data, since Singapore accounts are smaller than the US programs he runs. The views floor moves to whatever the bottom fifth of our creators averages.
- A creator under 300 views who still books calls: keep or rotate? Recommended: keep, and treat the low views as a possible shadowban to look into, because calls are what the pilot is judged on. A creator with big views and no calls for two months is the one to rotate.
