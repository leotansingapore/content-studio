# Customers earn a share for each professional they refer

Status: todo
App Postmosis (postmosis.com), owner Leo + Claude, phase 4 (Paid and partners).

## Why

Buffer pays 25% of a new customer's payments for 12 months (buffer.com/partners), and AuthoredUp the same, tracked by Reditus (authoredup.com/affiliate-program). Taplio pays 30% for a year through Rewardful (taplio.com/affiliates). Supergrow pays 30% for life with a 60-day cookie (supergrow.ai/affiliate-program), Predis.ai 30% for life through FirstPromoter (predis.ai/affiliate-success-kit) and Typefully 20% recurring (help.typefully.com/affiliate). All in research/teardown.md, move 19.

## What we have today

Checked 30 Oct 2026 against ~/postmosis-site origin/main (2b81272) and ~/calendarios origin/main (7e715fe).

- No public price, so no programme (Leo's call of 28 Oct: pricing comes on the walkthrough).
- The peer ask at the end of each walkthrough (pm-mk-peer-ask) is the unpaid version.
- Pick a Time keeps a src and ref pair on each booking (calendarios useBookingFlow.ts), which can carry a referrer's code.

## What to do

1. Wait for a public price, from pm-mk-self-serve or a price on /plans.
2. Stop and ask Leo (dec-pm-referrals): pay 25% for 12 months, as Buffer and AuthoredUp do? Money, billing and a third-party tracker all need his yes.
3. If yes, pick a tracker that works with the billing Leo uses; Rewardful, Reditus and FirstPromoter are the ones the rivals run. Claude writes the terms page: rate, length, cookie, payout day, and banned channels such as brand-keyword ads and coupon sites, which Buffer and Typefully ban. Gates: aicheck under 15, brief-check, Leo reads it.
4. Each customer gets a referral link in the app. Payouts go monthly, on the stated day.
5. Each month Claude counts referred bookings, new paying customers and payouts.

## Done when

- Leo's answer is in dec-pm-referrals' decided field.
- If yes: the terms page is live, every customer has a link, and the first monthly payout went out on its day.

## Open questions

Pay 25% for 12 months once there is a public price? This is dec-pm-referrals.
