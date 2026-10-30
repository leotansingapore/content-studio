# The booking page names Postmosis and says what the 20 minutes cover

Status: todo
App Postmosis (postmosis.com), owner Leo, phase 1 (Every booking is held).

## Why

All eight rivals let a visitor start alone with a free plan or a trial, and only Predis.ai says it takes a card (research/teardown.md, summary table, each row sourced to the rival's pricing page). Their first step says what you get: Supergrow's hero offers "Start free" and "See how it works" (supergrow.ai), and Taplio's trial opens the Pro plan for 7 days (taplio.com/pricing).

Postmosis asks for a booking instead. The booking page is where each visitor commits or leaves, so it has to name Postmosis and say what the call gives them.

Shares work with the hub card leaks-funnel-teardown, which sets each app's funnel beside its rivals' and fixes the weakest stage. For Postmosis that run starts from research/teardown.md, and this page is the stage it points at.

## What we have today

Checked 30 Oct 2026 against ~/postmosis-site origin/main (2b81272), the live booking page and ~/calendarios origin/main (7e715fe).

- Every Book a walkthrough button opens https://www.pick-a-time.app/book/demo-session (BOOK_WALKTHROUGH in src/site/config.ts of the site).
- That page, rendered on 30 Oct, is titled "Activity Tracker Demo", hosted by "Activity Tracker Demo", with 30-minute slots in Asia/Singapore and a general note about pencilling a time in. It never says Postmosis.
- Leo's call of 28 Oct, kept on 29 Oct: the link stays until he gives a Postmosis one (memory postmosis-marketing-site-1028).
- A Pick a Time page can ask booking questions (intake questions with custom answers on each booking, calendarios src/features/coaching/hooks/useBookingFlow.ts), and 20 minutes is one of its preset session lengths (DurationSelect.tsx). Its own reminder hours need the Pro plan (RemindersCard.tsx).
- Six of the site's test files (money, audiences, compare, features, templates and tools) find walkthrough links by an exact match on BOOK_WALKTHROUGH.href, so changing the constant keeps them working.
- The brief's conversion line still names demo-session (~/Documents/Postmosis/product-marketing.md).

## What to do

1. Claude drafts the page's words in ~/Documents/Postmosis/copy/booking-page/booking-page-copy-v1.md: the name "Postmosis walkthrough", three lines on what the call covers (your account set up, your first carousel and video made, your week planned) and two questions (what do you do, which networks do you post on). Gates: the brief first, aicheck under 15, brief-check. Leo reads the .md before anything is pasted.
2. Leo makes the page in Pick a Time under his own login: slug postmosis-walkthrough, 20-minute slots, his own name as host, the approved lines and questions.
3. Claude opens the new page at 1440 and 390 wide and checks the title, the lines, the questions and that slots show.
4. Claude points BOOK_WALKTHROUGH.href in ~/postmosis-site/src/site/config.ts at the new page, runs next build and the site's tests, pushes to main and checks that the live home, /plans, /about and one /for page open it.
5. Claude updates the conversion line in product-marketing.md.
6. Leo books one slot on himself and cancels it, so the confirmation and the cancel both carry the new name.

## Done when

- A Pick a Time page named Postmosis walkthrough is live with 20-minute slots, the three lines and the two questions.
- BOOK_WALKTHROUGH points to it, the site's tests pass, and the buttons on the live home, /plans and /about open it.
- The brief's conversion line names the new link.

## Open questions

None.
