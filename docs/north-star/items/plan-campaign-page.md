# Campaign page with cost and coverage

`plan-campaign-page` | plan | phase 5 | status: missing | /north-star#plan-campaign-page

## Leo asked

No direct ask; from the competitor research.

## How the best do it

Fastlane opens a campaign on its own page (t035, t038), whose header carries the breadcrumb "Strategy", the H1 "Sales-oriented self-employed professionals and coaches | October", status chips "TikTok" and "Draft", an outlined "Configure" button (what it opens was not shown, unverified), and the avatar's AI-written profile ending "| 4 weeks | TikTok".

Under it sits a card in three panels:

1. "YOUR CREDITS": a big "142" "credits", then "0 of 28 made | 28 posts still to make, 945 credits", then "You are short 803 credits" (803 in red). The primary button reads "Cover all posts | 803 credits ->", with the helper "Covering adds 803 credits, enough to make every draft. Nothing is made or charged until you press Make." and the warning "AI can make mistakes. Check each post before it goes out."
2. A green check with "Accounts ready" "TikTok".
3. "THE GOAL": "Save time on marketing: hand off the busywork.", the brand blurb, and the angle mix (plan-angles).

![Fastlane 0:38](../../../public/north-star/fastlane/t038.webp)

The same cost sentence follows the campaign around: on the result screen after adding ("28 posts, 945 credits. Your 142 credits cover 24 of them. The other 4 wait for credits." with "Buy credits", t028) and on the Strategy row, with the note "Press Start to review the schedule and cost. Nothing posts or is charged until you approve it." (t291).

![Fastlane 4:51](../../../public/north-star/fastlane/t291.webp)

Inside the queue, a post the balance cannot cover swaps its Make button for an orange "Not enough credits" / "Add 68", and the panel spells out what the post would be: "A Felt video about 15 seconds long, made fresh for you at Make."

![Fastlane 0:58](../../../public/north-star/fastlane/t058.webp)

The numbers fit Studio's price tags (notes-2: Slideshow and Wall of Text "5 credits a post", generated formats "About 195" or "About 210 credits a post"): 24 templated posts at 5 credits is 120, and 825 left over is three 210-credit videos and one at 195. The split is inferred (notes-1, F7 cost check); the page shows only the 945 total.

Others price before running too: Revid.ai's editor shows an estimated cost before every render ([pricing](https://revid.ai/pricing)) and refunds failed renders ([create flow](https://www.revid.ai/llm/how-to-create-a-video-with-revid-ai.md)); Ocoya charges 1 credit per campaign post ([source](https://www.ocoya.com/features/campaigns)). Several of the 126 competitors in the research sell top-up packs, but only Fastlane sizes one to a campaign's shortfall (from a keyword search of the research, so unverified).

## What we have today

- No campaign page. `/plan`'s header card shows `<posted>/<total> posted` with a progress bar, the funnel stage counts, and "Add N posts to calendar", "Reshuffle", "Edit positioning" and delete (`src/pages/PlanPage.tsx`, around line 860). It shows no cost because nothing in a plan is paid until a slot is written.
- No credits and no balance (`docs/north-star/research/current-app.md` section 7). Paid calls are limited per user per day in `supabase/functions/_shared/usageCaps.ts` (for example `ai-video` 2 and `ai-video-global` 20) and reset at 8am Singapore time.
- A person can read their own limits: `readUsage`, `usesLeft` and `useUsesLeft` in `src/lib/aiUsage.ts` read their `cs_ai_usage` rows. The across-everyone counters live on another account, out of the browser's reach.
- AI video prices come from code. `avatarCredits`, `creditsUsd` and `CREDIT_USD` (US$0.0625) sit in `supabase/functions/ai-video/logic.ts`, `src/lib/aiVideo.ts` re-exports them, and `AiVideo.tsx` prints "N Higgsfield credits (about US$X)"; a 15-second avatar video is two 10-second Speak slices, 44 credits or about US$2.75.
- Account health per brand: `socialStatus(profileId)` and `healthLabel` in `src/lib/socialConnect.ts` ("Reconnect needed", "Working", "Checking", "Needs a look").
- My posts keeps 50 entries (`MAX_DRAFTS` in `src/lib/draftHistory.ts`). `upsertDraft` puts the new entry first and cuts the list at 50, so the oldest entries fall off, and `deleteDraft` removes one entry without bringing back what fell off.
- `/carousel?draft=<id>` builds slides from the post's text and hook with `splitDraftIntoSlides`, the same call the queue uses for its preview, so a made carousel opens with the slides that were reviewed without saving a carousel.

## Build

Gate with `leoOnly(email)`. Build after plan-campaign. Money follows the standing recommendation: keep the daily caps while this is Leo-only, show a price on paid buttons, and leave credits, plans and Stripe to Leo. So "what the balance covers" becomes what today's limits cover, and the one tap makes everything that costs nothing.

### Screens and states

`src/pages/CampaignPage.tsx` at `/campaigns/:id`, `NotFoundPage` unless `leoOnly(email)`.

```
Campaigns
Young families | November                     LinkedIn  Instagram  Draft  [...]
Parents in their 30s with young kids and a first home | 4 weeks | LinkedIn, Instagram

+--------------------------------+----------------------+-----------------------------+
| WHAT IT COSTS                  | WHERE IT POSTS       | THE GOAL                    |
| US$11.00                       | [v] Accounts ready   | Get more enquiries from     |
| in Higgsfield credits          |     LinkedIn,        | people I can help           |
| 0 of 12 made | 12 to make      |     Instagram        | 5 ANGLES | 12 POSTS         |
| 8 free posts. 4 AI videos at   |                      | [====][===][==][==][==]     |
| about US$2.75 each.            |                      | chips with counts           |
| Today's limit covers 2 of the  |                      |                             |
| 4 AI videos. The other 2 can   |                      |                             |
| be made from 8am tomorrow.     |                      |                             |
| [Make the 8 free posts]        |                      |                             |
| They go on your calendar...    |                      |                             |
+--------------------------------+----------------------+-----------------------------+

#queue  (plan-review-queue)
```

At 390 px the panels stack in the order cost, goal, where.

Header:

- Breadcrumb `Campaigns` (link to `/campaigns`), H1 the campaign name, the audience line with `| <w> weeks | <platforms>`.
- Chips: one per platform, then the status (`Draft`, `Running`, `Done`, worked out as in plan-campaign).
- A `...` menu with `Rename` (inline edit of the H1, Enter saves, Escape cancels, max 80 characters) and `Delete campaign` (confirm `Delete this campaign? Posts you made stay in My posts and on your calendar.`; then back to `/campaigns` with the toast `Campaign deleted. Undo`, which restores it within 5 seconds). Deleting stops the drafting job for that campaign: `campaignJob.ts` checks the campaign still exists before each batch and drops a batch that lands after a delete.

WHAT IT COSTS panel, from `campaignCost(campaign, aiVideosLeft)`, where `aiVideosLeft` is the smaller of today's `ai-video` and `ai-voice` uses left (null when either is unread):

- No paid posts: big `Free` with `Every post here costs nothing to make.`
- With paid posts: big `US$<total>` and `in Higgsfield credits`, then `<free> free posts. <paid> AI videos at about US$<each> each.`
- Progress: `<made> of <total> made | <left> to make`, or `Writing <k> of <total>` while the drafting job runs.
- Coverage line, paid posts not yet made only:
  - all covered: `Today's limit covers all <n> AI videos.`
  - some: `Today's limit covers <c> of the <n> AI videos. The other <n-c> can be made from 8am tomorrow.`
  - none left: `No AI videos left today. The <n> can be made from 8am tomorrow.`
  - limits unreadable (`readUsage` null): `Couldn't read today's limits. Make still checks them.`
- Primary button: `Make the <f> free posts`. It calls plan-review-queue's `makePost` on every written, unmade, unskipped post whose format is not `ai-video`, in post order. States:
  - disabled while posts are still being written: `Waiting for <k> posts to be written.`
  - disabled when none are left: `All free posts are made.`
  - running: the label becomes `Making <i> of <f>...` and a thin bar fills; feedback starts within 400 ms; the rest of the page stays usable and the run continues if the person leaves the page (module-level, like the drafting job).
  - done: toast `<f> posts are on your calendar. Undo`. Undo deletes the drafts it made (`deleteDraft`) and puts the posts back to `ready`. Entries My posts dropped to make room do not come back, which is why the My posts warning above the button shows before the press.
  - some fail (a carousel that cannot be split, storage full): `<x> posts could not be made. They stay in the queue.`
- Helper under the button: `They go on your calendar on their days. Nothing posts until you schedule it.`
- When `loadDrafts(uid).length + f > MAX_DRAFTS` (50): a warning line above the button, `My posts keeps your newest 50, so making <f> drops your <d> oldest from it.` The button stays enabled; the line names the trade-off before it happens.
- Caution, always shown: `AI can make mistakes. Check each post before it goes out.`
- The price uses the price chip from business-cost-preview when that has shipped; until then it is plain text as above.

WHERE IT POSTS panel:

- Accounts picked and all healthy in `socialStatus`: a check and `Accounts ready` with the platform names.
- Some need reconnecting: `<n> account needs reconnecting` with `Fix on Social accounts` linking to `/accounts`.
- No accounts picked (platform chips only): `You post these yourself.` with `Connect an account` linking to `/accounts`.
- Status unreadable: `Couldn't check your accounts.` with `Try again`.

THE GOAL panel: the campaign's goal text (copied at Add), or `No goal set.` with `Set goal` linking to `/campaigns?goal=change`; then `AngleMix` from plan-angles.

Page states:

- Unknown id: `This campaign isn't here. It may have been deleted on another device.` with `Back to campaigns`.
- Writing paused (`waitUntil` set): a banner over the panels, `Writing paused until 8am. Today's limit for writing campaign posts is used.`
- Finished (every post made or skipped): a completion card above the panels, `Every post is made or skipped. <m> went on your calendar, <first day> to <last day>.` with `Open calendar` (`/calendar?view=upcoming`) and `Plan the next campaign` (`/campaigns/new?audience=<same>`, primary).

### Copy

Every string above is exact, and money is always written `US$<n.nn>` with two decimals.

### Data

- Nothing new is stored: `campaignCost` and `campaignStatus` are pure functions in `src/lib/campaigns.ts` over the stored campaign (plan-campaign) and today's usage, and Rename and Delete just rewrite the campaigns array under `content-studio-campaigns-<scoped(uid)>`.
- `AI_VIDEO_CREDITS = avatarCredits([7.5, 7.5])` (44) and `AI_VIDEO_USD = creditsUsd(AI_VIDEO_CREDITS)` (US$2.75) come from the ai-video logic. Never type the numbers in; a price change there should move this page too.

### AI and cost

- This page calls no AI. Making free posts costs nothing (text is already written, carousel slides render on the device). The AI videos are made one by one from the queue (plan-review-queue), where each one counts against `ai-video` (2 a day) and `ai-video-global` (20 a day) and refunds on failure, as `ai-video` does today.
- Each AI video also needs one voiceover from `text-voice` (ElevenLabs, prepaid), counted against `ai-voice` (10 a day). The code holds no ElevenLabs price, so the US$ figure is Higgsfield only, which is why the panel says `in Higgsfield credits`.
- No new cap and no Jev question: coverage is arithmetic, the smaller of `usesLeft("ai-video")` and `usesLeft("ai-voice")`. The across-everyone `ai-video-global` row lives on another account and cannot be read here, so Make still has the last word.

### Deep links

- `/campaigns/<id>` opens the page; `#queue` scrolls to the queue (`useScrollToHash`).
- The queue's params (`post`, `view`, `angle`) belong to plan-review-queue and plan-angles; this page reads none of its own.
- Add the row to `docs/deep-links.md` and a `CopyLinkButton` beside the H1.

## Done when

- [ ] A 12-post campaign with 4 AI videos shows `US$11.00`, `8 free posts. 4 AI videos at about US$2.75 each.` and, with 2 AI video uses left, `Today's limit covers 2 of the 4 AI videos. The other 2 can be made from 8am tomorrow.`
- [ ] A campaign with no AI video shows `Free`.
- [ ] Make the 8 free posts puts 8 posts on the calendar on their days and times with the campaign's hook and words, carousels open in `/carousel` with their slides, and Undo removes all 8.
- [ ] Leaving the page during Make does not stop it.
- [ ] With 48 posts already in My posts, the warning line names how many drop out before the button is pressed.
- [ ] Rename and Delete work, and Undo after delete brings the campaign back with its posts.
- [ ] An unknown id shows the not-here state, and a demo sign-in gets the 404 page.
- [ ] Checked at 390 px (panels stacked, no overflow) and 1440 px (three columns).
- [ ] Build and full vitest pass; the item flips in `src/data/northStar.ts`.

## Tests

- `src/lib/campaigns.test.ts`:
  - `campaignCost`: 12 posts with 4 `ai-video` gives free 8, paid 4, US$11.00; made and skipped posts are left out of what is left to make; `aiVideosLeft` 2 covers 2, 0 covers 0, null gives no coverage line; with 2 `ai-video` and 1 `ai-voice` left it covers 1.
  - `AI_VIDEO_CREDITS` equals `avatarCredits([7.5, 7.5])`, so a change to Speak pricing fails this test instead of showing a stale price.
  - `campaignStatus`: draft, running and done on fixed dates passed in (never the real clock, so the fixture cannot rot).
  - `draftsDropped(current, adding)`: 48 + 8 gives 6, 10 + 8 gives 0.
- `makeFreePosts` (in `src/lib/campaignJob.ts`, fake store): makes only ready non-video posts in order, skips failed ones, and its undo restores both stores.

## Open questions

- "One tap to cover the rest" here makes everything free and leaves AI videos to the daily limit. When business-credits ships, should the button become Fastlane's "Cover all posts | <n> credits"? Leo decides with business-credits and business-plans.
- Should US$ show at all to advisers once this goes beyond Leo, or only a credit count? Leo decides with business-cost-preview.
- Changing a running campaign's angles or pace is left out; Rename and Delete cover the first version.

## Related

plan-campaign, plan-review-queue, plan-angles, plan-goal, business-cost-preview, business-credits, agent-budget, publish-accounts, publish-calendar
