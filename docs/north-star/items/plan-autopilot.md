# A weekly batch with a review window

`plan-autopilot` | plan | phase 5 | status: missing | /north-star#plan-autopilot

## Leo asked

No direct ask; from the competitor research.

## How the best do it

Fastlane does not show an autopilot run in the recording, but every screen around it assumes one.

- After a campaign is added, the result card says "Nothing is running yet: start the run when you are ready, or leave it for Senna to propose a start." (notes-1, F5.6).

![Fastlane 0:28](../../../public/north-star/fastlane/t028.webp)

- The Strategy row repeats the rule, "Press Start to review the schedule and cost. Nothing posts or is charged until you approve it.", and prices the run under it: "28 posts, 945 credits. Your 142 credits cover 24 of them. The other 4 wait for credits." with a "Buy credits" button (t291).

![Fastlane 4:51](../../../public/north-star/fastlane/t291.webp)

- Home is the review inbox. The tour calls it "Home is your inbox from me. Posts waiting for your yes, anything that failed, and our chats." The card header reads "NEXT UP | 1 OF 2 THAT NEED YOU", and inside it "YOUR NEXT STEP", "0 of 28 made | 28 drafts waiting for you", "Keep making your campaign" with "Open ->" (t288).

![Fastlane 4:48](../../../public/north-star/fastlane/t288.webp)

- Settings has a SENNA group whose first row is "What runs without you" / "What Senna does alone and what waits for you." (t346; the page itself was not opened, so its options are unverified). The Activity log filters by "Autopilot" and "Scheduled runs" (t342).

![Fastlane 5:46](../../../public/north-star/fastlane/t346.webp)

Others:

- Blaze Autopilot plans, writes, designs and schedules every week: "a weekly batch of visual, text, and video content" and a calendar to review, with automatic generation switched on or off. Starter plans one campaign one week ahead; Growth plans several campaigns months ahead ([difference](https://help.blaze.ai/en/articles/12313537-what-is-the-difference-between-blaze-autopilot-and-blaze-copilot), [getting started](https://help.blaze.ai/en/articles/9535151-getting-started-with-blaze), [pricing](https://www.blaze.ai/pricing)).
- Revid.ai Auto-Mode drafts a 7-day calendar from a product link. Each day card has "Objective", "Angle", format, "big idea" and "Goes to". Once activated, a worker makes one video overnight and adds a new day after each run, and "Nothing posts without you": each video arrives with "Review" and "Post" ([auto mode](https://www.revid.ai/auto-mode)). Workers: 3 on Growth, 5 on Elite, 10 on Ultra, and Revid's automation docs say a worker can also auto-publish to a connected TikTok, YouTube or Instagram ([automation](https://www.revid.ai/llm/revid-ai-publishing-and-automation.md), [plans](https://www.revid.ai/llm/revid-ai-pricing-plans.md)).
- ContentIn plans your week every Sunday: 2 planned posts a week on Growth, 3 on Pro ([source](https://contentin.io/)).
- SuperX keeps a "Ready To Post" queue of drafts in your style, on 750, 1,500 or 4,000 AI credits a month ([source](https://superx.so/), [pricing](https://superx.so/pricing)).
- BrightFire, for insurance agents: 32 written posts a month that the agent reviews and approves, from USD 100 a month (per [Pinney](https://pinneyinsurance.com/best-social-media-tools-life-insurance-agents-2026/), unverified on BrightFire's own site).
- Marky writes a month of posts at once, first 30 posts free ([source](https://www.mymarky.ai/pricing)). ViralBrain plans a 30-day calendar on Premium and auto-posts it to LinkedIn there, with a 7-day preview on Pro and auto-posting off during the trial ([source](https://www.viralbrain.ai/pricing)). Apaya sells "Post Autopilot" from USD 69 a month ([source](https://apaya.com/pricing)).

## What we have today

- There is no autopilot. `/plan` (`src/pages/PlanPage.tsx`) lays out funnel slots with `generatePlan` (`src/lib/contentPlan.ts`). Each slot has an angle and a starter hook from the inspiration seeds, but no post; "Draft in Studio" opens Write one slot at a time, and "Add N posts to calendar" puts empty `plan_<slot>` placeholders on the calendar (`planCalendarEntries`, status `scheduled`, `draft: ""`).
- `/generate/batch` ("Weekly batch", `src/pages/BatchPage.tsx`) writes one topic for several platforms, only when pressed.
- Leo's team posts are the one batch with a review window that works today. Jobs on his Mac (`~/.local/bin/team-posts`, contract `~/.local/share/team-posts/CONTRACT.md`) write 16 posts every two months into `content-studio-teamposts-<uid>`. He approves, comments or skips them in `/calendar` (`src/components/TeamPostReview.tsx`, `src/lib/teamPosts.ts`), or replies `ok tp<N>` on Telegram, and only approved posts go to his Telegram group on their day. Its statuses (posted, skipped, approved, revising, waiting) come from `statusOf`, and it covers that one account only.
- Nothing yet writes posts from plan slots in one call. `supabase/functions/idea-dump` has two modes today: the default (notes into briefs, cap `idea-dump` 30) and "long", which writes 5 posts in one call but only from one pasted piece (cap `repurpose-long` 20). Mode "campaign" (1 to 7 posts a call, gpt-4.1, cap `campaign-draft` 20) is specified in `plan-campaign.md`, not built. idea-dump also has no server-side Leo gate and never calls `refundUsage` today; `_shared/leoOnly.ts` is specified in `plan-goal.md`.
- `planOptions` inside `PlanPage.tsx` (near line 279) builds the slot options (posting days from `loadBrand(id)?.slots`, times from `postingTimeOn` over `getTrackedPosts`, `recentThemes`, `nextFormulaStart`) but reads page state: the chosen competitors, the Analytics `performance` memo and the current plan. `plan-campaign.md` extracts it as `planOptionsFor(userId, platform, { competitors, performance, plan })` and adds a `formats` option to `generatePlan`.
- The Pipeline badge counts overdue posts and team posts waiting: `countNeedsYou(drafts, teamPosts, reviews, today)` in `src/lib/needsYou.ts`, called from `src/pages/StudioLayout.tsx` on every page change, on tab return, every 30 seconds and on `onDraftsChanged`.
- My posts holds 50 entries (`MAX_DRAFTS` in `src/lib/draftHistory.ts`). `upsertDraft` puts the new entry first and cuts the list at 50 whatever the status, so every new draft can push out the oldest entry, posted ones with their numbers included.
- idea-dump answers a cap refusal with `usageRefusal` from `_shared/usageCaps.ts`: 429 `daily_limit` ("You've used all <n> for today. It resets at 8am Singapore time.") or 503 `usage_unavailable` when the counter cannot be read. A missing OpenAI key is 503 `not_configured`.
- `notify` (pg_cron hourly, `supabase/hub/016_notify.sql`) sends a phone alert when a `scheduled` post is due (`dueAt` in `notify/logic.ts`). So a post must not be `scheduled` before a person has read it.
- The server can already drop drafts into a brand: `content-studio-mcp` writes `content-studio-mcpdraft-claude-s<NN>-<scope>` rows into `cs_user_data`, and `loadDrafts` absorbs them (`absorbClaudeDrafts` in `src/lib/draftHistory.ts`). No job writes posts on a schedule.

## Build

Gate everything with `leoOnly(email)`. Build after idea-dump mode "campaign" exists. If plan-campaign has not shipped it, build that mode first exactly as `plan-campaign.md` specifies (with `_shared/leoOnly.ts` from plan-goal and the refund), in its own commit. plan-goal and plan-content-plan make the batch follow the goal and the pillars when they have shipped; autopilot works without them.

Autopilot writes words only. It never posts, never schedules to a connected account, and never makes an AI video. A written post stays a draft until the person presses Approve.

### How a batch is laid out (`src/lib/autopilot.ts`, pure)

- `targetWeek(settings, today)`: weekly mode takes the Monday after the latest write day on or before today. With write day Friday, opening on Fri 24 Oct, Sat 25 or Mon 27 all give the week of Mon 27 Oct. Opening late still lands on the right week.
- `layoutWeek(positioning, options, week)`: calls `generatePlan(positioning, { weeks: 1, formats: settings.formats, ...planOptionsFor(uid, positioning.platform, { competitors: [], performance: planPerformance(uid), plan: loadPlan(uid) }) })` and dates each slot with `planItemDate(item, monday)`. The week keeps the funnel arc `/plan` uses (attraction first, conversion last). Move the `performance` memo out of `PlanPage.tsx` into `planPerformance(userId)` in `contentPlan.ts` in the same commit as `planOptionsFor`, so `/plan`, campaigns and autopilot read one copy.
- `reviewBy(day, windowDays) = addDays(day, -windowDays)`. A post is approvable through the end of that day, Singapore time.
- `postsToWrite(layout, batch, drafts, today)`: keeps slots whose `reviewBy` is today or later, that the batch has not written yet (no batch post in `review`, `approved`, `skipped` or `missed`), and whose day has no scheduled post with words in it in My posts (a campaign post, anything the person wrote). An empty `plan_` placeholder does not take the day, by the same rule `recentThemes` uses (`id` starts with `plan_` and `draft` is blank). Team posts live in their own key and go to Leo's Telegram group, so they never take a day. Opening on Mon 27 with a 2-day window drops Mon and Tue and writes Wed onwards.
- Daily mode ("Every morning") uses the same week layout, stored once per week in that week's batch so the arc holds. Each morning it writes the unwritten slots dated up to `today + windowDays + 1` whose `reviewBy` is today or later. A missed morning is caught up the next day while there is still time to approve, and a morning with nothing in that range writes nothing. When `today + windowDays + 1` falls in the next week, that week's layout is made and stored first.
- Slot to writer: `angle: { title: slot.pillarDetail, line: slot.angle }`, with the spaced em dash (U+2014) that `generatePlan` puts inside `angle` replaced by `: ` before sending.

### The job (`src/lib/autopilotJob.ts`, outside React)

- `runAutopilot(userId, now)` runs from `StudioLayout` on load when `leoOnly(email)` and the setting is on, and again when `/plan` mounts. It works on the brand that is open (`scoped(userId)`); another brand's batch is written the next time that brand is opened.
- Steps: read settings, work out the target week and `postsToWrite`, stop when nothing is left. Set `startedAt` on the batch. If another device set it under 10 minutes ago, stop (two devices opening at once). Call `callFn("idea-dump", { mode: "campaign", posts, context })` once with up to 7 posts. For each post returned, `upsertDraft` a My posts entry, then mark the batch post `review`.
- Draft ids are `ap_<week>_<n>` (week = the Monday, `n` from 1). Two devices that both write upsert the same ids, so a race never doubles posts.
- Each draft: `id`, `createdAt`, `hook`, `draft` (the body, or the script for a short video), `format`, `platform`, `audience`, `pillar`, `pillarDetail`, `ctaType`, `hookFormula`, `labels` (plan-content-plan's slot label, when there is one) and `status: "draft"`, with no `scheduledFor`. The day and time live on the batch post.
- Approve: `setDraftStatus(uid, draftId, "scheduled", scheduleAt(day, time))`, and `deleteDraft` on that day's empty `plan_` placeholder if there is one, so the calendar shows one post for the day. Undo: `setDraftStatus(uid, draftId, "draft")`, and `upsertDraft` puts the removed placeholder back (kept in memory for the toast).
- OpenAI failure (502 from the mode): posts become `failed`, and the card offers `Try again`. The mode refunds the use itself.
- 429 from the cap: posts stay `waiting` and the batch gets `waitUntil` (next 08:00 Singapore time); the job does nothing before then.
- 503 (`usage_unavailable` or `not_configured`), 404 or no answer at all: posts stay `waiting`, nothing is counted, and the card shows the error line below with `Try again`. The next app open tries once more.
- Deadline sweep, on every run: a post still in `review` after its `reviewBy` becomes `missed`. Its draft is left as it is, an unscheduled draft in My posts, so no calendar entry and no phone alert ever carries words nobody approved.
- The sweep also reads each draft with `draftStatus`. A draft the person scheduled or posted from somewhere else (Write's suggested time, the calendar, Post it for me) makes its batch post `approved`. A draft that is gone from My posts (deleted there, or pushed out past 50) makes it `skipped`, so it is never written again, but only once the batch's `startedAt` is over 10 minutes old, so a second device whose drafts have not synced yet never marks it.
- Listeners (`onAutopilot`) let `/plan` and Home re-render while it runs.

### Screens and states

An `Autopilot` card at the top of `/plan`'s plan view, id `autopilot`, above the week cards. With no plan built, it sits above the setup form.

```
AUTOPILOT                                      On   [Settings]
Writes next week's 3 posts every Fri. You OK each one 2 days before it goes out.

NEXT WEEK | 27 OCT TO 2 NOV | 3 FOR YOUR OK                 [Approve all]
Mon 27 Oct 9:00 am  Text post  A Attraction  CPF
  Most people check their CPF once a year...
  OK by Sat 25 Oct                              [Approve] [Edit] [Skip]
Wed 29 Oct 9:00 am  Carousel   B Building Trust
  ...
```

- Off (the default): `Autopilot` with an `Off` chip and the line `Writes next week's posts for you to OK. It never posts on its own.` One button, `Turn on`, opens the settings dialog.
- No usable positioning (`isPositioningUsable` false): `Say who you serve first, so the posts are about them.` with `Set up positioning` linking to `/plan?view=setup`. `Turn on` is disabled.
- On, before the write day: `On | Writes next week's <n> posts every <Fri>.` Daily mode: `On | Writes one day's posts each morning, <window> days ahead.`
- Writing: `Writing next week's posts... <k> of <n>`, with a thin progress bar, within 400 ms of the job starting. The rest of the page stays usable, and leaving it does not stop the job.
- Ready for review: header `NEXT WEEK | <27 OCT TO 2 NOV> | <n> FOR YOUR OK` and the primary button `Approve all`. One row per post:
  - chips for day and time, format, funnel stage, and the label when there is one;
  - the hook in bold, then the first two lines of the body;
  - the existing compliance chips (`scanCompliance` from `src/lib/compliance.ts`) and the near-duplicate warning (`nearDuplicate` from `src/lib/nearDuplicate.ts`), both warnings only;
  - `OK by <Sat 25 Oct>`, which reads `OK by today` in the warning colour on the last day;
  - buttons `Approve`, `Edit` (to `/generate?draft=<id>`; editing does not approve) and `Skip`.
- Approved row: an `Approved` chip and a text button `Undo`. The post is now on the calendar.
- Skip deletes the draft (`deleteDraft`) with the toast `Post skipped. Undo` (5 s). The batch marks it `skipped`, so it is not written again.
- Missed row: `Not approved in time. It is in My posts as a draft.` with `Open` (to `/generate?draft=<id>`).
- Failed row: `This post could not be written.` One `Try again` on the header retries every failed post in one call, with the chip `About US$0.03` beside it.
- Over the daily cap: `Writing paused until 8am. Today's limit for writing posts is used.`
- Any other error (503, 404, offline): `Couldn't write next week's posts. Try again.` with `Try again`.
- Nothing to write because every day already holds a written post: `Next week already has <n> posts planned. Nothing to write.`
- Nothing to write because every review date has passed (turned on mid-week): the card keeps the `On | Writes next week's <n> posts every <Fri>.` line, so it never claims posts exist.
- Done (every post approved, skipped or missed): `Next week is set. <a> approved, <s> skipped.` with `See the week` linking to `/calendar?view=week&week=<monday>`.
- My posts near its limit: when `loadDrafts(uid).length + n > MAX_DRAFTS` (50), the line `My posts keeps your newest 50, so this week's posts push out your <d> oldest.` shows above the rows before anything is written.

The settings dialog, `Autopilot` (opens from `Turn on` or `Settings`):

- `WHEN IT WRITES`: radios `Once a week, on` with a weekday select (default Friday), and `Every morning`.
- `HOW MANY`: `<3> posts a week, your weekly goal.` with `Change` linking to `/plan?view=setup`. No separate number, so the goal stays the one source.
- `FORMATS`: chips `Text post`, `Carousel`, `Short video script`, all on by default. At least one stays on: `Pick at least one format.`
- `REVIEW WINDOW`: radios `1 day before`, `2 days before` (default), `3 days before`, then the line `A post you have not approved by then stays in your drafts and never reaches the calendar.`
- The note above the buttons: `Autopilot only writes. Nothing goes on the calendar until you approve it.`
- Buttons `Cancel` and `Turn on` (or `Save` when already on), with the price chip beside `Turn on`: `About US$0.03 a week` (`PriceChip` for `campaign-draft` from business-cost-preview once it exists; this string until then). `Turn off` sits in the card's header when on, with no confirm and the toast `Autopilot is off. Undo`.

Home (`src/pages/HomePage.tsx`), Leo only: when the open brand has posts in `review`, a card above "Coming up" reads `<n> posts for next week need your OK` / `OK by <Sat 25 Oct>.` with `Review` linking to `/plan#autopilot`. agent-home folds it into its Next up card later.

Pipeline badge: `countNeedsYou` takes an optional fifth argument, `autopilotWaiting = 0`, the count of autopilot posts in `review` whose `reviewBy` is today or later, which StudioLayout reads with `loadAutopilot` on the same 30-second recount.

### Copy

Every string above is exact. Format names read `Text post`, `Carousel` and `Short video script`. Dates use the app's `Sat 25 Oct` style and times `timeLabel()`.

### Data

- `src/lib/autopilot.ts`, synced key `content-studio-autopilot-<scoped(uid)>`, one per brand:
  ```ts
  type AutoFormat = "text-post" | "carousel" | "short-video";
  type BatchState = "waiting" | "writing" | "review" | "approved" | "skipped" | "missed" | "failed";
  interface AutopilotSettings { on: boolean; when: "weekly" | "daily"; writeDay: number /* 0 = Monday, as WEEKDAYS */; formats: AutoFormat[]; windowDays: 1 | 2 | 3 }
  interface BatchPost { n: number; day: string; time?: string; slot: PlanItem; draftId: string; state: BatchState; reviewBy: string }
  interface Batch { week: string; posts: BatchPost[]; startedAt?: string; waitUntil?: string }
  interface AutopilotState { settings: AutopilotSettings; batches: Batch[] } // newest first, last 8 kept
  ```
- The posts themselves are ordinary My posts entries (`content-studio-drafts-<scope>`), so Write, the calendar (once approved) and Post it for me treat them like any other post.
- Approve, Skip and Undo rewrite the one batch record (last write wins, cloudSync), and a skipped post stays recorded as `skipped` in the batch, so a deletion is never the only record of anything. None of this needs a table or a migration.

### AI and cost

- Writer: idea-dump mode "campaign" (gpt-4.1, structured output, `COMPLIANCE_LINES`), one call per batch, request shape as `plan-campaign.md` sets it. Each slot maps to `{ n, angle: { title: slot.pillarDetail, line: slot.angle (em dash replaced, as above) }, format, stage, formula: hookFormula(slot.formulaId) as { name, template }, ctaType, platforms: [slot.platform] }`; `context` is `buildIdeaDumpContext(uid)` plus the goal (plan-goal), the audience and `rules: brandRulesLine(loadBrand(uid), platform)`. Each post that lands goes through `applyBrandRules` before it is stored.
- Cost: plan-campaign estimates about US$0.033 a call for 7 posts at list prices, so a weekly batch of 3 to 7 posts is about US$0.02 to US$0.04 per brand per week. Daily mode makes one smaller call per morning with a slot, about US$0.01. Measure the first four weeks and correct the chip and the comment.
- Cap: the `campaign-draft` cap (20 a day) that plan-campaign adds covers this; no new cap. One use per call, refunded by the mode with `refundUsage(admin, uid, "campaign-draft", utcDay)` when OpenAI fails.
- No new Jev question. The layout is arithmetic, the writer's prompt carries the compliance lines, and the review list shows the warnings the app already computes.
- Server gate: mode "campaign" answers 404 `{code: "not_enabled"}` unless `leoOnly(user.email)` (plan-campaign's rule, `_shared/leoOnly.ts`).

### Deep links

- `/plan#autopilot` scrolls to the card (`useScrollToHash` from `src/lib/urlState.ts`).
- `/plan?autopilot=settings` opens the settings dialog (push, so Back closes it).
- `/plan?week=<YYYY-MM-DD>` shows that week's batch in the card (replace; the newest when the param is missing or names a week with no batch).
- Rows link to `/generate?draft=<id>`, and approved rows to `/calendar?post=<id>`.
- Extend `links.plan()` in `src/lib/links.ts` with `autopilot?: "settings"`, `week?: string` and `section?: "autopilot"` (the `#section` pattern `links.coach` and `links.brand` use), and add the rows to `docs/deep-links.md`.

## Done when

- [ ] Leo's sign-in sees the Autopilot card on `/plan`; a demo sign-in sees no card and gets 404 from mode "campaign".
- [ ] Turned on with write day Friday and goal 3 a week, opening the app on a Friday writes 3 drafts for the next Monday to Sunday within about 30 seconds, on the brand's posting days and times, in attraction, trust, conversion order. None of them is on the calendar yet.
- [ ] The same week opened on Monday writes only the days whose review date has not passed.
- [ ] A day that already holds a written scheduled post is left alone; a day with only an empty plan placeholder is written, and approving that post removes the placeholder.
- [ ] Opening on two devices at once still gives 3 posts, not 6.
- [ ] Approve puts the post on the calendar at its slot time; Undo takes it off. Approve all, Skip with Undo, and Edit all work, and the Pipeline badge counts posts waiting for an OK.
- [ ] A post left unapproved past its date shows as missed, stays an unscheduled draft in My posts, and never triggers a phone alert.
- [ ] A batch post scheduled from Write instead of the card shows as approved; one deleted in My posts shows as skipped and is not written again.
- [ ] Turned on on a Thursday with write day Friday, the card shows the `On` line and writes nothing until Friday.
- [ ] A 429 pauses with the 8am line, and a failed call can be tried again.
- [ ] Every post in the first two batches read by eye: no promised returns, no insurer names, no invented numbers.
- [ ] 390 px and 1440 px checked by eye on the card, the dialog and the Home card.
- [ ] Build and full vitest pass; the item flips in `src/data/northStar.ts`.

## Tests

- `src/lib/autopilot.test.ts`, with fixed dates passed in (never the real clock):
  - `targetWeek`: write day Friday, today Fri, Sat and next Mon all give the same Monday; today Thursday gives the week before.
  - `postsToWrite`: drops days with a written scheduled post, days whose `reviewBy` passed and slots the batch already wrote; does not drop a day holding only an empty `plan_` placeholder; keeps the funnel order.
  - Daily mode writes slots dated up to `today + windowDays + 1` with `reviewBy` today or later, so a slot missed yesterday is still written today, and builds next week's layout when the range crosses Sunday.
  - The writer request maps `pillarDetail` to the angle title and carries no em dash.
  - `reviewBy` with windows 1, 2 and 3.
  - The settings round trip per brand, and at least one format always stays on.
- `src/lib/autopilotJob.test.ts` (fake `callFn` and store):
  - one call for up to 7 posts, drafts upserted with `ap_<week>_<n>` ids and `status: "draft"`, no `scheduledFor`;
  - a second run in the same week is a no-op;
  - a fresh `startedAt` from another device stops the run;
  - OpenAI failure marks posts failed;
  - a 429 sets `waitUntil` and leaves posts waiting;
  - a 503 or a thrown call leaves posts `waiting` with no `waitUntil`;
  - approve schedules the draft at `scheduleAt(day, time)` and deletes that day's empty placeholder; undo returns it to a draft and restores the placeholder;
  - the deadline sweep marks an unapproved post `missed` and leaves its draft unscheduled;
  - the sweep marks a post `approved` when its draft is scheduled elsewhere and `skipped` when its draft is gone.
- `src/lib/needsYou.test.ts`: the fifth argument adds to the count, and leaving it out keeps today's numbers.
- `src/lib/contentPlan.test.ts`: `planOptionsFor` and `planPerformance` moved out of the page give the same plan as before (snapshot).

## Open questions

- Leo decides whether autopilot should also write on the server, so posts wait before the app is opened and a push says so. That takes a pg_cron job (a migration, so a stop for Leo) plus an edge function writing rows into `cs_user_data` the way `content-studio-mcp` does, and it would reach brands nobody opens that week.
- Should approved posts be scheduled to connected accounts without pressing Post it for me? That is agent-autonomy's "What runs without you", and it is Leo's call.
- Paid formats (AI video) stay out of autopilot until business-credits settles who pays.

## Related

plan-campaign, plan-content-plan, plan-goal, plan-review-queue, plan-ideas-inbox, agent-autonomy, agent-home, agent-activity, business-cost-preview, publish-calendar, publish-queue, trust-approval
