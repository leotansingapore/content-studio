# A Product Hunt launch, once a visitor can start alone

Status: todo
App Postmosis (postmosis.com), owner Leo, phase 4 (Paid and partners).

## Why

Taplio's 2022 launch was #1 of the day with 1,008 upvotes (producthunt.com/products/taplio). Supergrow's, on 19 Feb 2024, was #1 of the day and the week with 947 (producthunt.com/products/supergrow). Typefully's third launch, in Jun 2023, drew 928 and #1 of the day (producthunt.com/products/typefully). AuthoredUp drew 93 and FeedHive 53. Predis.ai's co-founder called his first launch "a big mistake" because they were not ready (indiehackers.com, self-reported). All in research/teardown.md, move 24, with the Product Hunt pages read through a web fetch.

Launch visitors want to try it that day, which needs a way to start alone.

## What we have today

Checked 30 Oct 2026 against the live site and content-studio origin/main (268438fe).

- No Product Hunt page.
- No sign-up: Book a walkthrough is the only way in, so launch visitors would meet a booking page (src/pages/Auth.tsx, the live site).
- The decision that gates it, dec-pm-self-serve, is open, recommended not yet.

## What to do

1. Wait for pm-mk-self-serve to ship. This card does not start before.
2. Then stop and ask Leo for a launch date and his go to post in public. Product Hunt is a third party.
3. Claude drafts the listing (name, tagline, description, first comment, 4 to 6 gallery images from the live app) with the phone-video gap as the line. Gates: the brief first, hook-check for the tagline, aicheck under 15, brief-check. Leo reads it.
4. Leo films a 60-second video and edits it in Postmosis.
5. On launch day Leo answers every comment himself. Nobody is messaged to ask for upvotes.
6. For 7 days Claude counts visits and new accounts from Product Hunt, then reports.

## Done when

- The launch has run and every comment has a reply from Leo.
- A 7-day report gives upvotes, visits and new accounts.

## Open questions

None.
