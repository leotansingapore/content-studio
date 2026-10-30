# A weekly 30-minute group walkthrough catches people who will not book alone

Status: todo
App Postmosis (postmosis.com), owner Leo, phase 3 (Reach that compounds).

## Why

Taplio's FAQ says it runs live group demos and to register at taplio.com/contact, a page that returned 404 on 30 Oct (taplio.com, taplio.com/contact). Later's menu offers Expert Sessions, "Watch live and on-demand" (later.com). Both are in research/teardown.md, move 4.

Some visitors will not book 20 minutes alone with a founder. They may sit at the back of a group and ask for a setup after.

## What we have today

Checked 30 Oct 2026 against ~/postmosis-site origin/main (2b81272) and ~/calendarios origin/main (7e715fe).

- None. Every walkthrough is one to one, booked from the single Book a walkthrough link.
- Pick a Time hosts public events with sign-ups and registered and waitlist places, and adds registered people to the Google Calendar event (calendarios src/pages/PublicEventPage.tsx).
- Book a walkthrough is the main button on every page (leo.md, standing calls), so a group link has to stay quieter than it.

## What to do

1. Leo picks one fixed weekly slot and makes a Pick a Time event for it, on a free video call.
2. Claude adds a quieter second link below the main button on /plans and in the closing band, inviting people to the weekly group walkthrough, with ref=group. /plans is a money page: aicheck under 15, brief-check, and Leo reads the copy .md before it goes into code. Run next build and the site's tests.
3. The session: 20 minutes of the product on Leo's own brand, then 10 minutes of questions. At the end each attendee is offered a 1:1 setup through the main link.
4. Count attendees and 1:1 setups booked afterwards, for six weeks.
5. After six weeks Claude reports both counts and whether 1:1 bookings dropped while the group link was up. Leo decides whether it stays.

## Done when

- Six weekly sessions have run.
- The second link is live and the site's tests pass.
- A six-week report gives attendees, setups booked and Leo's call on keeping it.

## Open questions

None.
