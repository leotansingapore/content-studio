# Visitors who did not book see Leo on camera again

Status: todo
App Postmosis (postmosis.com), owner Leo + Claude, phase 4 (Paid and partners).

## Why

Among Predis.ai's running Meta ads are ads that retarget lapsed trials at $19 and $32 a month (Meta Ad Library, q=Predis.ai). Supergrow runs one 20-second video behind 8 ads, started 24 Sep 2026 (Meta Ad Library, q=Supergrow). Taplio has bought Meta ads since 23 Oct 2026 (Meta Ad Library, q=Taplio). All in research/teardown.md, move 21.

A visitor who read a page and left has already seen what Postmosis does. Leo on camera, asking once more, costs less than a new visitor.

## What we have today

Checked 30 Oct 2026 against ~/postmosis-site origin/main (2b81272) and the live home page.

- No pixel or ad tag on postmosis.com, in the repo or the live HTML.
- The site has no consent banner, and its privacy page says "This website has no analytics." (src/content/legal/privacy.md).
- No ad account is named for Postmosis in either repo.
- Leo's real reels come from the hub card faces-leo-weekly. Standing rule: real faces before AI faces.

## What to do

1. Wait until pm-mk-booking-source has shown, for at least four weeks, which pages bring bookings.
2. Stop and ask Leo (dec-pm-paid): spend on retargeting, and how much a month? Money, a Meta pixel and a consent banner are each his call.
3. If yes, Claude adds the pixel to the site behind a consent banner, so nothing loads before consent, and updates the privacy page. Run next build and the site's tests, check 390 wide, push to main.
4. One audience: visitors of the last 30 days who did not book. Two of Leo's real reels as the ads. The walkthrough link with ref=retarget-<yyyy-mm>.
5. A monthly cap Leo names, judged on cost per booked walkthrough. After the first month Claude reports spend, bookings and cost per booking, and Leo decides whether it continues.

## Done when

- Leo's answer is in dec-pm-paid's decided field.
- If yes: the pixel loads only after consent, the ads ran within the cap, and the first month's cost per booked walkthrough is reported.

## Open questions

Spend on retargeting, and how much a month? This is dec-pm-paid.
