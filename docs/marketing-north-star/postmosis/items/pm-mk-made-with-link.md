# Link-in-bio and review pages carry a small Made with Postmosis link

Status: todo
App Postmosis (postmosis.com), owner Claude, phase 3 (Reach that compounds).

## Why

Typefully counts sign-ups that come from an affiliate's unrolled threads and Typefully Profile pages as affiliate visits, so every shared page is a referral link (support.typefully.com, "Earn with Typefully's affiliate program"). One unrelated business tagged #madewithpredisai in its own ad (Meta Ad Library, q=Predis.ai). Both are in research/teardown.md, move 13.

The people who open a professional's link-in-bio page or review link are often professionals who post too.

## What we have today

Checked 30 Oct 2026 against content-studio origin/main (268438fe).

- The public link-in-bio page, /l/<slug> (src/pages/BioPublicPage.tsx with src/components/bio/BioView.tsx), shows the name, headline, photo and links, with no link back to Postmosis.
- The public review page, /review/<token> (src/pages/PreviewReviewPage.tsx), shows "Postmosis - post for review" as plain text above the post, with no link.
- A bio page lives in cs_bio_pages (supabase/hub/015_link_in_bio.sql): slug, display name, headline, photo and links, and no settings column. A per-brand switch the public page can read needs a new column and a change to cs_save_bio_page, which is a schema change.
- Both public pages run on functions deployed without JWT verification that may call only their own service-role SQL functions (CLAUDE.md).

## What to do

1. Stop and ask Leo (dec-pm-made-with-link): show the link on customers' public pages, with a switch to hide it? Recommended: yes, small and in the footer. Ask in the same message for the schema change the switch needs.
2. Claude adds a one-line footer to BioView and PreviewReviewPage, "Made with Postmosis", linking https://postmosis.com/?ref=bio or ?ref=review, in a new tab with rel="noopener". The line passes brief-check. The site's walkthrough link passes an arriving ref through (pm-mk-booking-source, step 1).
3. If Leo approves the switch: a migration in supabase/hub/0NN_bio_made_with.sql adds hide_made_with boolean default false to cs_bio_pages and to cs_save_bio_page, with its .test.sql. It is reviewed, then Leo says yes before it is applied by hand. The link-in-bio function returns the flag, and /bio gets the toggle. The review page keeps the link unless Leo asks for the same switch there.
4. Tests: each link carries its ref, and a hidden bio page renders no link. Run npm run build before the push and grep the live bundle after it (CLAUDE.md).
5. Check a live /l/<slug> and a /review link at 390 and 1440 wide.
6. Claude counts bookings with ref=bio and ref=review weekly in the Monday read-back.

## Done when

- A live bio page and review page show the footer link with its ref, and the tests pass.
- If the switch is approved, a hidden bio page shows no link, proven by a test.
- Bookings with ref=bio or ref=review are counted weekly.

## Open questions

Show the link on customers' public pages, with a switch to hide it? This is dec-pm-made-with-link; the recommendation is yes, in the footer.
