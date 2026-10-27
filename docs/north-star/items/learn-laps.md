# Laps: each run scored, the next one planned and priced

`learn-laps` | learn | phase 7 | status: missing | /north-star#learn-laps

## Leo asked

No direct ask. From the Senna research Leo asked SearchBlueprint's Atlas session to share on 27 Oct 2026 (`~/Documents/seo-audit-tool/docs/north-star/research/senna.md`, S11 and S13). SearchBlueprint built the same idea for articles as atlas-laps (`~/Documents/seo-audit-tool/docs/north-star/items/atlas-laps.md`).

## How the best do it

Fastlane's "Claude for Ads" launch video counts its cycles as laps (frames in `~/Documents/sb-north-star-research/screens/`, kept out of the repo):

- A chequered flag and the word "Lap" at 1:17.
- "Ad set 3 cooked." with "Felt like a FaceTime, not an ad." over four bars against the account: thumbstop 41% against a 25% average, hold rate 18% against 8%, CPA $32 (46% under the account) and ROAS 5.4x against 2.1x (1:19 to 1:21, `claude-for-ads-1m20-ad-set-3-cooked.jpg`).
- The next lap is proposed from the winners: "For lap 2, let's run 6 remixes of this winner." (1:22) and, for a breakout organic video, "For lap 2, let's run it as a Spark ad." (1:27).
- The video ends on "Ready for Lap 2?" (1:35, `claude-for-ads-1m35-ready-for-lap-2.jpg`).
- In the app each campaign sets its bar before it starts, "Success looks like: 28 posts, 2 winners" (plan-campaign), and Activity logs "Plan added" with the mix it chose.

Others:

- Motion packages a one-click weekly retro whose output stays in an inbox for follow-up questions (agent-skills).
- Buffer ends each insight in a button that fixes it (learn-weekly-report).

## What we have today

Checked against ns/phase7 at 8664c00d on 27 Oct.

- A campaign runs 1 to 8 weeks (`MIN_WEEKS` and `MAX_WEEKS` in `src/lib/campaignWizard.ts`) and its bar is `winnersFor(posts)`, one winner per 14 posts (`src/lib/campaigns.ts:248`), with `isWinner` at `:253`.
- When every post is made or skipped, /campaigns/:id shows a Campaign finished section: "Every post is made or skipped. {n} went on your calendar, {first day} to {last day}." with Open calendar and "Plan the next campaign", which opens the wizard with only the audience filled in (`finishedLine` at `src/pages/CampaignPage.tsx:46`, the section at `:203`).
- The pieces a lap report needs exist apart: winners at 2x your usual (`src/lib/winners.ts`), what wins by format, hook and angle (`src/lib/formatWinners.ts`, Analytics' What wins for you), real numbers every 6 hours (learn-real-numbers), and the Monday email's week report (`weekReport` and `weekMoves`, `supabase/functions/notify/logic.ts:598` and `:729`).
- Missing: no campaign is ever scored against its bar, nothing numbers the runs, and the next campaign starts from a blank wizard instead of from what won.

## Build

Gate: `leoOnly` on the campaign page and the wizard, as today; the Monday email's lap block only for `NORTH_STAR_USERS`.

### Screens and states

A lap is one campaign, numbered per audience in the order they started: the brand's first campaign for "Independent advisers" is Lap 1 for that audience, the next one Lap 2.

The Campaign finished section becomes the lap report once the last post's day is 7 days behind (so its numbers have come in):

```
Lap 2 done: Independent advisers                       27 Oct to 23 Nov
Posted 24 of 28   Winners 2 (bar: 2)   Best angle: Fee clarity   Weakest: Market timing
"3 CPF myths" 2.6x your usual   "Why I review policies" 2.1x your usual
[Plan lap 3: same audience, Fee clarity kept, Market timing swapped, 6 versions of each winner]
```

- Waiting for numbers (the last post fewer than 7 days ago): "Lap 2 is out. Its numbers settle on {date}." with today's Open calendar.
- No numbers at all (no connected account, nothing typed): "Lap 2 is out, but none of its posts has numbers. Add them on My posts to score the lap." with "Add numbers".
- Scored: posted against planned, winners against the bar, the best and weakest angle and format by median against your usual, and up to 3 winners with their ratio.
- Plan lap 3 opens the wizard on its review step, filled: the same audience and accounts, the angles that beat your usual kept, the weakest one replaced by a suggested angle, and up to 6 versions of each winner in the first week (remix-variations' sets). Its price line is the wizard's own.
- The Monday email gains one line for a lap that finished that week: "Lap 2 for Independent advisers: 2 winners of 24 posted. Plan lap 3" linking to the wizard.

### Copy

- "Lap {n} done: {audience}", "Posted {p} of {q}", "Winners {w} (bar: {b})", "Best angle: {a}", "Weakest: {a}"
- "Lap {n} is out. Its numbers settle on {date}."
- "Lap {n} is out, but none of its posts has numbers. Add them on My posts to score the lap.", "Add numbers"
- "Plan lap {n+1}"
- Email line "Lap {n} for {audience}: {w} winners of {p} posted. Plan lap {n+1}"

### Data

- Nothing new is stored for the report: it is worked out on each read from the campaign's posts, their drafts' numbers and the brand's medians, like status and cost today.
- `Campaign` gains an optional `lap?: number`, set when a campaign is added (the count of earlier campaigns for that audience plus one), so a deleted campaign does not renumber the rest.
- The wizard's prefill rides in the URL (`/campaigns/new?from=<campaign id>&step=review`); nothing is stored until Add.
- No schema change.

### AI and cost

- No new AI call. Winners and medians are code (`winners.ts`, `formatWinners.ts`); the replacement angle comes from the wizard's existing angle suggestion (cap campaign-angles) when Plan lap 3 is pressed; versions of each winner use remix-variations' existing make, priced on the wizard's line before Add.

### Deep links

- `/campaigns/<id>#lap` scrolls to the lap report.
- `/campaigns/new?from=<id>&step=review` opens the next lap's prefilled review (push). Add both to `docs/deep-links.md`.

## Done when

- [ ] On Leo's sign-in a finished campaign whose last post is a week old shows "Lap {n} done" with posted, winners against the bar and the best and weakest angle, from real numbers.
- [ ] A campaign without numbers says so and links to adding them, instead of scoring zero.
- [ ] Plan lap 3 opens a review with the audience, the winning angles and versions of each winner already in, and its price.
- [ ] A finished lap appears once in that week's Monday email on Leo's sign-in, and nowhere for other sign-ins.
- [ ] Deleting an earlier campaign does not change a later lap's number.
- [ ] `npm run build`, the full `npx vitest run`, and a look at 390 px and 1440 px pass.
- [ ] The item in `src/data/northStar.ts` flipped with its `ours` line in the same commit.

## Tests

- `src/lib/laps.test.ts`: lap numbering per audience and its survival after a delete; the waiting, no-numbers and scored states by date; best and weakest angle by median; the prefill keeps winning angles and drops the weakest.
- `supabase/functions/notify/logic.test.ts`: the lap line appears only in the week the lap finished and only for a listed account.
- Break each case once to prove it bites.

## Open questions

- Is a lap the campaign, whatever its length, or a fixed four weeks so brands that never plan a campaign get laps too? This spec takes the campaign, because the campaign already holds the bar and the angles. Leo decides.
- Fastlane judges ads on thumbstop, hold rate, CPA and ROAS. For an adviser's organic posts this spec judges engagement against your usual, the measure Winner found uses; should saves and shares weigh more (learn-post-grade asks the same)?
- Should Plan lap 3 also add the lap's breakout posts to the link in bio and an evergreen repost (publish-breakout-push), or keep the lap to the next campaign?

## Related

plan-campaign, plan-campaign-page, remix-own-winners, remix-variations, learn-format-winners, learn-real-numbers, learn-weekly-report, publish-breakout-push, plan-proven-mix
