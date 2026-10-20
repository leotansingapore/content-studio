# Reports to share and export

`learn-reports-export` | learn | phase 8 | status: partial | /north-star#learn-reports-export

## Leo asked

No direct ask; from the competitor research.

## How the best do it

Fastlane shows no report export in Leo's recording; its Analytics page carries a "Growth" plan tag and was not opened (unverified).

- Metricool sends automated PDF or PPT reports, can auto-send them monthly, and shares a live URL; custom templates and a Looker Studio connector come with Advanced ([pricing](https://metricool.com/pricing/), [August 2026 updates](https://metricool.com/product-updates-august-2026/)).
- Vista Social has profile, post, team and competitor reports with cover pages, in PDF, CSV or Excel, and "Automate delivery" sends them to clients on a schedule. Scheduled reports start on Professional, custom ones on Advanced, white label on Scale ([analytics](https://vistasocial.com/social-media-analytics/), [pricing](https://vistasocial.com/pricing/)).
- Hootsuite exports .csv, .xlsx, .pdf and .ppt, drills down to post, network or page, and shares with outside emails; custom and scheduled reports are on Professional, and Instagram data can take up to 64 hours to show ([analytics](https://www.hootsuite.com/platform/analytics)).
- Buffer's All Channels report has top posts, a followers chart and an export menu, with PDF and CSV on paid plans and branded reports on Team only ([analyze](https://buffer.com/analyze), [pricing](https://buffer.com/pricing)).
- Cloud Campaign makes a branded report in one click, delivers it on a schedule and breaks results down by office, for insurance agencies ([insurance agencies](https://www.cloudcampaign.com/solutions/insurance-marketing-agencies)).
- Motion shares a report as a frozen or live "Snapshot" that opens without a login, with an option to hide sensitive data ([site](https://motionapp.com/)).
- Exolyt exports CSV and syncs to Google Sheets and Airtable, with Sheets sold as an extra ([pricing](https://exolyt.com/pricing)).
- Sprout Social splits reporting into Profile Performance, Post Performance, Competitor, Network and Tag reports, with more on a Premium Analytics add-on ([analytics](https://sproutsocial.com/features/social-media-analytics/)).

## What we have today

- Analytics "Top posts" has "Export CSV" (`exportCsv` in `src/pages/AnalyticsPage.tsx`, `postsCsv` in `src/lib/analytics.ts`): every tracked post with Posted, Platform, Format, Hook, Impressions, Reactions, Comments, Shares, Engagements, Engagement rate %. It ignores the page's period and has no post link.
- Tracked links have a public campaign report at `/t/report/:slug` (`src/pages/TrackedReportPublicPage.tsx`, edge function `tracked-link`), and Team review exports its audit trail as CSV (`auditCsv` in `src/lib/teamReview.ts`). Preview links (`cs_preview_links`, SQL 012) share one post for review, not results.
- The carousel maker already draws pages as SVG, turns them into JPEG (`svgToJpeg` in `src/lib/carouselRender.ts`, 1080 x 1350) and writes a PDF with no dependency (`buildPdf` in `src/lib/pdf.ts`).
- The Monday email (`notify`) reports the last 7 days to the adviser only. Nothing goes on a monthly schedule, to anyone else, or as a link. Its switches are two today: `email` and `push` in `content-studio-notify-<uid>`, read by `parsePrefs` in `notify/logic.ts` and by `loadNotifyPrefs` in `src/lib/notify.ts`.
- The page's figures count posts with numbers only: `getTrackedPosts` keeps posted drafts with impressions or engagements, with Zernio numbers in place of typed ones (`withReal`).

Status partial: a CSV of posts exists; no PDF, no schedule, no share link.

## Build

Steps 1 to 3 need nothing from Leo. Step 4 is a schema change and waits for him.

### Screens and states

1. The PDF. On Leo's sign-ins, a "Download PDF" button sits beside "Export CSV" in the Top posts header. AnalyticsPage keeps `data.user?.email` from its existing `getUser()` call for the `leoOnly` check (the same change `learn-weekly-report` makes). New `src/lib/resultsReport.ts` builds the report from `withinDays(tracked, period)` and `comparePeriods(tracked, period)` (all time when the period is "all"), and new `src/lib/resultsReportSvg.ts` lays out each page at 1080 x 1350 with the carousel helpers (`wrapText`, `ellipsize`, `SERIF_STACK`, `SANS_STACK`, `PAPER`, `INK` from `src/lib/carouselLayout.ts`, measured with `createCanvasMeasure()` from `src/lib/carouselRender.ts`) and the brand kit (`loadBrand` in `src/lib/carousel.ts`: colour, name, handle, logo or photo). Pages go through `svgToJpeg` and `buildPdf`, then `downloadBlob`. With no brand kit saved (`loadBrand` returns null), the PDF uses `PAPER` and `INK`, the active brand profile's name (`activeProfile(userId).name`) and no picture.

   - Cover: logo or photo, brand name and handle, "Results, {from} to {to}", and four figures with their change on the period before: posts, impressions, engagements, engagement rate.
   - By network: one row per network with posts, impressions, engagements and engagement rate.
   - By post: up to 12 rows a page and 3 pages (36 posts), most engagements first. Each row has the date, network, the hook on up to 2 lines, impressions, engagements and rate.
   - Footer on every page: "{brand name} | {from} to {to} | {n} of {N}".

   States: "Making your PDF..." on the button while it draws (pages draw in under a second for 36 posts on a laptop; the button stays disabled meanwhile). "PDF downloaded" toast when done. With no posts in the period the button is disabled with the title "No posts with numbers in this period." A drawing failure shows "Couldn't make the PDF. Try again." and keeps the page as it was.

2. The CSV. On Leo's sign-ins, "Export CSV" follows the period on the page (`postsCsv(withinDays(tracked, period))`), adds a "Post link" column (the first `url` in `zernio.links`, else empty) and names the file `content-studio-posts-<from>-to-<to>.csv` (Singapore days; with `?period=all` it is `content-studio-posts-all-<today>.csv`). Everyone else keeps today's file until Leo turns it on for everyone. `postsCsv` takes an optional `{ links: true }` so the old output stays byte for byte.

3. A monthly email to yourself. In My Playbook's notification switches (`NotifySettings`, shown with `leoOnly(email)`; the component already gets `email`), a third switch "Email me a monthly results report", saved as `monthly: true` in `content-studio-notify-<uid>` next to `email` and `push`. `NotifyPrefs`, `loadNotifyPrefs` and `saveNotifyPrefs` in `src/lib/notify.ts`, `Prefs` and `parsePrefs` in `notify/logic.ts`, and the `prefs` type of `runUser` in `run.ts` all gain `monthly`; anything but `true` is off. `runPage` today skips a row with `if (!prefs.email && !prefs.push) continue;`, which would drop someone with only the monthly switch on; it becomes `!prefs.email && !prefs.push && !prefs.monthly`. `notify` sends it on the first Monday of a month from 8am Singapore, with sent-log item `monthly:<YYYY-MM>` naming the month reported (sent on 2 Nov 2026, it is `monthly:2026-10`). While this is Leo-only it goes only to uids in the new `NORTH_STAR_USERS` secret (Leo's two uids; set it if `find-competitors` has not). A new `monthlyEmail(profiles, now)` in `notify/logic.ts` reports the last calendar month per brand: the four figures with change on the month before, one line per network, and the top 5 posts (reuse `postLine`), then "Open Analytics to download a PDF of your last 30 days: {APP_URL}/analytics?period=30d". It sends nothing when no brand posted that month.

4. A share link and a scheduled send to a manager or client (stop for Leo). Proposed, mirroring preview links: a table `cs_report_links` (owner, brand profile id, token hash, a frozen snapshot of the report's figures as JSON, created, expires within 30 days, `revoked_at`), an edge function `report-link` (create and revoke with JWT; read with `--no-verify-jwt` by token) and a public page `/r/:token` that draws the same pages as HTML. Sending to someone else's email adds a recipient who never signed up, so Leo decides on it apart from the link.

### Copy

- Buttons: "Download PDF", "Export CSV"
- Waiting: "Making your PDF..."; toast "PDF downloaded"; failure "Couldn't make the PDF. Try again."
- Disabled title: "No posts with numbers in this period."
- PDF cover line: "Results, {from} to {to}"; figure labels "Posts", "Impressions", "Engagements", "Engagement rate"; change "{+n}% on the {n} days before" (all time shows no change)
- PDF headings: "By network", "By post"
- Switch: "Email me a monthly results report"
- Email subject: "{Month}: {n} posts, {n} engagements"; a brand with no posts reads "{Brand}: nothing posted in {Month}."
- Email link line: "Open Analytics to download a PDF of your last 30 days: {APP_URL}/analytics?period=30d"

### Data

- Steps 1 and 2 keep nothing: the PDF and CSV are built in the browser from data already on the device.
- Step 3 adds `monthly` to the existing synced prefs row and a `monthly:<YYYY-MM>` row in `cs_notify_sent`, whose `item` is free text today (SQL 016), claimed through `cs_notify_claim` with the same 30-minute retake as the Monday email.
- Step 4 is a new table: a schema change, so it waits for Leo.

### AI and cost

- No AI and no new cap in steps 1 to 3. The PDF costs nothing; the monthly email is one Resend send a month per adviser who switches it on.
- Step 4 would add a cap such as `"report-link": 10` a day for creating links.

### Deep links

- `/analytics?period=30d` is the period the PDF and CSV use; no new param.
- Step 4 adds `/r/:token`, a public page fully named by its link, to the public row of `docs/deep-links.md` and to the `EXCEPTIONS` map in `src/lib/navRoutes.test.ts`.

## Done when

- [ ] On Leo's sign-in, "Download PDF" with `?period=30d` gives a PDF whose cover figures match the page's own totals for that period, in the brand's colour with its logo.
- [ ] A brand with 40 posts in the period gets 3 by-post pages with 36 posts and no clipped hooks.
- [ ] On Leo's sign-in, "Export CSV" with `?period=7d` holds only that week's posts and a Post link column; another sign-in gets today's file.
- [ ] A `notify` dry run on the first Monday of a month (`{ dryRun: true, only: <Leo uid>, now: "2026-11-02T01:00:00Z" }`) with the switch on returns the monthly email; with it off, nothing.
- [ ] Other sign-ins do not see "Download PDF" or the monthly switch, and a dry run for their uid with `monthly: true` sends no monthly email.
- [ ] Checked by eye at 390 px and 1440 px, and the PDF opened on a phone.
- [ ] `src/data/northStar.ts` item flipped (status and `ours`) in the same commit, and this spec's status line ticked.

## Tests

- `src/lib/resultsReport.test.ts`: the report for a period sums only that period's posts, the change uses the same length of period before, by-network rows add up to the totals, and by-post stops at 36.
- `src/lib/resultsReportSvg.test.ts` (with a fake `Measure`): every page is 1080 x 1350, a long hook wraps to at most 2 lines with an ellipsis, and text is XML-escaped.
- `src/lib/analyticsPeriods.test.ts` (where `postsCsv` is tested today; there is no `analytics.test.ts`): `postsCsv(posts, { links: true })` has the Post link column and escapes commas and quotes; `postsCsv(posts)` equals today's output.
- `supabase/functions/notify/logic.test.ts`: `monthlyEmail` returns null except on the first Monday from 8am, reports the previous calendar month, and skips a month with no posts; `parsePrefs` reads `monthly` and treats anything but `true` as off.
- `src/lib/notify.test.ts`: `loadNotifyPrefs` returns `monthly: false` by default (the existing `{ email: false, push: false }` expectations, four of them today, gain it).
- `supabase/functions/notify/run.test.ts`: `runPage` runs a user whose prefs are only `monthly: true`, and `runUser` sends the monthly email only when `isAllowed(o.northStarUsers, uid)`.

## Open questions

- Step 4 needs Leo: the table for share links, and whether reports may be emailed to people who are not users.
- White label: the PDF carries the adviser's brand only and no Content Studio mark. Leo decides whether a small "Made with Content Studio" line belongs on it.
- Google Sheets sync needs a Google sign-in for each adviser, a new integration; the CSV covers it for now.

## Related

learn-weekly-report, learn-team-analytics, learn-real-numbers, learn-post-grade, learn-attribution, trust-archive, publish-export-share
