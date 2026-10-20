# Workspaces, members and seats

`trust-workspaces` | trust | phase 8 | status: partial | /north-star#trust-workspaces

## Leo asked

8 Oct 2026: "an all in one tool for my social media management, and for each person too"

## How the best do it

Fastlane puts the workspace at the top of the sidebar: a switcher box reading "Activity Tracker" with a "v" chevron (never clicked in the recording). At the bottom, the account card repeats the workspace name with "142 credits", and the header meta line reads "Mon 19 Oct | Activity Tracker | 142 credits | Starter", so the workspace, its balance and its plan travel together.

![Fastlane 0:04, workspace switcher top left, workspace card bottom left](../../../public/north-star/fastlane/t004.webp)

Settings groups three of its tiles under "WORKSPACE AND PLAN": "Workspaces" / "Switch, rename or add a workspace.", "Members" / "Who works in this workspace with you." and "Plan and spend" / "Your plan, credits, storage and invoices.", next to "Activity" / "Everything that ran, and who ran it." None of the pages was opened in the recording. The plan limits are 1 workspace on Starter, 3 on Growth and 10 on Pro, with 1, 5 and 20 campaigns. ([pricing](https://usefastlane.ai/pricing), [home](https://usefastlane.ai))

![Fastlane 5:46, Settings: Workspaces, Members, Plan and spend](../../../public/north-star/fastlane/t346.webp)

Others, closest to an adviser team first:

- Cloud Campaign gives each agent, office or carrier-affiliated agency its own workspace with its own accounts, calendar and reports, tags workspaces by carrier or line of business, and copies posts across workspaces with bulk approval requests. Team is USD 199/mo for 5 workspaces. ([insurance agencies](https://www.cloudcampaign.com/solutions/insurance-marketing-agencies))
- Sandcastles: 1, 3, 5 or 20 workspaces by plan, each with its own watchlist and persona. Guests (Titan plan) are read-only: they read analysis and copy transcripts but cannot analyse, script or export. ([plans](https://help.sandcastles.ai/plans), [video detail](https://help.sandcastles.ai/video-detail))
- AuthoredUp Business has "Organization & roles (Admin / Manager / Member)" with separate drafts, analytics and settings per profile; managers and ghostwriters are free and only extension users pay, minimum 3 profiles. ([pricing](https://authoredup.com/pricing))
- Klap: workspaces per client with admin, editor and viewer roles, an activity log of who clipped what, and review links for stakeholders; seat counts unverified. ([tool](https://klap.app/tools/ai-video-clipping-tool), [pricing](https://klap.app/pricing))
- OpusClip: the owner creates a team and shares an invite link; members spend the owner's credits and share brand templates and connected accounts. Last save wins on concurrent edits, and roles are "coming soon". ([team management](https://help.opus.pro/docs/article/6219255-team-management.md))
- Publer: unlimited workspaces and extra members on Professional, roles and approvals on Business, every 10th member free. ([help](https://publer.com/help/en/article/what-is-included-in-publer-business-1c57hsq.md))
- ContentStudio: a workspace per client with its own accounts, schedule, media, members and time zone; "EasyConnect" lets a client connect their own accounts by invitation without sharing passwords. ([client management](https://contentstudio.io/client-management))
- BigSpy Scale: 5 seats, each with its own quotas, so one heavy user does not starve the team; USD 399/mo. ([pricing](https://bigspy.com/pricing))
- Broadridge Advisor (AdvisorStream, Forefield heritage): delegate access, so an assistant runs the adviser's account. ([osaic](https://advisorstream.com/info/osaic))
- Apaya scopes who sees what by brand, office, region or role. Sign-in is Google, or SAML and Okta on enterprise plans. ([financial services](https://apaya.com/enterprise/industry/financial-services-social-media-management))

## What we have today

Three separate pieces, none of them a shared workspace:

1. Brands on one account. `src/lib/profiles.ts` and `src/components/ProfileSwitcher.tsx` (label "Profile") let one person run several brands: switch, rename, "Add a brand" (/brands/new, from a website), remove (which disconnects the brand's Zernio accounts first). Each brand's data keys on `scoped(userId)`, and `?profile=<id>` opens a brand from any link. There is no limit on the number of brands. All of it lives in `cs_user_data`, whose only policy is `user_id = auth.uid()` (`supabase/hub/004_user_data_sync.sql`), so no second person can open it.
2. Team review (/team, `src/lib/teamReview.ts`, SQL 011, 013, 014). `cs_teams` with `cs_team_members` (role `leader` or `member`, one team per person), an invite code (/team?code=), submissions, approve / changes / reject, comments with @mentions, an append-only audit trail with CSV export, and the "needs approval before posting" rule. A leader sees only what a member submits, never their drafts, calendar or brand kit.
3. Leo's posts board team (/reels/team, /join#token, `cs_board_members` in SQL 022 and `cs_board_invites` in 023, `supabase/functions/team-board`, docs/team-roles.md). Leo makes an invite link with a role (viewer, commenter, editor, approver) and up to 20 board brands; links end after 7 days (`INVITE_DAYS`), an approver link works once and the others any number of times (`maxUsesFor`). The function trusts the user id, never the email, and only `TEAM_OWNER_IDS` may manage the team. The `modules` column is checked to `{reels}` only. It covers the MoneyBees board in another project (the moneybees-reels studio API), not Content Studio's own posts. The client calls live in `src/lib/reelsBoard.ts` (`listTeam`, `createLink`, `linkOff`, `updateMember`).

Missing: a page that shows who can reach a brand, a second person working inside a brand (its posts, calendar and kit), seats and workspace limits. AI caps are per person per day (`usageCaps.ts`); there are no plans or credits.

## Build

Gate: everything here shows only when `leoOnly(email)`. Two steps. Step 1 has no schema change and can be built now. Step 2 needs a migration and new edge function, so it stops for Leo before any code is written.

### Screens and states

Step 1, new page `/workspaces` (`src/pages/WorkspacesPage.tsx`), in the playbook section after "Social accounts" with `owners: LEO_EMAILS`; the page itself renders NotFoundPage for anyone else. ProfileSwitcher gains a last row "Manage workspaces" linking to it, for Leo only.

```
Workspaces                                        [ Add a workspace ]
 M   Me             42 posts   6 scheduled          Open   Rename
 MB  MoneyBees      18 posts   2 scheduled          Open   Rename   Remove
 F   FINternship     5 posts   0 scheduled          Open   Rename   Remove

Who can reach your work                                       (i)
 Team review    Leo's agency, you lead it, 4 people       Open Team review
 Posts board    Mei (approver: MoneyBees), Raj (viewer)    Manage
 Preview links  2 live links: MoneyBees                    Open My posts
 Claude         1 link on: Me                              Open Connect Claude
```

- Workspace rows reuse ProfileSwitcher's own handlers (`switchTo`, rename, and `removeProfile` with its existing confirm and partial-removal toast). The counts are worked out on this device from `draftsOfBrand(userId, profileId)` and `draftStatus` without any network call, and the open brand shows a check mark in place of "Open".
- "Add a workspace" goes to `/brands/new`.
- Access rows load in parallel, and each fails on its own:
  - Team review: `fetchMyTeam(userId)`; leaders also `fetchRoster(teamId)` for the count. Not in a team: "No team. Start one or join one on Team review."
  - Posts board: `listTeam()` from `src/lib/reelsBoard.ts` (team-board `team.list`), which returns members and invite links. The row lists members whose `status` is "joined" and counts live links. Shown only when it answers (the owner); a 403 or any other error hides the row.
  - Preview links: `fetchMyPreviewLinks()`, live ones (`isLinkLive`) grouped by the brand whose drafts hold their `draft_id` (`draftsOfBrand` per brand; `cs_preview_links` has no brand column).
  - Claude: `loadLinks(userId)` in `src/lib/claudeConnect.ts` reads only the open brand (it keys on `scoped(userId)`). Give it an optional `profileId` argument, built like `draftsOfBrand`, and call it once per brand. Revoked links are already skipped.
- Loading: four grey skeleton rows under "Who can reach your work".
- A row that fails: "Couldn't load this. Try again." with a "Try again" button for that row only.
- Nobody else: "Only you can reach your work." in place of the four rows.

Step 2, after Leo approves migration 025 (Open questions):

- Each workspace row gains "Invite". The panel asks for the person's name (60 characters) and a role, then shows a one-person link to copy, `/workspaces/join#<token>`, which ends after 7 days.
- Roles, same names as the posts board so Leo learns one set:
  - viewer: reads the workspace's posts, calendar and brand kit;
  - commenter: also comments (trust-comments-versions);
  - editor: also writes and edits posts that are not approved or scheduled;
  - approver: also approves and schedules dates.
- Only the owner posts through Post it for me in v1: the `social` function scopes every call to the caller's own Zernio profile (rule M2 in docs/zernio-connection.md), and letting a member post to the owner's accounts is an auth change.
- The member's ProfileSwitcher lists the shared workspace under "Shared with you" as "{brand} ({owner label})". Opening it puts Write, My posts and Calendar on that workspace's posts.
- The owner's row lists each member with role, "Last seen {date}", "Change role" and "Remove". Remove sets `revoked_at` and takes effect on the member's next request.
- Joining: `/workspaces/join#<token>` signs the person in if needed, then shows "You're in {owner label}'s {brand} as {role}." with "Open it". Used, expired or turned off: "This invite has ended. Ask for a new one."
- Two people saving the same post: the second save gets 409 and "Someone else just changed this post. Reload and try again.", the posts board's own wording (docs/team-roles.md, line 63), and the typed text stays in the box.

### Copy

Step 1:
- h1 "Workspaces"; button "Add a workspace"; row buttons "Open", "Rename", "Remove"
- Counts: "{n} post" / "{n} posts", "{n} scheduled"
- h2 "Who can reach your work"; InfoTip "Everyone and everything that can read your posts today."
- Row titles: "Team review", "Posts board", "Preview links", "Claude"
- Row lines: "{team}, you lead it, {n} people" / "{team}, you're a member"; "{label} ({role}: {brands})", then "{n} invite link open" / "{n} invite links open" when any are live; "{n} live link: {brand}" / "{n} live links: {brands}"; "{n} link on: {brand}"
- Row links: "Open Team review", "Manage", "Open My posts", "Open Connect Claude"
- "No team. Start one or join one on Team review."
- "Couldn't load this. Try again." / "Try again"
- "Only you can reach your work."
- ProfileSwitcher: "Manage workspaces"

Step 2:
- "Invite"; panel h2 "Invite someone to {brand}"; fields "Their name", "What they can do"; role labels "Viewer", "Commenter", "Editor", "Approver"
- Role hints: "Reads posts, calendar and brand kit." / "Also leaves comments." / "Also writes and edits drafts." / "Also approves and sets dates."
- "Make the link"; "Link copied"; "Works for one person, for 7 days."
- Member row: "Last seen {d MMM}", "Change role", "Remove"; confirm "Remove {name} from {brand}? They lose access straight away."
- Switcher group: "Shared with you"
- Join: "You're in {owner}'s {brand} as {role}." / "Open it" / "This invite has ended. Ask for a new one."
- Conflict: "Someone else just changed this post. Reload and try again."
- Member Post it for me slot: "Only {owner} can post from this workspace."

### Data

Step 1: reads only. No new keys. Counts come from the drafts store; access rows from existing tables and functions.

Step 2 (a schema change, so Leo approves it first, after an independent migration review):
- `supabase/hub/025_workspace_members.sql`:
  - `cs_workspace_members` (id uuid, owner_id, profile_id text matching `isProfileId` in `supabase/functions/_shared/zernio.ts`, `^[a-z0-9]{1,40}$`, label 1-60, member_id null until claimed, role in viewer/commenter/editor/approver, token_hash, created_at, expires_at, claimed_at, revoked_at, last_seen_at). RLS on with no client policies, grants revoked, as `cs_board_members`. Rows are never deleted; removal sets `revoked_at`.
  - `cs_workspace_posts` (owner_id, profile_id, draft_id, entry jsonb as `DraftEntry`, version int, updated_at, updated_by uuid, updated_by_name text; primary key (owner_id, profile_id, draft_id)). A shared workspace's posts live here, one row per post, so two people never overwrite each other's whole list the way the synced drafts key would.
- New edge function `supabase/functions/workspace`: actions `invite`, `claim`, `list`, `revoke`, `role`, `posts.list`, `posts.save` (conditional on `version`, 409 on a mismatch; the posts board re-reads and re-checks up to 3 times before its 409, per docs/team-roles.md line 63, and this function does the same), `kit.get` (reads the owner's `content-studio-carousel-brand-<owner>~<pid>` row, or `content-studio-carousel-brand-<owner>` for the default brand "me", and the voice rows, from `cs_user_data` with the service role, read-only for members). It trusts the JWT user id only, never the email (docs/team-roles.md).
- `src/lib/draftHistory.ts`: `draftsOfBrand` and `upsertDraft` read and write through the function when the open workspace is shared, with a device cache under `cs-workspace-posts-<memberRowId>`. Sharing a brand moves its existing drafts into `cs_workspace_posts` once, and the owner's synced key keeps a pointer (`content-studio-sharedbrand-<scoped>` = `{ sharedAt }`).
- There are no seats or workspace limits in this build, because plans and Stripe wait for Leo (business-plans).

### AI and cost

- No AI call and no Jev question in either step. Nothing here classifies or scores.
- Caps: a member's AI use counts on the member's own daily caps (`cs_ai_usage` is per user), so sharing a workspace adds no spend to the owner and needs no new cap name.
- Cost: Step 1 adds no paid call. Step 2 adds Supabase reads and writes only.

### Deep links

- `/workspaces`, with `#access` for "Who can reach your work" (useScrollToHash).
- Step 2: `/workspaces?invite=<profile id>` opens that workspace's invite panel (push); `/workspaces/join#<token>` is the invite (token in the hash so it never reaches a server log).
- Builders in `src/lib/links.ts`; rows in docs/deep-links.md (the /workspaces row, and `#access`); `/workspaces/join` goes in `EXCEPTIONS` in `src/lib/navRoutes.test.ts` with the reason "invite link, opened from outside".

## Done when

- [ ] On Leo's sign-in, Playbook shows "Workspaces" and ProfileSwitcher shows "Manage workspaces"; for other emails both are hidden and a typed `/workspaces` shows the 404 page.
- [ ] `/workspaces` lists every brand with its post and scheduled counts; Open, Rename, Remove and "Add a workspace" behave as the switcher's own.
- [ ] "Who can reach your work" shows Leo's team, his posts-board members with roles and brands, live preview links per brand and live Claude links per brand; with the network off, each row fails alone with "Try again".
- [ ] `npm run build`, the full `npx vitest run` (nav.test.ts, navRoutes.test.ts and jumpTo.test.ts green), and a by-eye check at 390 px and 1440 px pass.
- [ ] `src/data/northStar.ts` item `trust-workspaces` keeps status partial with its `ours` line updated for Step 1, in the same commit.
- [ ] Step 2, only after Leo's yes: an invited editor opens MoneyBees from "Shared with you", edits a draft, and Leo sees the edit after a reload; two tabs saving the same post get the 409 line; removing the member ends their access on the next request; after that the item flips to live.

## Tests

- `src/lib/workspaces.test.ts` (new, pure helpers): `brandCounts(drafts)` counts posts and scheduled per brand; `accessRows(...)` turns the four sources into rows and gives "Only you can reach your work." when all are empty; preview links group by the brand that holds their draft.
- `src/lib/claudeConnect.test.ts`: `loadLinks(userId, profileId)` returns that brand's live links only, and with no `profileId` it still reads the open brand as today.
- `src/lib/nav.test.ts`: `/workspaces` maps to one page and stays out of the More sheet for "someone@example.com".
- `src/lib/navRoutes.test.ts`: the new route is a nav page (and, in Step 2, `/workspaces/join` is an exception with its reason).
- Step 2: `supabase/hub/025_workspace_members.test.sql` in the style of `023_board_invites.test.sql` (no client can read or write either table; a revoked row stays); `supabase/functions/workspace/logic.test.ts` for role checks per action, the version conflict, an expired or reused token, and a member asking for another owner's brand.
- Prove each case bites by breaking the code once.

## Open questions

- Leo: approve migration 025 and the `workspace` function (schema and a new access path to his data). Until then only Step 1 ships.
- Leo: should members be allowed to post to the owner's connected accounts? That changes the `social` function's caller scoping, an auth change.
- Leo: seats and workspace limits per plan (Fastlane: 1, 3, 10). They wait for business-plans and Stripe.
- Whether Team review's one-team-per-person rule should turn into "a leader's team is a workspace's members". Folding the three member lists into one model would be a later change of its own.
- Leo: whether the switcher's "Profile" label should read "Workspace" for everyone; this spec leaves the label as it is.

## Related

trust-approval, trust-comments-versions, trust-team-push, agent-activity, business-plans, business-credits, learn-team-analytics, publish-accounts, brand-from-website
