# One goal steers everything

`plan-goal` | plan | phase 5 | status: partial | /north-star#plan-goal

## Leo asked

No direct ask; from the competitor research.

## How the best do it

Fastlane keeps one goal line per workspace and shows it in three places.

1. Strategy, under the H1: grey "Goal", then "Save time on marketing for Activity Tracker", then a small outlined "Change" button. The first-run card below it reads "Plan your first campaign" / "Pick who it should reach. Senna drafts the posts and you approve them before anything goes out."

![Fastlane 0:00](../../../public/north-star/fastlane/t000.webp)

2. Home, under the greeting: a red square, "GOAL" in red caps, then the same sentence. While Home loads, the goal is a grey bar and arrives a second later (t001, t002).

![Fastlane 0:04](../../../public/north-star/fastlane/t004.webp)

3. The campaign page repeats a longer form of it in a "THE GOAL" panel: "Save time on marketing: hand off the busywork." over the brand blurb and the angle mix (see plan-angles, t038).

Setting the goal is logged. Settings > Activity has the row "Goal set: Save time on marketing: hand off the busywork." | "You" | "Carried from classic at the move to v2: Save time on marketing." with "Details >" on hover.

![Fastlane 5:42](../../../public/north-star/fastlane/t342.webp)

What "Change" opens was not shown in the recording (unverified). The goal's effect on the plan is also not shown; the campaign's success line "28 posts, 2 winners" is the only target in view.

Other tools tie a goal to what gets made:

- Ocoya campaigns start from a goal picked from 'Awareness', 'Generate leads', 'Launch', 'Promote an offer', 'Educate audience' or 'Event', plus an audience and dates, and write up to 90 drafts along an Awareness, Consideration, Decision arc ([source](https://www.ocoya.com/features/campaigns)).
- Blaze campaigns hold a goal next to posting frequency, volume and channels ([source](https://help.blaze.ai/en/articles/9535151-getting-started-with-blaze)).
- Agorapulse Playbooks store a brand goal, audience, tone and CTA links that its writer Archie reads, edited under 'Audience and Goals' ([source](https://support.agorapulse.com/en/articles/15452272-how-to-generate-posts-with-archie)).
- Simplified's Riley agent takes a brief with goal, audience, offer, channels and brand rules ([source](https://simplified.com/)).
- Hootsuite's best-time view asks for a goal (engagement, traffic, awareness or reach) before it recommends slots ([source](https://www.hootsuite.com/platform/publishing)).

## What we have today

- A weekly posting goal, not an outcome goal. `src/lib/goals.ts` stores posts per week per platform under `content-studio-goals-<scoped(uid)>`; Home's This week card edits it (`src/pages/HomePage.tsx`: "Save goal" near line 585, "Set a weekly goal" near line 643) and `/plan`'s "Posts per week" reads and writes the same number (`setPlatformGoal`). Brand's posting times card can set it too ("Or start from a weekly goal", `BrandPage.tsx` near line 524). Analytics and the in-app assistant (`src/lib/assistantActs.ts`) pass the weekly total to `weekReport`.
- Positioning (`src/lib/positioning.ts`, key `content-studio-positioning-<scoped(uid)>`) holds oneLiner, audience, audienceDetail, topics, edge, platform and cadence. Nothing in it says what the posting is for. `brand-dna` ("Add a brand from its website") pre-fills these fields from a home page and has no goal field either.
- Every `content-studio-` key syncs through `src/lib/cloudSync.ts`, so a goal kept inside positioning reaches the brand's other devices with no new key and no table.
- The plan engine `generatePlan` in `src/lib/contentPlan.ts` balances slots by the fixed funnel weights in `src/data/funnelFramework.ts` (attraction 4, trust 4, conversion 2), and no input changes that mix. `stageOrderForWeek` rounds each stage's share and then takes any surplus from Attraction first, so other weights do not always change the split (see Build).
- Home's header is the greeting only (`HomePage.tsx` line 313). There is no goal line on Home, `/plan` or anywhere else.
- `writing-judge` (Jev only) has the modes human, hooks, idea, profile, carousel and facts. Text modes need 40 characters (`MIN_TEXT`), a mostly non-English text gets 422 `not_english`, and with no `TYPESAFE_API_KEY` it answers 503 before counting a use.
- Claude's connector reads positioning through `get_brand` (`supabase/functions/content-studio-mcp/logic.ts`, the `pick(pos, [...])` list near line 246). The in-app assistant's chat runs on the feedback service (leotan-feedback `/assistant/chat`), outside this repo; its actions are classified by `assistant-act` (Jev only).

## Build

Gate everything with `leoOnly(email)` from `src/lib/leoOnly.ts`. Build this item first in the plan area: plan-angles and plan-campaign read the goal.

### Screens and states

One shared component, `src/components/GoalLine.tsx`, shown in two places:

- Home, directly under the H1 greeting (`HomePage.tsx` header block), only when `leoOnly(email)`.
- `/campaigns` header (the page plan-campaign creates), under the H1.

```
GOAL  Get more enquiries from people I can help   [Change]
```

States:

- Loading: a grey bar the width of a sentence while positioning is read (it is local, so this is one frame at most).
- Empty (no goal saved): `GOAL  Set a goal for this brand  [Set goal]`.
- Saved: the goal text and "Change".
- Editing (after Change or Set goal, or when the URL has `?goal=change`): an inline panel right under the line, never a separate page.

```
What should posting do for you?
( ) Get more enquiries from people I can help
( ) Grow an audience that knows what I do
( ) Keep in touch with clients so they refer me
( ) Find people to join my team
( ) Post every week without it taking my evenings
[ Or write your own ................................ ]
                                   [Cancel] [Save goal]
```

- Picking a chip fills the text field with that line and sets the kind directly (no Jev call).
- Writing your own: on Save, call `writing-judge` mode "goal" (below). Show "Reading your goal..." on the Save button within 400 ms.
  - Jev picked a kind at or above 0.6: save text and kind, close the panel, toast "Goal saved. New plans and campaigns follow it."
  - Jev below 0.6, null, or the text is not English: keep the panel open and show "Which of these is closest?" with the five chips as a single-choice row; Save stays enabled once one is picked. The typed text is kept as the goal; only the kind comes from the chip.
  - Over the writing-judge cap (429): same as null. The cap message is not shown because picking a chip still works.
- Validation: 4 to 120 characters; under 4 shows "Write a few more words." Over 120 is stopped by `maxLength`.
- Typed text survives navigation: keep the open editor's text in `sessionStorage` key `cs-goal-work-<scoped(uid)>` until Save or Cancel, the way `/plan` keeps `cs-plan-work-`.

What follows the goal once saved:

1. `generatePlan` (`src/lib/contentPlan.ts`) takes a new optional `weights?: Record<FunnelStageId, number>`. Without it, `stageOrderForWeek` runs exactly as today. With it, the week is split by largest remainder: floor each stage's share of the cadence, give the slots left over to the stages with the largest fractions (ties to the earlier stage), then keep today's rule of at least one Attraction slot. The current rounding cannot be reused: it takes surplus from Attraction first, so 6/3/1 at 5 a week comes out 2/2/1, the same as no goal. `GOAL_WEIGHTS` (in `positioning.ts`), with the split each gives at 3, 5 and 7 a week:
   - clients: attraction 2, trust 4, conversion 4 (1/1/1, 1/2/2, 1/3/3)
   - audience: attraction 6, trust 3, conversion 1 (2/1/0, 3/2/0, 4/2/1)
   - trust: attraction 3, trust 6, conversion 1 (1/2/0, 2/3/0, 2/4/1)
   - recruit and time: no entry, so no `weights` are passed and the plan keeps today's 4/4/2 (1/1/1, 2/2/1, 3/3/1)
   `/plan` passes `GOAL_WEIGHTS[positioning.goalKind]` when that kind has an entry, so the existing plan follows the goal too. With no goal, or recruit or time, the output is identical to today.
2. plan-angles sends the goal text with every angle suggestion; plan-campaign sends it with every drafting call and shows it in the review step.
3. plan-campaign-page shows it in the "THE GOAL" panel.
4. Claude's connector: add `"goal"` and `"goalKind"` to the `pick(pos, [...])` list in `content-studio-mcp/logic.ts` and to the `get_brand` description ("...positioning (goal, audience, topics...").
5. The in-app assistant reads it once agent-chat moves chat into this repo; nothing to change in the dock now.

### Copy

- Line label: `GOAL`
- Empty: `Set a goal for this brand` / button `Set goal`
- Saved: button `Change`
- Panel title: `What should posting do for you?`
- Chips, exactly: `Get more enquiries from people I can help`, `Grow an audience that knows what I do`, `Keep in touch with clients so they refer me`, `Find people to join my team`, `Post every week without it taking my evenings`
- Field placeholder: `Or write your own`
- Buttons: `Cancel`, `Save goal`, busy `Reading your goal...`
- Unsure: `Which of these is closest?`
- Too short: `Write a few more words.`
- Saved toast: `Goal saved. New plans and campaigns follow it.`
- InfoTip beside GOAL (`InfoTip` from `src/components/ui/info-tip.tsx`, one sentence): `Plans, angles and campaigns are written toward this.`

### Data

- Extend `Positioning` in `src/lib/positioning.ts` with optional `goal?: string`, `goalKind?: GoalKind`, `goalSetAt?: string`, and export `GoalKind = "clients" | "audience" | "trust" | "recruit" | "time"`, `GOAL_CHIPS` (kind to chip text) and `GOAL_WEIGHTS`. Same synced key `content-studio-positioning-<scoped(uid)>`, one goal per brand. `EMPTY_POSITIONING` gets no goal fields, so old rows load unchanged.
- Add `saveGoal(userId, text, kind)` that loads positioning, sets the three fields and saves; it must not touch the other fields or reset `cadence`.
- This needs no table and no migration. History of past goals is left to agent-activity.

### AI and cost

- `writing-judge` mode "goal" `{text}` returns `{kind: GoalKind | null, p: number | null}`. One Jev choice question, counted against the existing "writing-judge" cap (60 a day). About 300 Jev input tokens, well under US$0.0001 a call. No LLM. Add "goal" to `MODES` in `writing-judge/logic.ts` with its own length check (4 to 120 characters) in `parseJudgeRequest`, since the text modes' 40-character `MIN_TEXT` would refuse most goals.
- The browser treats any answer other than 200 with a kind (429 cap, 503 no key or usage unreadable, 422 not English, a network error) as null and shows the chip row.
- Jev question (state `{goal: text, country: "Singapore", who: "a financial adviser or a small business that posts on social media"}`):
  - id `kind`, type choice, instructions: "Which outcome does `who` most want from posting, going by `goal`?"
  - criteria: clients "new clients, enquiries, appointments, leads or sales"; audience "more followers, reach, views or being known in a niche"; trust "existing clients and followers trusting them more, staying in touch or sending referrals"; recruit "recruiting people to join their team, agency or business"; time "posting regularly with less effort, time or stress".
- Threshold: use the pick when its probability is at least 0.6 (`JEV_GOAL_MIN` in `writing-judge/logic.ts`). This is proposed; Leo's rule is to read thresholds off real answers, so log `{kind, p}` for the first 30 typed goals and adjust before turning it on for anyone else.
- Without Jev (null, timeout, not English): the chip row decides. Nothing else depends on Jev here.
- Server gate: the "goal" mode answers 404 `{code: "not_enabled"}` unless `leoOnly(user.email)`. Add `supabase/functions/_shared/leoOnly.ts` with the same two emails and a test that it equals `src/lib/leoOnly.ts` (the `COMPLIANCE_RULES` mirror test in `_shared/socialAudit.test.ts` is the pattern). Nothing new goes into `usageCaps.ts`.

### Deep links

- `/home?goal=change` and `/campaigns?goal=change` open the editor (`useUrlFlag("goal", "change")`, replace). Closing removes the param.
- Add both rows to `docs/deep-links.md` and a builder `links.goal(page: "home" | "campaigns")` in `src/lib/links.ts`.

## Done when

- [ ] Signed in as tanjunsing@gmail.com, Home shows the GOAL line under the greeting; a demo sign-in sees no line, and `/home?goal=change` does nothing for it.
- [ ] Picking a chip and pressing Save goal stores `goal`, `goalKind` and `goalSetAt` on the active brand's positioning and leaves `cadence`, topics and the rest unchanged.
- [ ] A typed goal such as "more people booking a 15-minute review with me" comes back as clients, and the panel closes with the toast.
- [ ] A typed goal Jev is unsure about, or a writing-judge call that fails (block the request in devtools, or a 503), shows "Which of these is closest?" and still saves.
- [ ] Switching brand shows that brand's own goal.
- [ ] With goal kind "audience", rebuilding `/plan` at 5 a week gives 3 Attraction, 2 Trust and 0 Conversion slots each week, against 2, 2 and 1 with no goal.
- [ ] Claude's `get_brand` returns `goal` and `goalKind`.
- [ ] Typed text in the editor survives leaving Home and coming back in the same tab.
- [ ] Checked by eye at 390 px and 1440 px: the line wraps under the greeting with no overflow; Change is at least 44 px tall on touch.
- [ ] `npm run build` and the full `npx vitest run` pass; the item flips in `src/data/northStar.ts`.

## Tests

- `src/lib/positioning.test.ts` (new): `saveGoal` keeps every other field; an old row without goal fields loads with them undefined.
- `src/lib/contentPlan.test.ts`: `generatePlan` with `weights: GOAL_WEIGHTS.audience` at cadence 5 gives 3/2/0 a week and with `GOAL_WEIGHTS.clients` gives 1/2/2; without weights the output is identical to today (snapshot the stage order at cadence 3, 4, 5 and 7, including today's 1/2/1 at 4).
- `supabase/functions/writing-judge/logic.test.ts`: the goal question has the five criteria; `goalPick` returns the kind at 0.6, null at 0.59, null for an unknown choice and null when answers are null.
- `supabase/functions/_shared/leoOnly.test.ts`: the server list equals `src/lib/leoOnly.ts` `LEO_EMAILS`.
- `supabase/functions/content-studio-mcp/logic.test.ts`: `get_brand` includes goal fields when present.
- Prove each case bites: break the threshold or drop a field and see the test fail before restoring it.

## Open questions

- Should the five chips differ for Leo's own brands (MoneyBees, FINternship, ActivityTracker) from the adviser set? Leo decides; the free-text field covers it meanwhile.
- Should a goal change offer to rebuild open campaigns' unmade posts? Proposed: no, it applies to new plans only, which keeps the change reversible. Leo decides.

## Related

plan-campaign, plan-angles, plan-campaign-page, plan-content-plan, brand-audiences, agent-chat, agent-home, agent-activity, learn-pace
