# Every booked call shows which creator or post it came from

Status: started
App all apps, owner Claude, phase 2 (the loop can see).

## Why

Kenyon of Sideshift (38:41): with organic creators "it's always the attribution piece that is so foggy, that is so gray. You never really know which videos are performing the best." The big hit is obvious, but "for a lot of those other videos that are still driving value for you, you're not actually fully aware of which of those pieces of content are the most effective." Oren John (1:43:17) says marketers who can measure their results are the ones who get paid what they are worth: "If you are the person who is good at being able to measure it ... that's how you get paid what you're worth."

The pilot's day-30 verdict is cost per booked career call from creator posts and ads. The smart retainer pays a bonus per booked call through each creator's link. Neither works unless a booked call carries the creator and the post it came from.

## What we have today

Checked 26 Oct 2026.

- Content Studio's brand kit tags the links an adviser posts with source, medium and campaign UTMs, though not utm_content (the "About link tracking" tip in src/pages/BrandPage.tsx).
- Content Studio already has tracked short links, which the card's ours line leaves out: `/t/<slug>` links with a label and an optional campaign, taps and unique people per link per day, and a public report per campaign that can be switched on (docs/tracked-links.md, src/pages/TrackedLinksPage.tsx, supabase/functions/tracked-link). Only members can make links; Leo's sign-in can.
- The career funnel's forms are on themoneybees.co (tiny-word-hive): the FINternship ebook form posts `source_page: finternship_ebook` and the careers application posts `careers_page`, both through the site's contact-form function (supabase/functions/contact-form/index.ts and routing.ts).
- The contact_submissions table already has utm_source, utm_medium and utm_campaign columns (migration 20260211164750), but neither the forms nor contact-form fill them. No utm_content column exists.
- contact-form hands both forms to ActivityTracker WhatsApp workflows (`WA_HOOKS` in routing.ts), which file a card on the MoneyBees board with the form's Source ("FINternship ebook", "MoneyBees careers") and book the call. No link or UTM reaches the card.
- Pick a Time keeps `utm_*` in the URLs its PostHog records (calendarios src/lib/scrubUrl.ts), for anyone who books a page directly.

## What to do

1. Claude: fix one naming scheme and use it everywhere, filling the three columns that already exist so no migration is needed:
   - utm_source: the creator's Instagram handle in lower case, without the @;
   - utm_medium: `ig`, `tiktok` or `ad`;
   - utm_campaign: the pilot and the post, for example `fin-pilot-oct-p03`, or `fin-pilot-oct-bio` for a bio link.
2. Claude: for each creator and channel, make one tracked link in Content Studio /links (signed in as Leo), in a campaign named for the pilot. Its target is the career page the pilot points at, with the three UTMs. Record each link on the creator's row in the roster (loop-roster). The tracked link gives taps and people per creator even when nobody fills the form.
3. Claude, in tiny-word-hive: on the first page view of a visit, read `utm_source`, `utm_medium` and `utm_campaign` from the URL and keep them in sessionStorage, so they survive the click from the landing page to the form. CareersEbookOffer and CareersApplyForm send them in the contact-form body.
4. Claude, in contact-form: accept the three values only if each is 1 to 80 characters of `a-z 0-9 . _ -` (this is a public endpoint, so anything else is dropped, not saved), write them into the existing columns, and pass them on in the WhatsApp hook body. Add cases to the contact-form tests for a clean value, a long value and a value with other characters.
5. Claude, in remix-of-activity-tracker: the workflow that files the card writes the three values into a card field named "Arrived from" as `source / medium / campaign`. First check how card fields are stored on the MoneyBees board. If adding a field is a schema change, stop and ask Leo; otherwise add it as board data.
6. Claude: the Monday read-back (loop-monday-readback) counts, for the week, contact_submissions per utm_source, and how many of their cards got an appointment. That is booked calls per creator, read-only.
7. Partnership ads use the same creator's link with `utm_medium=ad`, so an ad lead lands under the creator too, and the ad set name carries the creator handle.
8. Test with unit tests and nothing live. A test submission on the real form texts a real WhatsApp number and posts a Lark alert (memory never-test-live-side-effects.md), so the first end-to-end proof is a real lead from a creator's link.

## Done when

- Every creator in the roster has one tracked link per channel, and Content Studio shows their taps.
- The contact-form and tiny-word-hive tests pass, and the cases for rejected values are among them.
- The first real lead from a creator's link shows the creator in contact_submissions.utm_source and in the card's "Arrived from" field.
- The Monday read-back prints booked calls per creator for the week.

## Open questions

1. Put the post in utm_campaign so the existing columns are enough, or add a utm_content column? Recommended: utm_campaign. It needs no schema change, and the campaign name can carry the post number.
2. Which page do creator links point at, the FINternship ebook page or the careers briefing form? Recommended: the page the pilot's ads point at, which Leo picks in pilot-partnership-ads, so that organic and paid leads land on the same form and can be compared.
