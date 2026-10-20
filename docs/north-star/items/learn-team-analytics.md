# Team results for leaders

`learn-team-analytics` | learn | phase 8 | status: missing | /north-star#learn-team-analytics

## Leo asked

8 Oct 2026: "an all in one tool for my social media management, and for each person too"

## How the best do it

Fastlane has workspaces per plan (Starter 1, Growth 3, Pro 10) but shows no results across people in Leo's recording or its public captures ([pricing](https://usefastlane.ai/pricing)).

- Seismic Social (formerly LiveSocial) tracks adoption, publishing activity, content performance and audience engagement across a firm's people, and quotes IBM at a 2x click-to-share ratio and Oracle at 34,000+ shares ([product](https://www.seismic.com/products/livesocial/)).
- Supergrow's Teams plan (US$199 a month, 5 accounts) has an "Organisation dashboard", per-member and team-wide weekly reports, and "Challenges & leaderboard" with streaks and ranks to drive adoption ([pricing](https://www.supergrow.ai/pricing)).
- AuthoredUp Business keeps drafts, analytics and settings per profile with team analytics on top, needs at least 3 profiles, and lists "Leaderboard" as coming soon ([pricing](https://authoredup.com/pricing)).
- Lately AI offers parent-child dashboards across regions, brands, products and employees, aimed at financial services agents and brokers ([industry page](https://www.lately.ai/industries/compliant-social-media-content-for-financial-services-agents-advisers-brokers)).
- Hearsay Social (Yext) reports benchmark performance, audience insights and program ROI for a firm's advisers ([product](https://www.yext.com/platform/hearsay-social)).
- Apaya shows analytics by post, campaign, branch, brand and channel, with access scoped by brand, office, region or role. Team collaboration starts on its Blaze plan at US$129 a month; which plan holds branch analytics is unverified ([financial services](https://apaya.com/enterprise/industry/financial-services-social-media-management), [pricing](https://apaya.com/pricing)).
- Cloud Campaign gives each agent or office its own workspace (Team plan US$199 a month, 5 workspaces) and reports "category-level performance by office" ([insurance agencies](https://www.cloudcampaign.com/solutions/insurance-marketing-agencies)).
- Vista Social lists a team performance report beside its profile, post and competitor reports ([analytics](https://vistasocial.com/social-media-analytics/)).

## What we have today

- Team review on `/team` (`src/pages/TeamPage.tsx`, `src/components/team/LeaderView.tsx`, `src/lib/teamReview.ts`): a team (`cs_teams`), its members with leader or member role (`cs_team_members`, one team per person), submissions with status (`cs_review_submissions`) and an append-only audit trail (`cs_review_events`) that leaders can export as CSV. RLS lets a leader read the team's submissions and events.
- A leader sees the roster, the review queue and the audit trail. Nothing counts posts or results per adviser.
- RLS already lets a leader read the team's `cs_review_submissions` (policy `cs_review_submissions_read`, SQL 011), so submitted and approved counts need no new access.
- Each adviser's posts and numbers live in their own synced rows (`cs_user_data`, key `content-studio-drafts-<uid>`), readable only by that adviser under RLS. `notify` already reads these rows with the service key to build each adviser's own Monday email (`profilesFrom` in `supabase/functions/notify/logic.ts`). Its private `postsFrom` keeps the newest 200 drafts and uses a post's Zernio numbers in place of its typed ones when it has them; it never adds the two.
- Leaders cannot push content to their team yet. `trust-team-push` (not built) records each adviser who adds a pushed post in a new `cs_team_push_targets` table (status `added`, with `draft_id`), readable by the team's leaders under its own RLS. Until it ships, "used pushed content" has nothing to count.

Status missing: leaders see who submitted what for review, and no results.

## Build

Stop for Leo before step 2: a leader reading other advisers' synced rows is a new cross-account read through the service key. The plan below asks each adviser for consent and checks the leader role on the server, and Leo still says yes first.

### Screens and states

1. The consent switch. In `src/components/team/MemberView.tsx`, a switch "Share my posting numbers with {team name}'s leaders", off by default, with an InfoTip. It writes `content-studio-teamshare-<uid>` = `{ share: boolean, teamId: string, at: string }`. Turning it off writes `share: false`; the row is never deleted. While this is Leo-only, the switch shows on Leo's two sign-ins only, so he tests with one account as leader and the other as member. `TeamPage.tsx` already calls `getUser()` but keeps only `{ id, name }` in its `Viewer`; add `email` there and pass it to `LeaderView` and `MemberView` for the `leoOnly` check.

2. The function. New edge function `supabase/functions/team-results/` (`index.ts`, `logic.ts`, `logic.test.ts`), JWT on. Body `{ from: "YYYY-MM-DD", to: "YYYY-MM-DD" }`, at most 92 days. It:
   - answers 403 `{ code: "not_allowed" }` unless `isAllowed(Deno.env.get("NORTH_STAR_USERS"), uid)` (helper in `supabase/functions/market/logic.ts`). `NORTH_STAR_USERS` is a new secret holding Leo's two uids; set it if `find-competitors` has not;
   - finds the caller's team where `role = 'leader'`, else 403 "Only a team leader can see team results.";
   - counts `team-results` against the daily cap;
   - lists the team's members, reads each `content-studio-teamshare-<uid>` row, and only for members with `share: true` and the same `teamId` reads `content-studio-drafts-<uid>` (the default brand), parsed with `profilesFrom(uid, rows)[0].posts`;
   - counts submissions (by `submitted_at`) and approvals (by `reviewed_at`, status `approved`) per member from `cs_review_submissions` in the range, filtered on the leader's `team_id`;
   - returns per member `{ userId, name, sharing, posted, withNumbers, impressions, engagements, rate, submitted, approved }` and team totals, with no post text in the reply.

   `logic.ts` counts the way the Monday email does: export `engagementOf`, `impressionsOf` and `hasNumbers` from `notify/logic.ts` (private today) and import them, and count a post as posted by `status === "posted"` and `postedDayOf(postedAt)` inside the range. Edge functions stop at 2 s of CPU (see `BUDGET_MS` in `notify/run.ts`); time one call on a team of Leo's two accounts and note the parse time per member here before turning it on for a larger team.

   Team posts used: once `cs_team_push_targets` exists, the function also counts each member's `added` rows with `responded_at` in the range (`teamPostsUsed`), and for sharing members sums the engagements of those `draft_id`s (`teamPostEngagements`). Until that table exists both fields, the column and the total are left out, so nobody reads a 0 as "used none". `trust-team-push`'s `cs_use_pushed_item` also writes an approved `cs_review_submissions` row for every added post; leave out submissions whose id is a `cs_team_push_targets.submission_id`, so a pushed post counts once, under Team posts, and never inflates Submitted or Approved.

3. The card. In `LeaderView.tsx`, above the roster, a "Team results" card (`id="results"`, `scroll-mt-20`), shown when `leoOnly(email)`:

   ```
   Team results                    [ 7 days ][ 30 days ][ 90 days ]   Download CSV
   7 of 9 advisers posted or submitted a post (78%) (i)
   41 posts   2,310 engagements

   Adviser       Posted  Engagements  Rate   Submitted  Approved
   Jasmine Tan   9       812          3.1%   9          8
   Wei Ling      -       -            -      4          4
   Not sharing numbers: Wei Ling, Mark Lee
   ```

   Sorted by posted, then submitted. Below 640 px each adviser becomes a stacked card with the same figures. A dash means not shared. Rate is engagements over impressions, shown only when the member has impressions. "Download CSV" builds the file in the browser from the reply already on screen. Once `trust-team-push` ships, a "Team posts" column and a "{n} team posts used" total join the card.

States:
- Not a leader: no card (the page's own member and no-team views are unchanged).
- No members: "Invite advisers with your team code to see their results here."
- Loading: three skeleton rows under the header, drawn within 400 ms.
- Done: the card above.
- Nobody sharing: totals come from submissions only; a line reads "No adviser shares their posting numbers yet. Each can switch it on in Team review."
- Failed: "Couldn't load team results. Try again." with "Try again".
- Over the daily cap (429): "You've loaded team results 30 times today. It resets at 8am Singapore time."
- Refused: other sign-ins see no card and no switch; the function answers 403.

### Copy

- Card title: "Team results"
- Period chips: "7 days", "30 days", "90 days"
- Adoption line: "{n} of {m} advisers posted or submitted a post ({pct}%)"
- InfoTip on it: "Counts advisers with a post marked posted or a post sent for review."
- Totals: "{n} posts", "{n} engagements"; after `trust-team-push` ships, "{n} team posts used"
- Column heads: "Adviser", "Posted", "Engagements", "Rate", "Submitted", "Approved"; after `trust-team-push` ships, "Team posts"
- "Not sharing numbers: {names}"
- Member switch: "Share my posting numbers with {team}'s leaders"; InfoTip: "Leaders see your post counts and results, never your drafts."
- Button: "Download CSV"; file `team-results-<from>-to-<to>.csv`
- Empty, failure and refusal lines exactly as in the states above

### Data

- `content-studio-teamshare-<uid>` (account-wide, bare uid), synced: `{ share, teamId, at }`. An explicit `false` row, never a deletion.
- The leader's period choice is in the URL only.
- This build needs no schema change; offices would (see Open questions).
- CSV columns, built with `buildCsv` from `src/lib/teamReview.ts`: Adviser, Sharing, Posted, With numbers, Impressions, Engagements, Engagement rate %, Submitted, Approved. "Team posts used" and "Engagements on team posts" are added once `trust-team-push` ships.

### AI and cost

- No AI: every figure is a count or a sum.
- New cap in `usageCaps.ts`: `"team-results": 30`, to keep database reads in check. One call reads 2 rows per member; a team of 30 is 60 small reads.

### Deep links

- `/team?period=7d#results` opens the card on that period (`period`: 7d, 30d, 90d; default 30d; replace). `TeamPage` calls `useScrollToHash(status === "ready")` so the hash lands once the card is drawn. Add the row to `docs/deep-links.md` and `period` to `links.team` in `src/lib/links.ts`. `period` sits beside the audit trail's own `from` and `to`, which it does not change.

## Done when

- [ ] Leo's second sign-in, as a member with sharing on, shows up on the first sign-in's card. For posts away from the window's edges, its Engagements equal that account's Analytics total for the same `?period=` and its With numbers equals Analytics' post count; Posted also counts posts marked posted with no numbers, which Analytics leaves out.
- [ ] Turning sharing off shows dashes for that member at the next load, and the synced row holds `share: false`.
- [ ] A member who never switched sharing on still shows submitted and approved counts.
- [ ] A member of another team never appears, even with sharing on (the `teamId` check).
- [ ] A non-leader calling `team-results` gets 403, and the 31st call in a day gets 429.
- [ ] The CSV opens with the columns above.
- [ ] Checked by eye at 390 px and 1440 px.
- [ ] `src/data/northStar.ts` item flipped (status and `ours`) in the same commit, and this spec's status line ticked.

## Tests

- `supabase/functions/team-results/logic.test.ts`: `memberResults(posts, subs, from, to)` counts only posts marked posted inside the range (Singapore days), takes Zernio numbers in place of typed ones when a post has both, and computes the rate only with impressions.
- Same file: `canRead(shareRow, teamId)` is true only for `share: true` with the same team id, and false for a missing, malformed or other-team row.
- Same file: `adoption(members)` counts posted or submitted, and treats a non-sharing member with no submissions as not active.
- Same file: `subCounts(subs, from, to, pushed)` counts submitted by `submitted_at` and approved by `reviewed_at`, ignores rows from another team and leaves out ids in `pushed` (the push targets' `submission_id`s; empty until `trust-team-push` ships).
- `supabase/functions/_shared/usageCaps.test.ts`: `team-results` is 30.

## Open questions

- Leo's yes is needed for the cross-account read in step 2, even with consent.
- Offices and regions need a field on `cs_team_members` or a new table, which is a schema change; Leo decides whether agencies need it in the first version.
- Counting only the default brand makes an adviser who posts mostly from another brand profile look quiet; reading every profile is a small change in `team-results` if Leo wants it.
- A leaderboard with ranks (Supergrow) is left out; adviser teams may read ranks as pressure. Leo decides.

## Related

trust-team-push, trust-workspaces, trust-approval, remix-source-trail, learn-reports-export, learn-real-numbers, learn-weekly-report
