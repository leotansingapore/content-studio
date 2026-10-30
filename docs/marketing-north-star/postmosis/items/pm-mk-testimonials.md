# The first customers' words show with their profession and city

Status: todo
App Postmosis (postmosis.com), owner Leo + Claude, phase 2 (Proof a professional believes).

## Why

Supergrow keeps its testimonials on a Senja wall it embeds (supergrow.ai/wall-of-love). Taplio puts the writer's follower count on every quote, the largest 657,666 (taplio.com). AuthoredUp heads its quotes "LinkedIn Top Voices trust AuthoredUp" (authoredup.com). All three are in research/teardown.md, move 14.

Their proof is creators with followings. A quote from an agent, a coach or a lawyer, with the profession and city beside it, is the proof none of them shows.

## What we have today

Checked 30 Oct 2026 against ~/postmosis-site origin/main (2b81272) and the vault.

- No testimonials, logos or ratings anywhere on the site. The brief says no page may imply any until they exist (product-marketing.md, Proof points).
- The site's PRICES_AND_PROOF guard fails a money page on "trusted by", "rated N" or "N stars" (tests/built.ts), so a quote block carries words and a name, never a rating.
- product-truth.md lists "Customer counts, logos, quotes, ratings, results" as not claimable because none exist.
- Each account starts on a walkthrough (pm-mk-walkthrough-script), so Leo knows each customer's start date.

## What to do

1. In a customer's fourth week, Leo asks once, in his own words, for two sentences on what changed and for permission to show them with first name, profession and city. One ask, no reminder.
2. Leo files the words and the permission (the message or a screenshot) in ~/Documents/Postmosis/proof/ with the date. Nothing about the customer goes in this public repo.
3. Claude adds a quote block to the home page and the matching /for page: their words as given (spelling fixes only, agreed with them), first name, profession, city. No follower counts, stars, or results they did not state. Home and /for are money pages: the words around the quote pass aicheck under 15 and brief-check, and Leo reads the copy .md before it goes into code.
4. Claude updates the brief's Proof points and the product-truth.md row, so writers know which quotes exist and where they may go.
5. Once one profession has three quotes, Claude drafts a short story page with one of those customers (what they posted before, what they make now). The customer and Leo both read it before it ships.

## Done when

- The first quote is live on home and one /for page with first name, profession and city, and its permission is filed in the vault.
- The brief and product-truth.md list it.
- A profession with three quotes has a story page, live with the customer's written ok.

## Open questions

None.
