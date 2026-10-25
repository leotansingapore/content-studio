# One face across the adviser apps

Status: todo

All apps, owned by Leo, phase 3 (Leo on camera).

## Why

Oren John (0:52:22): "the world is more important than the brand accounts... all the other people, all the experts, your founders, hiring creators, bringing in influencers... are just going to drive more impact", and "people gravitate towards personalities". A brand handle on its own can only put up so many views.

ActivityTracker and Advisor OS sell to the same Singapore advisers and leaders under two names. One person who fronts both carries trust from one to the other, and Leo is the only person who already appears across ActivityTracker, Advisor OS, Content Studio and FINternship.

## What we have today

Checked 26 Oct 2026.

- No founder on either site. A grep of `remix-of-activity-tracker` (origin/main, `src/pages`) and `advisor-os` (origin/main, `src`) finds no "Leo Tan" and no founder section.
- The ActivityTracker brief (`remix-of-activity-tracker/.agents/product-marketing.md`) marks named customers and testimonials as gaps, so the face is the proof the brand has today.
- @leotan_js posts reels written by `generate-weekly-content.sh`, all aimed at FINternship recruiting. His bio and pinned posts were not checked (no login here); Leo reads them in the app.
- Content Studio already has a public link-in-bio page. The editor is `/bio` (`src/pages/LinkInBioPage.tsx`) and the public page is `consultant-content-studio.vercel.app/l/<slug>` (`src/pages/BioPublicPage.tsx`), where every button goes through a redirect that counts the click. Tracked links with UTMs live at `/links` (`/t/<slug>`).
- themoneybees.co/links is a static page for MoneyBees readers, Telegram first. It is the wrong page for advisers.
- Linkfold (the liinks clone in `~/Documents/liinks-clone`) runs on a free Supabase project that pauses after about a week idle, so it should not carry a public bio link.

The card's ours line is correct.

## What to do

1. Leo: answer the first open question. Nothing below starts before a yes.
2. Claude: in Content Studio under Leo's profile, build one link-in-bio page (slug `leo`, or `leotan` if taken). One button per app, in the order Leo picks, recommended:
   - ActivityTracker: book a walkthrough (the Pick a Time demo-session page)
   - Advisor OS: the free sales team check
   - FINternship: the career briefing (themoneybees.co/finternship)
   - Content Studio: only once it opens beyond Leo

   Every button is a tracked link tagged `utm_source=instagram`, `utm_medium=bio`, `utm_campaign=leo-bio`, `utm_content=<app>`.
3. Claude: write the bio through the copy pipeline. Oren's shape (1:45:34) is three lines: what Leo does, why follow, one call to action. Start from five or six founder accounts that front more than one product, pool their bios, score them with `hook-check`, adapt the top moves, and let `hook-check` pick. `aicheck` under 15. Leo pastes the winner into Instagram.
4. Leo: set the bio link to the `/l/` page and pin three posts, one per founder format (faces-leo-formats).
5. Claude: in `generate-weekly-content.sh`, give each script an `app` field and a CTA for that app. Format A names ActivityTracker, format B names the app the tool lives in, and format C ends on the FINternship briefing.
6. Claude: after four weeks, add the `/l/` page's clicks per app to the Friday summary (loop-friday-summary).

## Done when

- The bio link on @leotan_js opens the `/l/` page, and a test tap on each button shows up in its click count.
- The bio copy scored under 15 on `aicheck` and won its `hook-check` round.
- Three posts are pinned.
- Every script in the next two weekly files carries an `app` field and a CTA for that app.
- The card's status and ours line in `marketingNorthStar.ts` name the page and its slug.

## Open questions

- Is Leo comfortable being the public face of ActivityTracker and Advisor OS together? Recommended: yes. They already share a buyer, one face costs nothing extra, and the bio page shows which app each click wanted.
- Where should the bio page live? Recommended: Content Studio's `/l/` page now, since it counts clicks and edits need no deploy. Move it to an app's own domain only if the clicks make that worth a build.
