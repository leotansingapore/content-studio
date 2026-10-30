# Every booked walkthrough shows the page or post it came from

Status: todo
App Postmosis (postmosis.com), owner Claude, phase 1 (Every booking is held).

## Why

Shares work with the hub card loop-creator-links (every booked call shows which creator or post it came from). The hub card covers the MoneyBees career funnel and creator links, and the weekly report stays on the hub's loop-monday-readback. This card covers postmosis.com and Leo's Postmosis posts.

Typefully counts sign-ups from an affiliate's shared threads and profile pages as affiliate visits, so each shared page works as a tracked link (support.typefully.com, "Earn with Typefully's affiliate program", in research/teardown.md). Postmosis's live sitemap listed 113 URLs on 30 Oct 2026; the census in docs/seo-north-star/research/census.md counted 111 that morning, before two vault pages shipped. Without a source on each booking, nothing says which of them brings walkthroughs.

## What we have today

Checked 30 Oct 2026 against ~/postmosis-site origin/main (2b81272), the live home page, ~/calendarios origin/main (7e715fe) and content-studio origin/main (268438fe).

- Every walkthrough button is one component, BookWalkthrough in src/components/ui/ButtonLink.tsx, which renders BOOK_WALKTHROUGH.href from src/site/config.ts. Hero, CtaBand, SiteNav (desktop and phone menu) and the 404 page use it.
- The site runs no page counter: no PostHog, Google tag, Vercel Analytics or pixel in the repo or the live home HTML. Its privacy page says "This website has no analytics." (src/content/legal/privacy.md).
- Pick a Time saves ?src= and ?ref= on a booking only as a pair, each trimmed, up to 128 characters, no control characters (calendarios PublicBookingPage.tsx, CoachingService.ts, normalize_external_token). A lone ?src= is dropped.
- Content Studio's tracked links, /t/<slug>, count taps and people per link per day (docs/tracked-links.md). Members make them, and Leo's sign-in can.
- Six test files in the site (money, audiences, compare, features, templates and tools) find walkthrough links by an exact match on BOOK_WALKTHROUGH.href.

## What to do

1. Claude, in ~/postmosis-site: add walkthroughHref(ref) to src/site/config.ts, returning the booking URL with src=postmosis&ref=<ref>, the ref cut to 128 characters. Move BookWalkthrough into a small "use client" file that reads usePathname() and uses the page path as the ref (home is ref=home). A ref the visitor arrived with in the URL wins over the path, so pm-mk-made-with-link and Leo's posts can pass one through.
2. Update the six test files that match walkthrough links on BOOK_WALKTHROUGH.href exactly (money, audiences, compare, features, templates and tools) to match by the URL prefix, and have money.test.ts check each link carries its page's ref. Add a unit test for walkthroughHref: home, a nested path, an over-long ref cut. Run next build and the tests, check 390 and 1440 wide, push to main.
3. Leo's posts link the walkthrough with ref=<network>-<yyyy-mm-dd>, directly or through a tracked link /t/<slug> with the same target, so taps count even when nobody books.
4. With Leo's ok, make one test booking from a page link, check the booking shows its source and ref in Pick a Time, then cancel it. If the live Pick a Time drops them, stop: the fix is in calendarios, whose database side Lovable manages, so it waits on Leo's say.
5. Each week Claude counts bookings by ref and adds the line to the hub's Monday read-back, counts only.
6. Stop and ask Leo before adding a page counter (dec-pm-counter, recommended Vercel Web Analytics, cookie-free). It also needs the privacy page line changed.

## Done when

- Every walkthrough link on the live site carries src=postmosis and its page's ref, checked on home, /plans, /about, one /for page and one guide, and the site's tests pass.
- A test booking shows its ref in Pick a Time.
- The Monday read-back shows bookings by ref two weeks running.

## Open questions

Add a cookie-free page counter to postmosis.com, such as Vercel Web Analytics? This is dec-pm-counter; the recommendation is yes.
