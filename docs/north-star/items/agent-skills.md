# Saved skills: a task in one tap

`agent-skills` | agent | phase 6 | status: partial | /north-star#agent-skills

## Leo asked

19 Oct 2026: "find ways where one can key in their competitors and the app will scrape their ads and top performing social media posts". The ready-made skill `Answer a competitor's new ad` acts on what that brings in. The rest of this item is no direct ask; from the competitor research.

## How the best do it

Fastlane has no saved skills in the recording; the nearest thing is the row of "ASK SENNA FOR" tiles on Home ("Ads and images" / "Make a 4:5 ad for my business", "Remix a trend", "Short videos", "Campaigns and Meta ads", "Scripts and captions") above the line "Tap one to start it in the box. Each make shows its price before anything runs." (notes-4, 2.10), which agent-home builds.

Motion packages three agent tasks that map almost one to one onto an adviser's week: "Give me feedback before launch" reviews an ad before it runs, "Track ads launched by competitors" finds rivals' latest ads and builds a plan to respond, and "Analyze this report" runs a one-click weekly retro of what to keep and cut. The outputs stay in an Inbox where the user can ask follow-up questions ([source](https://motionapp.com/), [faq](https://motionapp.com/faq), [llm-info](https://motionapp.com/llm-info)).

Descript's Underlord skills are the clearest pattern for saved instructions ([source](https://help.descript.com/ai-assistant/skills.md)):

- A skill is a saved instruction with a name and a description, run from the chat through "+" > Skills or by typing "/". It shows as a chip in the message, and the user can add context after it.
- Skills are made from App settings > Skills > "+ New skill" (Underlord drafts it from a description, or you write it), or inside a project with the built-in "Create skill" skill. "Save as skill" turns an old prompt template into one, and each skill has a "Try skill" button.
- Names run up to 100 characters and must be unique. Skills are private to their maker, saving overwrites the old version, and a delete cannot be undone.

Others:

- Hedra: type "/" > "Create skill" > Name (lowercase-hyphen), Description, Body, then call it as "/skill-name"; their examples are polish-shot, shot-list and post-process ([source](https://www.hedra.com/blog/skills-in-hedra)).
- Taplio's composer has the slash commands "/postIdeas" and "/repurpose" ([source](https://intercom.help/taplio/en/articles/17233357-using-taplio-s-ai-for-content-inspiration)).
- Arcads publishes Claude skills that match the competitor task here: spy-competitor-ads finds a rival's ads in the Meta Ad Library, and clone-hook adapts a reference video's hook to your brand ([source](https://help.arcads.ai/en/articles/17595003-competitor-ad-research-and-ad-cloning)).
- Predis.ai's MCP server ships slash presets such as /carousel, /hook-variants and /reference-ad, and before charging, its assistant states the credit cost and the balance and waits for a yes ([source](https://predis.ai/mcp/)).
- Vista Social's agent packages "expert workflows as 'Skills' run from one command" ([source](https://vistasocial.com/ask-vista)), Jasper offers 100+ purpose-built agents plus custom ones made without code ([source](https://www.jasper.ai/)), and Superscale frames its agents as job titles such as Creative Strategist and Trend Scout ([source](https://superscale.ai/)).

## What we have today

- The building blocks run today, each on its own page:
  - Post checks in Write: `scanCompliance` (`src/lib/compliance.ts`, regex, warn or error, never blocks), fact flags `factLines` (`src/lib/writingJudge.ts`, writing-judge mode "facts", cap `fact-check` 60), the sounds-human check `measure` + `judgeHuman` + `composeChecks` (`src/lib/humanCheck.ts`, cap `writing-judge` 60, result `{ checks, passed, counted }`) and the predicted score `scorePost` (`src/lib/postScore.ts`, cap `post-score` 40, `{ score: out of 10, down }`).
  - The weekly retro: Analytics' This week card builds `weekReport`, `weekMoves` and `reportFacts` from `supabase/functions/notify/logic.ts` and asks Jev for one move through `week-pick` (cap 10).
  - Rewrites from a saved instruction: Write reads `/generate?draft=<id>&ask=<words>` (up to 300 characters) and offers the result with Use this, Discard and Undo.
  - Saved instructions exist in one place, the video editor's "skills" (`src/lib/videoSkills.ts`, `content-studio-videoskills-<scope>`, up to 12, a look plus up to 500 characters of plain-words instructions, one-tap apply), and nothing outside `/edit` can use them.
- The assistant (`src/lib/assistantActs.ts`, `supabase/functions/assistant-act/logic.ts`) has seven acts chosen by Jev: move, write, week and four Engage pastes (`engage_replies`, `engage_dms`, `engage_thread`, `engage_comment`). Its `week` act shows the report facts without Jev's move. It has no slash commands, no way to run a check from chat, and no place where results are kept: the dock's chat is device-only and keeps the last 20 messages.
- `scanCompliance` lives in `src/lib/compliance.ts`. Edge functions only have a partial mirror, `COMPLIANCE_RULES` and `complianceIssues` in `supabase/functions/_shared/socialAudit.ts` (rule ids and patterns, no severity or message), kept equal to the client list by `socialAudit.test.ts`.
- Not built yet: agent-chat (`/agent`, `AgentDock`, `Composer.tsx`, `agentRun.ts`, `agentThreads.ts`) and agent-activity are specs this item builds on.

## Build

Gate with `leoOnly(email)`: the `/skills` page, slash handling in the agent chat, and the extra Jev options (the client sends the skill fields only for Leo's sign-ins). Build after agent-chat, whose `/agent` page and `AgentDock` replace the old dock on Leo's sign-ins and leave `AssistantDock.tsx` untouched, and after agent-activity (results also log there); agent-autonomy schedules the skills defined here.

Files:

- New `src/lib/chatSkills.ts`: `BUILT_IN_SKILLS`, custom skill storage (`loadMySkills`, `saveMySkill`, `removeMySkill`, `slashOf`), `runSkill(uid, skill, input)`, results (`loadSkillRuns`, `saveSkillRun`, `absorbSkillRunInbox`). Named `chatSkills` so it never clashes with the video editor's `videoSkills`.
- New `supabase/functions/_shared/skills.ts`: `runSkillServer(skill, rows)` for the two schedulable skills, pure apart from one `askJev` call, used by agent-autonomy's `agent-runs`.
- Move `COMPLIANCE_FLAGS`, `scanCompliance` and `hasComplianceErrors` into `supabase/functions/_shared/compliance.ts`; `src/lib/compliance.ts` re-exports them unchanged, so its 15 importers in `src` keep working (the same pattern `src/lib/aiUsage.ts` uses for `usageCaps.ts`). `_shared/socialAudit.ts` imports the rules from the new file and drops its `COMPLIANCE_RULES` mirror and the equality test in `socialAudit.test.ts`, so there is one list. agent-mcp-api's `check_post` uses the same file.
- New `src/pages/SkillsPage.tsx`; route `/skills` in `src/App.tsx`; nav home section `{ to: "/skills", label: "Skills", icon: Zap, owners: LEO_EMAILS }`; `src/lib/nav.test.ts` routes; `src/lib/jumpTo.ts` KEYWORDS `"/skills": "slash commands shortcuts check retro tasks"`; `src/lib/links.ts` `skills({ run, skill, post, edit })`; `docs/deep-links.md`.
- `src/lib/assistantActs.ts`: the new acts (`check`, `answer`, and `week` now running the retro), which agent-chat's turn calls like today's acts. `supabase/functions/assistant-act/logic.ts`: the new criteria and the `skill` question.
- agent-chat's `src/components/agent/Composer.tsx`: the slash menu. Its `src/lib/agentRun.ts`: a turn whose text starts with "/" runs the skill and writes the result as an agent message (`text` plus `go` chips) with no Jev call. Its empty-thread starters gain up to 2 skill chips (`/check`, `/retro`) within the 6 it allows. `src/lib/agentThreads.ts` gets `seedThread(userId, title, agentText, go)` for `Ask about this`. `AssistantDock.tsx` is not edited.

### Screens and states

Ready-made skills (`BUILT_IN_SKILLS`, each `{ id, name, slash, description, needs: "post" | "none", schedulable }`):

1. `check`, `Check before posting`, `/check`, needs a post. Runs four checks in parallel on the post's hook and body: `scanCompliance`, `factLines`, the human check, `scorePost`. Each part can fail alone without stopping the others.
2. `retro`, `Weekly retro`, `/retro`, needs nothing, schedulable. Builds the report as Analytics does and asks `week-pick` for the move.
3. `check-week`, `Check this week's posts`, `/check-week`, needs nothing, schedulable. Runs `scanCompliance` over every post scheduled in the next 7 days. Free.
4. `answer`, `Answer a competitor's new ad`, `/answer`, needs nothing. Hidden until find-competitor-ads has stored ads for this brand. Jev picks the one new ad (first seen in the last 7 days) most worth answering, and the LLM writes 3 organic post angles in reply.

Choosing the post for a skill that needs one, in order: the draft open in Write (`/generate?draft=<id>`); the post Jev picks from the words after the slash (the existing `post` question, `PICK_MIN` 0.5); otherwise the agent answers `Which post? Pick one.` with up to 5 chips (the next scheduled posts, then the newest drafts), each linking to `/skills?skill=check&post=<id>`.

In the agent chat (`/agent` and the agent dock):

- Typing `/` shows the menu above the composer: up to 6 skills whose slash or name matches what follows, as rows `/check  Check before posting`. A click (or Enter on a highlighted row) fills `/check ` and keeps focus. Esc closes the menu and leaves the composer open.
- A message starting with `/` never goes to Jev's `act` question, which saves an `agent-act` use: `agentRun` matches the slash and runs the skill.
- While a skill runs, the turn shows agent-chat's `Thinking <n>s`; the result arrives as one agent message with link chips, its meta line counting the server calls the skill made, and is saved to the results list.
- Unknown slash: `No skill called /<x>. Yours are /check, /retro, /check-week<, /your-own>.` with the chip `Open skills`.
- Without a slash, the `act` question also offers `check` and (when competitor ads exist) `answer`, and the existing `week` act now runs the Weekly retro, so "how did last week go" returns the retro with its move. A `skill` question offers the adviser's own skills.

Result messages (also shown on `/skills`):

- Check before posting on "<title>":
  - `Compliance: no flags.` or `Compliance: 2 flags, "guaranteed" and "risk-free".`
  - `Facts to check: none.` or `Facts to check: 2.` followed by each line.
  - `Sounds human: 5 of 5 checks pass.` or `Sounds human: 3 of 5 pass. Fix first: <check label>.`
  - `Predicted: 6.2 of 10.`
  - A part that failed: `<Part>: couldn't check this. <reason>` (for example the daily-limit message).
  - Chips: `Open in Write` (`/generate?draft=<id>`), and when there are flags `Fix the flags` (`/generate?draft=<id>&ask=Rewrite without these words: guaranteed, risk-free. Keep everything else.`).
- Weekly retro: the `reportFacts` lines, then `This week's move: <move text>`, chip `Open Analytics`. With no posts in 14 days: `No posts marked posted in the last 14 days.` (the existing line). Without a Jev answer the move line is left out.
- Check this week's posts: `<n> posts scheduled in the next 7 days. None has a flag.` or `... <k> have flags:` then one line per post, `"<title>": "guaranteed"`, each with an `Open` chip to `/calendar?post=<id>`. With none scheduled: `Nothing is scheduled in the next 7 days.`
- Answer a competitor's new ad: `<Advertiser> started "<first line>" <n> days ago (<format>).` then three angles, numbered, each with a `Write this` chip to `/generate?pillar=topic&detail=<angle>&ctx=<one line on the ad, never its words>`. With no new ad in 7 days: `No new competitor ads this week.`

`/skills` page:

```
Skills
READY-MADE
[Check before posting  /check ]  Compliance, facts, AI tells and a predicted score for one post.   [Run]
[Weekly retro          /retro ]  Last 7 days against the 7 before, and the one move to make.       [Run] [Run every week]
...
MY SKILLS                                                                     [New skill]
/linkedin-tighten   Tighten for LinkedIn            Works on one of my posts   [Try it] [...]
RESULTS
(o) Weekly retro    Mon 20 Oct, 9:02 (scheduled)   12 posts posted, up from 9 ...   [Ask about this]
    Check before posting   Sun 19 Oct, 8:40pm   "3 CPF myths at 55": 1 flag ...     [Ask about this]
```

- Ready-made cards: name, slash, description, `Run` (for `check`, opens the same post chooser as a sheet), and `Run every week` on schedulable ones (to `/automations?add=<id>`). Beside `Run`, a skill that spends a capped use shows the uses left from `useUsesLeft`, in the words Write's AI buttons use: `<n> left today` or `None left today` (check shows the lowest of `fact-check`, `writing-judge` and `post-score`, retro reads `week-pick`, answer reads `skill-answer`, which also shows the chip `about US$0.003`). At none left, `Run` is disabled with that line beside it. Check this week's posts is free and shows nothing.
- My skills, `New skill` opens an inline form:
  - `Name` (up to 40 characters), with the slash shown live under it (`/tighten-for-linkedin`: lowercase, spaces to hyphens, other characters dropped).
  - `What should it do?` (up to 300 characters, Write's limit), placeholder `Tighten this for LinkedIn: under 150 words, one idea, end with a question.`
  - `Works on`: `One of my posts` (runs as `/generate?draft=<id>&ask=<instruction>`) or `A new post` (runs as `/generate?pillar=topic&detail=<instruction>`).
  - `Save skill` and `Cancel`. Saving shows `Saved. Type /tighten-for-linkedin in the agent chat to use it.`
  - Errors: `Give it a name.`; `You already have /<slash>. Pick another name.`; `You can keep 12 skills. Delete one to add another.` (the button is disabled at 12 with that line beside it).
  - Each saved skill: `Try it`, and a `...` menu with `Edit` and `Delete`. Delete shows the toast `Deleted /<slash>.` with Undo.
- Results: newest first, the last 30. Each shows the skill, when, `(scheduled)` when it came from agent-autonomy, the first 3 lines with `More`, its chips, and `Ask about this`, which calls `seedThread` to start a new agent thread whose first message is the result, then opens `/agent/<threadId>` with focus in the composer. A result not yet opened has a dot. A failed scheduled run reads `Last run failed: <reason>.`
- Empty results: `Nothing run yet. Type / in the agent chat, or press Run above.`
- Loading: everything is local, so the page draws at once; a running skill shows `Running...` on its card's button.

### Copy

Every string above is exact. Page h1 `Skills`, tab title `Skills - Content Studio`, section headings `Ready-made`, `My skills`, `Results`. One InfoTip beside `My skills`: `A saved instruction you run on a post with one slash.`

### Data

- `content-studio-chatskills-<scoped(uid)>` holds `{ id, name, slash, instruction, works: "post" | "new", updatedAt }[]`, at most 12, where an edit overwrites the entry and a delete rewrites the list, so no row is ever deleted.
- `content-studio-skillruns-<scoped(uid)>` holds the last 30 results as `{ id, skill, name, at, by: "you" | "schedule", title, lines: string[], links: { label, path }[], failed?: string, postId?: string, seen?: boolean }[]`.
- Scheduled results arrive as insert-only `content-studio-skillrunin-<id>-<scope>` rows (written by agent-autonomy's `agent-runs`) and are absorbed into the list on load, de-duplicated by `id`, like the MCP draft inbox in `draftHistory.ts`.
- Each run also logs an agent-activity event with `kind: "run"`, `who` set to you or schedule, the title `Ran <name>` (plus ` on "<post title>"` when it needs a post) and the link `/skills?run=<id>`. All of this fits existing synced rows, so there is no table and no migration.

### AI and cost

- Check before posting: three Jev calls through existing functions and caps (`fact-check`, `writing-judge`, `post-score`), well under US$0.001 a run; the compliance scan is free.
- Weekly retro: one Jev call through `week-pick` (cap 10), under US$0.001.
- Check this week's posts: no model at all.
- Your own skills: Write's existing rewrite (`generate-social-content`, academy-hosted, not capped in this repo; about US$0.002 a rewrite, unverified).
- Answer a competitor's new ad needs a new edge function, `supabase/functions/skill-answer` (JWT on), built only once find-competitor-ads ships: it reads that item's stored ads for the brand, asks Jev to pick one, and has `openaiChat` write 3 angles in about 400 output tokens, for about US$0.003 a run. It counts against a new cap, `"skill-answer": 10`, commented "Answer a competitor's new ad (skill-answer): one Jev pick and one short LLM call, about US$0.003.", and gives the use back when it fails. It answers 403 `{ code: "not_allowed" }` for any uid the north-star server gate (`NORTH_STAR_USERS` with `isAllowed`) refuses.
- Jev questions (pinned `jev-1.13.0` through `_shared/jev.ts`; every caller works when Jev returns null):
  - New criteria on the existing `act` question in `assistant-act/logic.ts`, sent in agent mode only, next to agent-chat's (each turn counts `agent-act`):
    - `check`: "Check one of their saved posts before it goes out: compliance, facts, whether it sounds human, how it might do."
    - `answer` (sent only when the brand has competitor ads): "Answer or respond to a competitor's new ad or post with a post of their own."
    - `week` gains "...and the one thing to do this week" so the retro wording fits.
  - New `skill` question, sent only when the adviser has saved skills: instructions "Does the message ask the app to run one of the adviser's own saved skills? Pick none when it does not." Criteria `s1` to `s12`: `"<name>: <instruction>"`, plus `none`: "The message does not ask for any of these." Proposed threshold `SKILL_MIN = 0.7`, marked as a shortcut until a week of Leo's messages has been read side by side.
  - `skill-answer`'s pick, a `choice` over the new ads: instructions "A Singapore financial adviser wants to answer one competitor ad this week with an organic post of their own. Which ad is most worth answering: it makes a claim or offer the adviser's clients will have seen, it has run long enough to suggest it works, and the adviser can reply without copying it?" Criteria per ad: `"<advertiser>: <first two lines>, running <n> days, <format>"`. Proposed threshold 0.4; below it, the longest-running new ad is used.
- Prompt rules for `skill-answer` (the LLM writes words only): angles answer the ad's idea in the adviser's own terms; never reuse the ad's wording, brand or claims; no promised returns, no named insurer products, no invented numbers.

### Deep links

- `/skills` (no state).
- `/skills?run=<resultId>`: opens that result and marks it seen (push). agent-autonomy and agent-activity link here.
- `/skills?skill=<skillId>&post=<draftId>`: runs that skill on that post, then replaces itself with `?run=<new result id>` (used by the agent's post chips).
- `/skills?edit=<slash>` opens that skill's edit form and `/skills?new=1` opens the New skill form, both pushing a history entry.
- Add the four rows to `docs/deep-links.md` under the settings pages.

## Done when

- [ ] Typing `/` in the agent composer on Leo's sign-in shows the menu, and `/check` sent from the agent dock with Write open on a draft returns all four lines with working chips.
- [ ] "check my CPF post before I post it" (no slash) runs the check on the right post; a non-Leo account gets the old behaviour.
- [ ] `/retro` and "how did last week go" both return the retro with Jev's move; with Jev off, the facts without the move.
- [ ] `/check-week` lists flagged posts with `Open` chips that land on the post.
- [ ] A custom skill can be made, run from the agent chat with its slash, edited, deleted and undone; the 13th is refused with its line.
- [ ] Results persist across reloads and devices, `Ask about this` opens a new agent thread that starts with the result, and a follow-up question gets an answer that uses it.
- [ ] Every current `scanCompliance` caller behaves the same after the move to `_shared/compliance.ts`.
- [ ] `/skills` shows only for Leo's sign-ins; 390 px and 1440 px checked by eye.
- [ ] `npm run build` and the full `npx vitest run` pass; the item flips in `src/data/northStar.ts`.

## Tests

- `src/lib/chatSkills.test.ts`: `slashOf` ("Tighten for LinkedIn!" gives `tighten-for-linkedin`); saving refuses a duplicate slash, an empty name and a 13th skill; `runSkill` for a custom skill returns the right Write URL for `post` and `new`; results keep 30, newest first; `absorbSkillRunInbox` moves inbox rows in once.
- `src/lib/agentRun.test.ts` (extend, agent-chat's fakes): a `/` message never calls `assistant-act`; an unknown slash returns the list; `seedThread` makes a thread whose first message is the agent's; `check` with a fake `callFn` builds the four lines, and one failing part still returns the other three; `check-week` flags only scheduled posts in the next 7 days.
- `supabase/functions/assistant-act/logic.test.ts` (extend): `check` and `answer` appear only when sent; the `skill` question appears only with saved skills and picks below 0.7 return null.
- `supabase/functions/_shared/skills.test.ts`: `runSkillServer("retro")` matches the client's lines for the same rows; `runSkillServer("check-week")` matches `scanCompliance` per post.
- New `supabase/functions/_shared/compliance.test.ts`: "guaranteed" gives one `warn`, "risk-free" one `error`, a repeated word is flagged once, clean text gives none (there is no compliance test today). `socialAudit.test.ts` stays green after its mirror is removed, and `complianceIssues` returns the same ids as before for the same text.

## Open questions

- Should the video editor's saved looks (`videoSkills`) also show on `/skills`? They apply only inside `/edit`, so the recommendation is no; Leo decides.
- The north-star page recommends growing the in-app assistant (`AssistantDock.tsx`, `assistant-act`). This spec grows `assistant-act` but puts the slash menu in agent-chat's `Composer.tsx`, because `AssistantDock.tsx` is a copy of the feedback-board repo's file (its header names that repo as the source of truth) and agent-chat leaves it untouched. If Leo wants the slash menu in the old dock too, the change goes to the feedback-board repo first. Leo decides.
- Follow-up questions go to the feedback service's chat, whose prompt is tuned for how-to questions. If its answers about a result are weak, the follow-up needs the agent-chat model instead; agent-chat decides.
- Sharing skills across a team (Descript has not shipped it yet) waits for trust-workspaces.

## Related

agent-chat, agent-autonomy, agent-activity, agent-home, agent-mcp-api, find-competitor-ads, trust-compliance-check, edit-score, learn-weekly-report, edit-text-post
