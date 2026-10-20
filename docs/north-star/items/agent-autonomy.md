# What runs without you

`agent-autonomy` | agent | phase 6 | status: partial | /north-star#agent-autonomy

## Leo asked

No direct ask; from the competitor research.

## How the best do it

Fastlane's Settings index has a SENNA group whose first tile is "What runs without you" / "What Senna does alone and what waits for you.", next to "Notifications" / "Which emails and alerts you get." (t346). Leo did not open either, so what the page holds is unverified (notes-4, 2.17). The rule it serves shows everywhere else in the recording: Senna's message before a video card, "It is a draft, so nothing is made or charged until you approve the card." (2.3), the Strategy notice "Nothing posts or is charged until you approve it." (2.11), and on the public site "Nothing publishes without your approval" ([source](https://usefastlane.ai/tools/ai-ugc-video-generator)). The sidebar also carries a usage meter separate from credits, "Senna's fuel used 2%" with "Resets 28 Oct" (what uses fuel is unverified).

![Fastlane 5:46](../../../public/north-star/fastlane/t346.webp)

Others:

- InVideo lets the person choose when its agent may spend: "Always allow" (the default), "Ask before generating videos" or "Always ask before generating". When it asks, a popup shows the prompt, model, duration and aspect ratio, all editable before confirming ([source](https://help.invideo.io/en/articles/14718313-how-credits-are-charged-when-using-ai-agents)).
- Sandcastles ships one automation rule, "Top Daily Performers", off by default. Switched on, it analyses watchlist videos with an outlier score of 1 or more, at least 25,000 views and 2% engagement, at most 3 a day, for 1 credit each ([source](https://help.sandcastles.ai/ideas), [credits](https://help.sandcastles.ai/credits-v3)).
- Vamos "Routines" are saved prompts on a schedule the person sets, delivered by email and in the app, with 1 active routine on Free, 2 on Pro and 5 on Business ([source](https://docs.getvamos.ai/en/articles/13204779-what-vamos-does), [plans](https://intercom.help/getvamos/en/articles/13004516-plans-credits-and-prices)).
- Revid.ai "Auto-Mode" workers make one video a day from a source and settings and can publish on their own; 3 workers on Growth, 5 on Elite, 10 on Ultra ([source](https://www.revid.ai/llm/revid-ai-publishing-and-automation.md)).
- Blaze's Autopilot makes a weekly batch of posts to review, and its automatic generation can be switched on or off ([source](https://help.blaze.ai/en/articles/12313537-what-is-the-difference-between-blaze-autopilot-and-blaze-copilot)). Its "Adjust Defaults" sets when it posts per channel and how many days before posting you want to review ([source](https://help.blaze.ai/en/articles/12417963-how-do-i-change-the-volume-or-type-of-content-being-generated)).
- Arcads' agent Mark runs routines "daily, weekly or every few hours" ([source](https://help.arcads.ai/en/articles/17594959-ai-ad-agent-mark)), and Virlo's recurring agents have run on autopilot by default since 25 Sep 2026, logging what changed each run ([source](https://dev.virlo.ai/changelog)).

## What we have today

- Things already run without the adviser, each set up in a different place:
  - Phone alerts (a post due within the hour, and Thursday evening when the week's goal is behind) and the Monday results email at 8am, switched in My Playbook > Reminders (`src/components/NotifySettings.tsx`, synced key `content-studio-notify-<uid>`, `{ email, push }`). pg_cron calls `supabase/functions/notify` every hour (`supabase/hub/016_notify.sql`, job `notify-hourly`).
  - The weekly account audit refresh (`supabase/functions/refresh-social-audits`, hourly cron in SQL 005), which only refreshes audits opened in the last 30 days.
  - The Monday email already holds a weekly retro: `weekReport`, `weekMoves` and Jev's one move (`moveAsk`, `pickedMove`) in `supabase/functions/notify/logic.ts`, the same code as Analytics' This week card (`week-pick`).
  - Once set up, Post it for me posts at the time the adviser picked (Zernio, `supabase/functions/social`), and Auto-DM answers keyword comments with a DM or a reply (`/recruit/auto-dm`, `src/pages/AutoDmPage.tsx`). Both sit behind the social allowlist (`socialConnectShown()`).
- Every assistant act today waits for a tap on a confirm card (`src/components/feedback/AssistantDock.tsx`, `src/lib/assistantActs.ts`): move and paste carry Undo, and write opens Write, where nothing changes until Use this. So the assistant never acts alone. Jev's act must reach `ACT_MIN` 0.6 and the post, day and time `PICK_MIN` 0.5 (`supabase/functions/assistant-act/logic.ts`) before a card is offered. The function sends back only the pick; the probabilities stay on the server.
- Daily caps live in `DAILY_LIMITS` (`supabase/functions/_shared/usageCaps.ts`); `useUsesLeft` in `src/lib/aiUsage.ts` shows `<n> left today` beside AI buttons. No page lists them.
- No page says what runs alone, there is no setting for how much the assistant may do, and no way to run a task on a schedule.
- Not built yet: agent-chat (`/agent`, `AgentDock`, cap `agent-act`) and agent-approvals (ActionCards, receipts, `needsCard` in `src/lib/agentCards.ts`) are specs. agent-approvals' spec already has `needsCard` take this item's switch as an argument.
- The cron pattern to copy is `supabase/hub/021_social_sweep.sql`: a job that posts to a `--no-verify-jwt` function with a secret header read from Vault, and creates no table.

## Build

Gate with `leoOnly(email)`: nav `owners: LEO_EMAILS`, the page renders `NotFoundPage` for anyone else, and `agent-runs` skips every user the north-star server gate refuses (`isAllowed(Deno.env.get("NORTH_STAR_USERS"), uid)` or `_shared/leoOnly.ts`, whichever an earlier item shipped; see brand-from-website's open question) until Leo turns it on. Build after agent-chat and agent-approvals (the thread and the cards the switch acts on) and agent-skills, which owns the skill registry and the server-side skill runner this page schedules.

Files:

- New `src/pages/AutomationsPage.tsx`; new `src/lib/autonomy.ts` (settings and schedules: `loadAutonomy`, `saveAutonomy`, `loadRuns`, `saveRun`, `nextRunAt`, `RUN_HOURS`, `MAX_RUNS`).
- `src/App.tsx` lazy route `/automations`; `src/lib/nav.ts` home section `{ to: "/automations", label: "Automations", icon: Timer, owners: LEO_EMAILS }`; `src/lib/nav.test.ts` routes list; `src/lib/jumpTo.ts` KEYWORDS `"/automations": "autopilot schedule routines limits what runs without you"`; `src/lib/links.ts` `automations({ run, add })`; `docs/deep-links.md`.
- `supabase/functions/assistant-act/logic.ts`: return the probabilities with the pick. agent-approvals' `needsCard`: read the switch and the thresholds below. `AssistantDock.tsx` is not edited.
- New `supabase/functions/agent-runs/index.ts`, `logic.ts`, `logic.test.ts`; new `supabase/hub/0NN_agent_runs.sql` (cron job only).

### Screens and states

```
What runs without you

WHAT THE AGENT DOES ALONE
Moving or scheduling a post          [Ask me first | Do it, then tell me]
Videos and voiceovers                Always wait for your yes.
Posting                              Nothing posts without your yes.

SCHEDULED RUNS                                          [Schedule a skill]
Monday results email     Mondays, 8am                              [on ]
Phone alerts             On for this device   Change in My Playbook >
Weekly retro             Mondays, 9am   Last ran Mon 13 Oct, 9:02  [on ] [...]

DAILY LIMITS
Agent messages           94 of 100 left today
Scheduled runs           10 of 10 left today
Pictures                 5 of 5 left today
AI videos                2 of 2 left today
Limits reset at 8am Singapore time.
```

What the agent does alone:

- `Moving or scheduling a post` is a two-way switch, `Ask me first` (default) or `Do it, then tell me`. Later acts that change only the adviser's own lists (add a competitor in find-competitors, save a preference in agent-memory) read the same setting and add their words to the row's sub line.
- Pictures get the same switch, labelled `Pictures` with the chip `about US$0.01 each`, only once agent-approvals lets the agent make pictures; until then the row is not drawn.
- `Videos and voiceovers` and `Posting` are fixed lines with no switch, because those always wait for a yes.
- Saving shows `Saved.` beside the switch within 400 ms; nothing else on the page moves.

How `Do it, then tell me` works:

- `assistant-act` returns the probabilities with the pick: `{ pick, p: { act, post, day, time } }` (each `number | null`).
- `needsCard(pick, p, setting)` returns false only when the setting is `auto`, the act is `move`, `p.act >= AUTO_ACT_MIN` (0.85), `p.post >= AUTO_PICK_MIN` (0.8), and a day was named with `p.day >= AUTO_PICK_MIN`. The move then runs at once and the thread shows agent-approvals' receipt with Undo, under the line `Moved "<title>" to <Tue 21 Oct, 9am>. You asked me not to check first.`
- Everything else still gets the card. Write acts always get a card (they open a page), and so do pastes that would replace text already in Reply drafts.
- While the setting is `ask`, agent-approvals' approve and decline handlers record `{ at, act, p, confirmed }` for every card in the synced row `content-studio-agentshadow-<uid>` (last 200, newest first). It is synced rather than a device key so the cards from every device sit in one row that a session can read from `cs_user_data` for the side-by-side run Leo's rule asks for: the thresholds are set from it before anyone switches to auto (see Open questions).

Scheduled runs:

- Built-in rows come from a list in `autonomy.ts`: `Monday results email` (its switch writes `content-studio-notify-<uid>` exactly as My Playbook does, so both pages agree) and `Phone alerts` (status only, `On for this device` / `Off`, with `Change in My Playbook >`, since turning alerts on needs the browser's permission prompt there). When `socialConnectShown()` is true, one more fixed row reads `Auto-DM` / `Replies to keyword comments for you.` with `Change in Auto-DM >` (`/recruit/auto-dm`); it makes no call, so it shows no count. Later items add their own rows here: competitor ads each week (find-competitor-ads), weekly drafts (plan-autopilot), the weekly brief (find-alerts-digest).
- Scheduled skills: one row each with the skill's name, `Mondays, 9am` or `Every day, 9am`, the last run (`Last ran Mon 13 Oct, 9:02.`, `Last run failed: <reason>.` or `Not run yet. First run Mon 20 Oct, 9am.`), a switch, and a `...` menu with `Run now`, `Change time` and `Remove`.
  - `Run now` runs the skill in the browser through agent-skills, shows `Running...`, then `Done. See the result >` linking to `/skills?run=<id>`.
  - `Remove` asks nothing and shows the toast `Removed "Weekly retro" from your schedule.` with Undo.
- `Schedule a skill` opens an inline form under the heading: `Skill` (a select listing only skills marked `schedulable` in agent-skills: `Weekly retro`, `Check this week's posts`, and `New competitor ads` once find-competitor-ads ships), `Repeat` (`Every week` | `Every day`), `Day` (Monday to Sunday, weekly only, default Monday) and `Time` (`7am` to `10pm` on the hour, Singapore time, default `9am`), and it ends with `Schedule it` and `Cancel`. Saving shows `Scheduled. First run <Mon 27 Oct, 9am>.`
  - At 5 scheduled skills the button is disabled with `You can schedule up to 5 skills. Remove one to add another.`
  - The same skill at the same day and hour twice: `That skill already runs then.`
- Empty (no scheduled skills): the heading row and `Schedule a skill` only; no extra line.

Daily limits:

- Rows: `Agent messages` (`agent-act`, 100, once agent-chat ships; until then `Assistant actions` from `assistant-act`, 30), `Scheduled runs` (`agent-run`), `Pictures` (`ai-image`), `AI videos` (`ai-video`), `Voiceovers` (`ai-voice`), each `<n> of <limit> left today` from `useUsesLeft`. While the count loads the cell shows a skeleton bar; if it cannot be read the column shows `-`.
- Under the list: `Limits reset at 8am Singapore time.` The limits are constants Leo sets in code; the page only reads them.

### Copy

Every string above is exact. Headings: `What runs without you` (h1, tab title `Automations - Content Studio`), `What the agent does alone`, `Scheduled runs`, `Daily limits`. One InfoTip beside `Scheduled runs`: `Runs happen on our server, so your computer can be off.`

### Data

- `content-studio-autonomy-<uid>` (per account, synced): `{ changes: "ask" | "auto", pictures: "ask" | "auto" }`. Anything missing reads as `ask`.
- `content-studio-agentshadow-<uid>` (per account, synced): `{ at: string; act: string; p: { act, post, day, time }; confirmed: boolean }[]`, last 200, newest first. Written only on Leo's sign-ins.
- `content-studio-agentruns-<scoped(uid)>` (per brand, synced): `{ runs: { id: string; skill: string; every: "week" | "day"; day?: 0..6 (0 = Monday); hour: 7..22; on: boolean; createdAt: string }[] }`, at most `MAX_RUNS` = 5. Turning a run off writes `on: false`; removing it edits the list. Neither deletes a key, so the no-tombstone rule is safe.
- Run results come back as insert-only rows `content-studio-skillrunin-<runId>-<scope>`, which agent-skills absorbs into its results list, plus an activity row `content-studio-activityin-<id>-<scope>` with `who: "schedule"` (agent-activity). The server never writes the two client-owned rows above, so there is no lost update.
- `supabase/hub/0NN_agent_runs.sql`: `cron.schedule('agent-runs-hourly', '7 * * * *', ...)` posting `{}` to `/functions/v1/agent-runs` with header `x-agent-runs-secret` read from Vault `cs_agent_runs_secret`, modelled line for line on 021, including its refusal to schedule while the Vault secret is missing. It creates no table, function or grant. `0NN` is the next free number when it is written: origin/main ends at 024 (f2cb275, 20 Oct), and business-credits, publish-comments-followups and trust-workspaces also propose 025, so check `ls supabase/hub` and the live `cron.job` names first. It still goes through migration review and Leo's yes before it is applied.

### AI and cost

- `agent-runs` (hourly, `--no-verify-jwt`, secret `AGENT_RUNS_SECRET`): pages through rows whose key starts `content-studio-agentruns-`, 10 users a request, with the same wall-time budget as notify's `run.ts`. For each run that is on and due this Singapore hour:
  1. `claimOnce(admin, uid, "agent-run:<runId>:<YYYY-MM-DDTHH>")`, so an overlapping call never runs it twice;
  2. `consumeUsage(admin, uid, "agent-run")` and `consumeUsage(admin, GLOBAL_COUNTER_USER, "agent-run-global")`; a refusal writes a failed result `Skipped: today's scheduled runs are used up.`;
  3. runs the skill with `runSkillServer(skill, rows)` from agent-skills (`supabase/functions/_shared/skills.ts`);
  4. writes the result row and the activity row. A failure refunds `agent-run` (`refundUsage`) and writes `Last run failed: <reason>.`
- A missed hour (cron down) is not caught up; the next due slot runs.
- New caps in `DAILY_LIMITS`:
  - `"agent-run": 10`, commented "A scheduled skill run (agent-runs): Weekly retro is one Jev call, Check this week's posts is free."
  - `"agent-run-global": 200`, commented "All scheduled runs across everyone, on GLOBAL_COUNTER_USER."
- Cost per run: Weekly retro asks the existing `moveAsk` Jev question (under US$0.001). Check this week's posts runs the compliance rules only (free). The cron itself costs nothing beyond Supabase invocations.
- Jev: no new question. Auto mode reuses the `act`, `post` and `day` questions already asked by `assistant-act`, with the proposed thresholds `AUTO_ACT_MIN = 0.85` and `AUTO_PICK_MIN = 0.8` beside `needsCard`, each marked `// shortcut: proposed, set from content-studio-agentshadow before auto goes on`. When Jev returns nothing, `pick` is null and the chat answers in words, as it does today.

### Deep links

- `/automations` (no state), with anchors `#alone`, `#runs`, `#limits` read by `useScrollToHash`.
- `/automations?run=<runId>` opens that run's `Change time` form (push).
- `/automations?add=<skillId>` opens `Schedule a skill` with that skill picked (push), which is where agent-skills' `Run every week` button lands.
- Add these three rows to `docs/deep-links.md` under the settings pages.

## Done when

- [ ] `/automations` shows for Leo's two sign-ins only, and a typed URL on another account shows the 404 page.
- [ ] With `Ask me first`, every agent act still shows a card, and each approve or decline adds one entry to `content-studio-agentshadow-<uid>`, which a second device sees after sync.
- [ ] With `Do it, then tell me`, "move my CPF post to Friday 9am" applies at once with Undo, while a vague "move it later" still shows a card.
- [ ] The Monday email switch here and in My Playbook always agree.
- [ ] A Weekly retro scheduled for the current hour runs once on the next cron call (test with `{ "only": "<uid>", "now": "<iso>", "dryRun": true }` first), its result shows in `/skills` and a `Scheduled` row shows in `/activity`.
- [ ] Two overlapping calls for the same hour run it once.
- [ ] The 11th scheduled run of a day writes the skipped result and runs nothing.
- [ ] Leo approved `0NN_agent_runs.sql` after migration review, and it is applied.
- [ ] 390 px and 1440 px checked by eye; switches and menus at least 44 px on touch.
- [ ] `npm run build` and the full `npx vitest run` pass; `deno test` for `agent-runs`; the item flips in `src/data/northStar.ts`.

## Tests

- `src/lib/autonomy.test.ts`: defaults read as `ask`; `saveRun` refuses a sixth run and a duplicate skill at the same day and hour; `nextRunAt` for weekly and daily runs across a Sunday-to-Monday turn and the Singapore day boundary.
- `supabase/functions/assistant-act/logic.test.ts` (extend): `actPick` returns the probabilities beside the pick, and nulls where Jev gave none.
- agent-approvals' `needsCard` test (extend): `needsCard(pick, p, setting)` is false only for a move above both thresholds with a day, and true for write, for a missing day and for `ask`; in auto mode a sure move changes the draft at once, and an unsure one keeps the card and changes nothing.
- `supabase/functions/agent-runs/logic.test.ts` (Deno, fakes like notify's `run.test.ts`): `dueRuns(rows, now)` picks weekly runs on their Singapore weekday and hour and daily runs every day; runs that are off are skipped; a claimed run is skipped; a cap refusal writes the skipped result; a failed skill refunds the use; non-Leo users are skipped while the gate is on.
- `usageCaps` test: `agent-run` is 10 and `agent-run-global` is 200.

## Open questions

- Turning on `Do it, then tell me` for real use: a session reads the `content-studio-agentshadow-<uid>` entries from two weeks of Leo's cards, shows him every card where Jev was sure and he declined, and sets `AUTO_ACT_MIN` and `AUTO_PICK_MIN` where at least 95% of cards that cleared them were confirmed. Until then the switch is there but the thresholds are proposals.
- `0NN_agent_runs.sql` adds a cron job and a Vault secret, no table. It is a database change on the shared academy project, so it waits for Leo's yes.
- The Monday results email already carries the same retro and Jev's move at 8am. A scheduled `Weekly retro` adds a copy in `/skills` that Leo can ask about. Keep both, or drop the scheduled retro from the skill list while the email is on? Leo decides; default keeps both.
- Should scheduled results also push to the phone ("Your weekly retro is ready")? That needs a hook into notify; Leo decides. Default: results wait in `/skills` and `/activity`.
- Should a team leader set these switches for advisers (trust-workspaces)? Later, Leo's call.

## Related

agent-skills, agent-activity, agent-chat, agent-approvals, agent-budget, agent-memory, plan-autopilot, find-competitor-ads, find-alerts-digest, business-cost-preview, trust-workspaces
