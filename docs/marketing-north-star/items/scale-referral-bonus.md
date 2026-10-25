# Creators earn a bonus for bringing in creators at their level

Status: todo
App all apps, owner Leo + Claude, phase 7 (Scale what won).

## Why

Hector Serrano (Wispr Flow): "we will pay our creators $100 if they bring in someone that's at their level or above their level. And we make this very clear. We do not want beginners in our group." Referred creators send their Instagram or portfolio and he says yes or no himself. He calls it "a very easy way to scale your program, especially the 10 to 20 range", and one of the main things that took Wispr's group from five to 50 creators, because "good creators know good creators the same way good employees know good employees."

Kenyon of Sideshift (10:37 in 01-video-notes.md) adds what to look for in a new creator: content quality over past view counts, someone who can talk straight to camera, and responsiveness during onboarding.

For us this is the cheapest recruiting channel once five creators are working, and it brings people who already trust that we pay.

## What we have today

Checked 26 Oct 2026.

- No creator programme is running yet, and no roster exists (loop-roster, todo).
- The pay structure for creators (pilot-smart-retainer, todo) has no referral line.
- pilot-outside-creators (todo) defines the screening this card reuses: scrape a candidate's posts with Apify, transcribe with whisper-cli, and let Jev shortlist on fit.
- The ActivityTracker and CMFAS Prep customer referral programmes pay for customers, not creators, and are separate from this.

The card's `why` line says the bonus "took Wispr from 10 to 20 creators". Hector says it helps most in the 10 to 20 range and is one of the main ways they grew from five to 50.

## What to do

1. Leo sets the amount (see Open questions) and Claude adds one line to the creator brief and the creator agreement: "Bring in a creator at or above your level and earn SGD <amount> once their first video is approved. No beginners."
2. Claude adds a `referred_by` field to the creators table in the Lark Base roster and a `referral bonus` type to the payouts table.
3. A creator sends the candidate's handle to the creator group or to Leo. Claude scrapes the candidate's last 30 posts and the referrer's, and works out both medians for views per post.
4. Jev judges "at their level" (pinned jev-1.13.0). It reads the candidate's captions and transcripts against the brief and against the referrer's, and asks whether the candidate talks to camera with a story, posts in our niche, and makes content as good as the referrer's. The median views go beside the answer as a number, never as the only test, since Kenyon warns past views can come from an easy campaign. If Jev returns nothing, Leo judges from the posts.
5. Leo says yes or no, as Hector does, within two days. A yes goes through the normal onboarding call; a no gets a short thank-you to the referrer.
6. Once the new creator's first video passes review, Claude adds the bonus row to that month's payouts, paid with the referrer's other pay by the 5th of the next month.
7. The monthly review counts referred creators separately, so Leo can see whether they stay longer and perform better than ones found by keyword search.

## Done when

- The brief and the agreement both carry the referral line with the amount.
- The roster has `referred_by`, and every referred creator has it filled in.
- Every referred candidate got Jev's read and Leo's yes or no within two days.
- Every bonus was paid the month after the new creator's first approved video, on time.
- The monthly review shows referred and keyword-found creators side by side.

## Open questions

- How much? Recommended: SGD 100, close to Hector's US$100 and a third of one creator's monthly floor, paid only after an approved first video so it cannot be gamed with sign-ups.
- Pay again if the referred creator stays three months? Recommended: no, keep it to one payment until we see referred creators leaving early.
