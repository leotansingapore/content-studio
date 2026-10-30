# Customers' own posts run as partnership ads

Status: todo
App Postmosis (postmosis.com), owner Leo, phase 4 (Paid and partners).

## Why

Predis.ai runs ads from creators' own pages "with Predis.ai": 4 of the 22 Meta Ad Library results that loaded on 30 Oct (facebook.com/ads/library, q=Predis.ai). It also pays $2,000 to an affiliate whose shout-out reaches 1M impressions in 15 days (predis.ai/affiliate-success-kit). Both are in research/teardown.md, move 22.

A professional's own post, run as an ad from their page, reaches people in the same work with a real face on it.

## What we have today

Checked 30 Oct 2026 against ~/postmosis-site origin/main (2b81272) and the vault.

- None. There are no customer posts to run and no testimonials yet (pm-mk-testimonials).
- No pixel or ad tag on the site, and no ad account is named for Postmosis in either repo.
- Standing rule: real faces before AI faces.

## What to do

1. Wait until pm-mk-testimonials has customers who agreed to be shown, and pm-mk-booking-source shows which page brings bookings.
2. Stop and ask Leo (dec-pm-paid): spend on partnership ads once customers agree? It is money and a third party.
3. If yes, Leo asks one customer, once, to run their best post made in Postmosis as a partnership ad from their page. Their written permission and the dates go in ~/Documents/Postmosis/proof/.
4. Claude sets it up with Leo in Meta Ads Manager: a budget cap Leo names, the walkthrough link with ref=partner-ad-<yyyy-mm>, judged on cost per booked walkthrough.
5. When the cap is spent, Claude reports spend, bookings and cost per booking. Leo decides whether to run more.

## Done when

- Leo's answer is in dec-pm-paid's decided field.
- If yes: one partnership ad ran within its cap with the customer's written permission filed, and its cost per booked walkthrough is reported.

## Open questions

Spend on partnership ads once customers agree? This is dec-pm-paid.
