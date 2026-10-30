# Each audience page offers a printable checklist, with an optional email box

Status: todo
App Postmosis (postmosis.com), owner Claude, phase 3 (Reach that compounds).

## Why

Taplio's LinkedIn benchmark, built from 60,000+ posts a month, opens for "One email, no password, no credit card", and the email brings a new edition each month (taplio.com/linkedin-benchmark). Later gives away free guides, among them a day-by-day checklist to launch a social presence and "a camera-ready guide for confident video creation", beside a newsletter sign-up (later.com/resources/guide/). Both are in research/teardown.md, move 11.

A checklist a professional prints and keeps on the desk brings them back to the page that made it.

## What we have today

Checked 30 Oct 2026 against ~/postmosis-site origin/main (2b81272) and the memory notes.

- Every page and vault playbook is open with no sign-up (Leo's call for the vault, 29 Oct, memory postmosis-vault-keepy-1029). The site has no form and collects no emails.
- 4 of the 7 templates already download as CSV and print cleanly, with "No email" on the page: content-calendar, social-media-plan, social-media-audit and video-script (src/content/templates.ts, the /downloads route, the print rules in globals.css).
- No /for page has a checklist. The phone-video steps live in /guides/talking-head-video.

## What to do

1. Claude writes one checklist per /for page, 10 to 15 lines each, the phone-video checklist first (coaches and real estate agents), from the guide and the audience's example week. Gates: the brief first, aicheck under 15, brief-check. The /for pages are money pages, so Leo reads the checklist copy .md before it goes into code.
2. Build each as a section on its /for page with a Print button, reusing the templates' print area (data-print-area), so it prints on one A4 page. No gate. It ends with the walkthrough link carrying ref=checklist-<slug>.
3. Run next build and the site's tests, check 390 and 1440 wide and a print preview, push to main.
4. Stop and ask Leo (dec-pm-email) before any email box. If he says yes, the box is optional, explains what they get, stores the address with a way to delete it, and sends nothing until Leo approves the first send. Storing addresses needs a table or a third-party list, and the privacy page needs a line, so both wait for his yes.

## Done when

- Six checklists are live on the six /for pages, each printable on one page with no gate, and the site's tests pass.
- Leo's answer on emails is in dec-pm-email; if yes, the box stores an address and nothing goes out before his first approval.

## Open questions

Collect emails at all, given the vault stays open? This is dec-pm-email.
