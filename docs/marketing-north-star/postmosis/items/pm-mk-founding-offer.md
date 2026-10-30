# The first 20 professionals get Leo's setup and a held price for a review

Status: todo
App Postmosis (postmosis.com), owner Leo, phase 2 (Proof a professional believes).

## Why

AuthoredUp grew from a free beta. Its about page says the founders launched it in July 2022 and in 13 months gathered 30,000 beta users, spoke to 500 people and shipped 15 releases (authoredup.com/about-us). FeedHive's founder is quoted saying he gave his first 25 users lifetime free use (Starter Story, an AI-compiled profile, third-party). Both are in research/teardown.md, move 5.

Both traded early access for feedback and a story to tell. A held price and Leo's setup do the same without a free tier.

## What we have today

Checked 30 Oct 2026 against ~/postmosis-site origin/main (2b81272) and the vault.

- No prices on the site (Leo's call of 28 Oct). /plans lists what every account includes and says "Your price comes on the same call." (src/content/plans.ts).
- The site's PRICES_AND_PROOF guard fails /plans on a dollar figure, "per month", "free trial" or "money back" (tests/built.ts).
- How a walkthrough customer is billed, and where a held price would be written down, is not recorded in either repo.
- Every walkthrough already includes Leo's setup (pm-mk-walkthrough-script).

## What to do

1. Stop and ask Leo (dec-pm-founding): offer the first twenty professionals a held price for feedback and a written review at week four? Recommended: yes, if a price is named on the walkthrough anyway.
2. If yes, Leo sets the terms: how long the price holds, what the review asks for, and what happens if they leave. Claude writes them in ~/Documents/Postmosis/founding-offer.md with the places taken (first names only, in the vault).
3. Claude drafts one line for /plans and one for the walkthrough script naming the offer and the places left, with no price on the site. /plans is a money page: aicheck under 15, brief-check, PRICES_AND_PROOF still passing, and Leo reads the copy .md before it goes into code.
4. Claude updates the places-left number on /plans each time one goes. When none are left, the line comes off.
5. The held price goes on the customer's billing record, wherever Leo bills from. If that needs a billing change, stop and ask Leo first.
6. At week four the review ask goes out once, together with the testimonial ask (pm-mk-testimonials) and the review-site ask (pm-mk-reviews).

## Done when

- Leo's answer is in dec-pm-founding's decided field.
- If yes: the line is live on /plans with the places left, the site's tests pass, and each founding customer's held price is on their billing record.
- Each founding customer was asked for a review once, at week four.

## Open questions

Offer the first 20 a held price in return for a written review? This is dec-pm-founding.
