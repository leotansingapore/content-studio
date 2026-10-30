# Every walkthrough ends with the account set up and a first post made

Status: todo
App Postmosis (postmosis.com), owner Leo + Claude, phase 1 (Every booking is held).

## Why

None of the eight rivals sets up an account with a one-person buyer (research/teardown.md, pattern 1). Supergrow's pricing page offers "Book a demo" to anyone, but only Enterprise adds an onboarding call (supergrow.ai/pricing). AuthoredUp gives onboarding by a person only from 10 profiles (authoredup.com/pricing), and Later keeps its strategy call for brands (later.com). The teardown calls a walkthrough where Leo sets it up "the one door none of them opens for a solo buyer."

What the rivals do alone, the script does live. Supergrow's founder-signed emails walk one feature a day: connect LinkedIn, try PostCast, check your weekly report (Sequenzy capture, third-party).

## What we have today

Checked 30 Oct 2026 against content-studio origin/main (268438fe), the vault and the memory notes of 28 and 29 Oct.

- Leo runs every walkthrough and sets up the account (his call of 28 Oct, docs/marketing-north-star/postmosis/leo.md). The sign-in page has no sign-up form (src/pages/Auth.tsx).
- Every new brand answers "What do you do?", and the writers draft for that profession since 28 Oct (product-truth.md, "Shipped 28 Oct").
- Leo switches posting on for one customer with ~/.local/bin/postmosis-posting. A customer connects up to 3 accounts in all across Instagram, Facebook, TikTok, LinkedIn, YouTube and Threads (product-truth.md; the live /plans page says the same).
- The app's first-run page, /welcome, has three steps: Set your voice, Write your first post, Plan your week (src/pages/WelcomePage.tsx).
- No written script, checklist or note after a call exists in either repo or the vault.

## What to do

1. Claude drafts a 20-minute checklist at ~/Documents/Postmosis/walkthrough/script.md, in the vault because call notes will sit beside it:
   - minutes 0 to 3: what they do, where they post, how often today;
   - 3 to 6: brand kit ("What do you do?", headshot, colour, sign-off) and Your voice from 3 to 5 past posts;
   - 6 to 10: one carousel from a question a client asked this month;
   - 10 to 15: one video from the clip the prep note asked them to film (pm-mk-reminders), cut, captioned and exported;
   - 15 to 18: their week on the calendar with posting slots, and posting switched on if they want it;
   - 18 to 20: the price in Leo's words, the peer ask (pm-mk-peer-ask) and the next step.
2. Leo reads it, cuts anything he would not say, and runs it on his next three walkthroughs.
3. After each call, Leo or Claude (from Leo's voice note) writes a note in ~/Documents/Postmosis/walkthrough/calls/: date, profession, what they made, where it stuck, whether posting went on, held or not held. Names and customer details stay in the vault and never enter this public repo.
4. After five calls Claude reads the notes and rewrites the steps that ran long. The total stays at 20 minutes.
5. Claude adds a weekly count (calls held, accounts set up, first carousel made, first video made) to the hub's Monday read-back (loop-monday-readback), counts only.

## Done when

- script.md is in the vault and Leo has run it on three walkthroughs.
- Five call notes exist, each naming what the customer made on the call.
- The Monday read-back shows calls held and accounts set up four weeks in a row.

## Open questions

None.
