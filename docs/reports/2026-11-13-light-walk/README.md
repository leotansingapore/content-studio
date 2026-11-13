# First week in light, 13 Nov 2026

Item 2 of docs/handovers/2026-11-13-jilian-next.md. Every page a new customer reaches in the first week, opened in light at 1440 and 390 wide. One screenshot per page is in this folder.

Result: one defect, fixed in bde9fef1. No text failed the contrast check, and no other colour is fixed to a dark value.

## How it was checked

- Local dev server, a fake signed-in account, light theme. Nothing touched the live database.
- `cs_subscriptions` stubbed three ways: a trial with 5 days left, a payment 2 days past due, and an ended subscription.
- `social` stubbed as switched on with no accounts connected, as on day one.
- The brand kit had a white logo, then a dark one. Both are made-up "TIDY HOME" wordmarks.
- On every page, three automatic checks:
  - Contrast of every piece of text on a solid background, against WCAG AA (4.5, or 3 for large text).
  - Large near-black surfaces, which in light means a colour fixed to a dark value.
  - Pictures whose pixels match what is behind them, so they vanish.
- Each screenshot was then read by eye, including the text on set-up's gradient, which the contrast check skips.

## Pages

| Page | 1440 | 390 | Finding |
| --- | --- | --- | --- |
| /welcome, website | welcome-1-website-1440.jpg | welcome-1-website-390.jpg | Fine |
| /welcome, what you do | welcome-2-work-1440.jpg | welcome-2-work-390.jpg | Fine |
| /welcome, where you post | welcome-3-networks-1440.jpg | welcome-3-networks-390.jpg | Fine |
| /welcome, reading | welcome-4-reading-1440.jpg | welcome-4-reading-390.jpg | Fine |
| /welcome, review | welcome-5-review-1440.jpg | welcome-5-review-390.jpg | Fine. A white logo sits on a dark tile (d146c854). |
| /welcome, connect | welcome-6-connect-1440.jpg | welcome-6-connect-390.jpg | Fine |
| /welcome, finish | welcome-7-finish-1440.jpg | welcome-7-finish-390.jpg | Fine |
| Home, with the trial line | home-1440.jpg | home-390.jpg | Fine |
| The writer (/generate) | generate-1440.jpg | generate-390.jpg | Fine |
| Brand kit (/brand) | brand-1440.jpg | brand-390.jpg | Fixed: the logo tile, below |
| Brand > Profile (/playbook) | playbook-1440.jpg | playbook-390.jpg | Fixed: the logo tile, below |
| Social accounts (/accounts) | accounts-1440.jpg | accounts-390.jpg | Fine |
| Settings | settings-1440.jpg | settings-390.jpg | Fine |
| Settings > Billing | settings-billing-1440.jpg | settings-billing-390.jpg | Fine |
| Payment past due line | past-due-line-1440.jpg | past-due-line-390.jpg | Fine |
| Paywall (subscription ended) | paywall-1440.jpg | paywall-390.jpg | Fine |

## The defect

Brand kit's logo preview, and the logo row and logo editor on Profile, drew every logo on a fixed near-black tile (`bg-neutral-800`). Most logos are dark on a see-through background, so they vanished there, in light and in dark.

The tile now follows the logo, the same way set-up's does: a dark tile for a white or light logo, a light tile for any other. The light tile stays light in dark mode too, so a dark logo shows there as well. See brand-logo-white-logo.jpg and brand-logo-dark-logo.jpg.

The MoneyBees kit card on /brand (yours only) still uses the dark tile. I left it, since it is not a customer page.

## Not covered

- Stripe's own pages (checkout and the portal) and any email.
- Pages past the first week, and every page in dark.
- No new words: nothing in this fix adds or changes a label.
