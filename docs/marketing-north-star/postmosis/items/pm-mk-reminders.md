# Every booking gets a confirmation, a reminder and a prep note from Leo

Status: todo
App Postmosis (postmosis.com), owner Leo + Claude, phase 1 (Every booking is held).

## Why

Supergrow's founders sign a 4-email onboarding over 3 days, sent through Loops, each with one button. Taplio sends 5 emails in 7 days to chase setup. Predis.ai sends 2 in 13 days, a co-founder's welcome first. All three come from Sequenzy captures, third-party (research/teardown.md, move 6).

For Postmosis the same job sits before the call. A booking that is never held is a lost customer, and the prep note makes the call faster, because the clip they film is the video edited on it (pm-mk-walkthrough-script).

## What we have today

Checked 30 Oct 2026 against ~/calendarios origin/main (7e715fe) and the live booking page.

- Pick a Time sends a confirmation, then reminders 24 hours and 1 hour before the start by default (supabase/functions/send-booking-email and send-booking-reminders, reminder_hours default 24 and 1).
- Every email goes out under the name Pick-a-Time in Pick a Time's own wording. The confirmation carries the page's title and description, and the reminders carry the title, the time, the host and the booker's notes. No setting holds a message of the coach's own.
- A page can pick other reminder times only from 48, 24, 3 and 1 hours before, and only on the Pro plan, which the settings card marks as coming soon; an admin account counts as Pro (src/features/coaching/components/settings/RemindersCard.tsx, usePlan.ts). There is no 2-hour option.
- Each page can call a webhook on every booking, cancel and reschedule (send-booking-email, webhook_url), which an email sender could listen to.
- The demo-session page is titled Activity Tracker Demo, and its description is a general note about pencilling a time in (rendered 30 Oct). Whether Leo's account counts as Pro was not checked.
- Nobody counts no-shows.
- The site collects no emails, and Postmosis has no email sender of its own.

## What to do

1. Start counting now: Leo marks each walkthrough held or not held in the call notes (pm-mk-walkthrough-script). The before count needs four weeks.
2. After pm-mk-booking-page ships, Leo books one slot on himself, and Claude saves the text of the confirmation and reminders he gets in ~/Documents/Postmosis/copy/reminders/.
3. Claude writes three messages in Leo's voice in ~/Documents/Postmosis/copy/reminders/reminders-copy-v1.md: a confirmation at booking, a reminder 3 hours before, and a prep note asking them to film 30 seconds on their phone and bring one question a client asked them. Gates: the brief first, aicheck under 15, brief-check. Leo reads the .md.
4. Stop and ask Leo (dec-pm-email): keep Pick a Time's own emails, with the prep note in the page description and the 3-hour reminder added if his account has Pro, or add an email sender, fed by the page's webhook, so every message is in his words? A sender is a third party and may cost money. Recommended: Pick a Time's own emails first.
5. Leo pastes the prep note into the page description and, with Pro, ticks 3 hours before in the reminder settings, or Claude does it in a session under his login if he asks. If Leo picks a sender, Claude plans it for review first.
6. Claude counts held and not held for four weeks after the new messages go live and reports both rates in the Monday read-back.

## Done when

- A test booking on the Postmosis page gets the confirmation with the prep note in Leo's approved words, then a reminder on the day (3 hours before if his account has Pro).
- Eight weeks of held and not-held counts exist, four before the change and four after.

## Open questions

Send them from the booking tool, or add an email sender? This is dec-pm-email; the recommendation is Pick a Time's own emails first, with the prep note in the page description.
