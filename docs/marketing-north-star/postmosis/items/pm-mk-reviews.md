# Postmosis has G2 and Capterra profiles with real reviews

Status: todo
App Postmosis (postmosis.com), owner Leo, phase 4 (Paid and partners).

## Why

Supergrow leads its homepage with a "4.8/5 on G2" badge (supergrow.ai), and Predis.ai shows "Rated 4.7/5 on G2, Trustpilot, Shopify" (predis.ai). Both are in research/teardown.md, move 23. The teardown could not read G2, Capterra or Trustpilot themselves, since all three returned 403, so the only ratings it saw are the companies' own badges.

## What we have today

Checked 30 Oct 2026 against ~/postmosis-site origin/main (2b81272) and the vault.

- No G2 or Capterra profile, and no customers to ask yet.
- The brief bars ratings Postmosis does not have (product-marketing.md, Proof points).
- The site's PRICES_AND_PROOF guard fails a money page on "rated N" or "N stars" (tests/built.ts), so a rating on the site needs the guard changed with it.
- pm-seo-directories in the SEO book covers the free directories; this card covers the two review sites only.

## What to do

1. Wait until ten customers agree to review, asked once in week four together with the testimonial request (pm-mk-testimonials).
2. Stop and ask Leo before opening the profiles. G2 and Capterra are third parties, and the listings are public.
3. Leo claims both profiles under his own login. Claude drafts the listing text from the claimable rows of product-truth.md only, through aicheck under 15 and brief-check.
4. Leo sends each agreeing customer the review link, once. No reward for a review unless Leo decides one and G2's and Capterra's own rules allow it.
5. Once a profile has a rating from real reviews, Claude can add it to the site with the guard changed to allow that exact line. Leo reads the copy .md first.

## Done when

- Both profiles exist with at least ten real reviews.
- If the rating goes on the site, the guard allows only that line and the site's tests pass.

## Open questions

None.
