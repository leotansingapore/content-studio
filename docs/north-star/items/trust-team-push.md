# Leaders push content to their team

`trust-team-push` | trust | phase 8 | status: partial | /north-star#trust-team-push

## Leo asked

8 Oct 2026: "an all in one tool for my social media management, and for each person too". This item reads "each person" as each adviser on a leader's team: a post the leader approved should land with every one of them, ready to use in their own name. That reading is the spec's, not Leo's words.

## How the best do it

Fastlane has workspaces and members but no way to send a post to them. The sidebar has a workspace switcher at the top left ("Activity Tracker") that Leo never opened (t000), and Settings lists "Workspaces" ("Switch, rename or add a workspace.") and "Members" ("Who works in this workspace with you."), neither opened (t346). Nothing in the recording sends a post to another person, locks parts of it or counts who used it.

![Fastlane 0:00](../../../public/north-star/fastlane/t000.webp)

![Fastlane 5:46](../../../public/north-star/fastlane/t346.webp)

The adviser and advocacy tools:

- Snappy Kraken Enterprise Hub: "Mass create and publish for all your advisors". The home office sends campaigns, research and commentary to any subset by hierarchy, cohort or office group. Firm templates and branding rules come with it, and the firm decides which elements advisers may change. It adds pre-approval, review, archiving, a log of every action, an adoption pipeline, and reports by person, cohort, campaign and channel. Pricing goes by adviser count: an extra adviser workspace is USD 99 (Grow) or 699 (Freedom360), and admin seats USD 99 a month. ([enterprise](https://snappykraken.com/enterprise), [pricing](https://snappykraken.com/pricing))
- Hearsay Social (Yext) Dynamic Campaigns: home office campaigns post approved content to the field team's own channels automatically, after each agent opts in once, with the notice "Dynamic Campaigns: Your post was just successfully shared". ([datasheet](https://info.yext.com/rs/906-IBA-353/images/Hearsay_Social_Datasheet_2022.pdf))
- Supergrow Teams: "Push content to all team workspaces", "Publish on behalf of team members", a content calendar across all members, role-based permissions, and "Challenges & leaderboard" with streaks and ranks. Teams is USD 199 a month for 5 accounts. ([pricing](https://www.supergrow.ai/pricing), [site](https://www.supergrow.ai/))
- Employee advocacy add-ons share approved brand content through staff: Sprout Social (an add-on from Standard), Vista Social (free to try, then USD 199 a month for 25 employees) and Hootsuite Parliament, formerly Amplify, on Enterprise. ([Sprout](https://sproutsocial.com/pricing/), [Vista](https://vistasocial.com/pricing/), [Hootsuite](https://www.hootsuite.com/plans))
- Lately AI lets employees pick pre-approved content and publish to their own channels, with On-Behalf-Of publishing for executives and sales staff. ([financial services](https://www.lately.ai/industries/compliant-social-media-content-for-financial-services-agents-advisers-brokers))
- Denim Social runs compliant organic publishing programmes that agencies build for their agents; pricing is not listed. ([TechCompare](https://techcompare.independentagent.com/organization/denim-social))

What to copy: the leader picks who gets a post and which parts each adviser may change, the adviser adds it to their calendar in one tap without a review, and the leader sees who used it.

## What we have today

Checked against origin/main 08537d1.

- Leo already pushes posts to his people, outside the app. Jobs (`~/.local/bin/team-posts`) write GAC and ActivityTracker posts into `content-studio-teamposts-<uid>`; Leo approves them in the calendar (`src/components/TeamPostReview.tsx`, `src/lib/teamPosts.ts`) and they go to his Telegram group. Nobody gets them in their own Content Studio, and nothing records who used them.
- Teams exist: `/team` with leader and member roles, one team per person, an invite code, a roster (`cs_team_members`, SQL 011) and a rule per member (SQL 014).
- Leo's posts board team (`/reels/team`, `team-board`, `docs/team-roles.md`) lets people join his board with roles per brand. It shares his board with them; it sends nothing into their accounts.
- Phone alerts and the Monday email run hourly from `notify` for advisers who turned them on (`supabase/functions/notify`, SQL 016, web push plus Resend). Each alert is claimed in `cs_notify_sent (user_id, item)`, which a nightly job prunes after 90 days. The Pipeline badge counts what waits on the user (`countNeedsYou` in `src/lib/needsYou.ts`), recounted synchronously from local keys in `src/pages/StudioLayout.tsx`.
- Missing: a leader sending a post into members' studios, field locks, a member's inbox, and a count of who used each post.

## Build

This needs shared tables, so it stops for Leo before the migration runs. Build it after trust-approved-library (a push sends a library item) and after trust-approval phase A. Gate the entry points with `leoOnly(email)`; Leo tests with his two sign-ins as leader and member of one team.

The mechanism reuses the library's: adding a pushed post records an approved submission for its exact text, so the team rule, the server approval check and the record all treat it as approved. Changes inside an unlocked part are allowed by the server's lock check; any other change is an ordinary edit that goes to review.

### Screens and states

Leader, on a `/team/library` card (trust-approved-library; publish-library owns `/library`): `Send to team` opens a dialog.

```
Send to your team
 Who          (o) Everyone (12)   ( ) Pick people
 They can change
              (o) Nothing   ( ) The opening line   ( ) A line at the end
 Post on      [ Fri 24 Oct  v ]  (optional)
 Note         [ For the CPF changes next month   ]  0/280
                                        [Cancel]  [Send to 12 people]
```

- `Pick people` shows the roster with checkboxes, leaders and the sender left out.
- The main button counts who gets it and is disabled at zero: `Pick at least one person.`
- Sending: `Sending...` within 400 ms. Done: the dialog closes with toast `Sent to <n> people.`
- Failed: `Couldn't send it. Try again.`, with every choice kept.
- Refusals: `You've sent 20 posts to your team today. More tomorrow.`, `This post was retired.`

Leader, on `/team`, a card `Sent to your team` (anchor `sent-to-team`) under the review queue, newest first:

```
Sent to your team
 3 questions before you buy...      sent Tue 21 Oct   Sent 12  Added 8  Skipped 1  Posted 5   [See who]
```

- `See who` opens a drawer (`?push=<id>`) listing each person with a chip (`Waiting`, `Added`, `Posted`, `Skipped`) and the date. For added posts it shows the opening line or end line they wrote, under `Their change`.
- `Posted` comes from the post record (trust-archive). Until that ships, the count and chip are hidden.
- Empty: `Nothing sent yet. Send a post from the Team library.` with `Open Team library`.

Member, on `/home`, a card `From your leader` (anchor `from-your-leader`) at the top while anything waits. It holds one block per push:

```
From your leader                                   2 waiting
 Mei Lin | For the CPF changes next month
 +--------------------------------------+
 | 3 questions before you buy...         |
 | <first 4 lines>                       |
 +--------------------------------------+
 Your opening line [ 3 questions I ask before anyone buys... ]   (only when allowed)
 Post on Fri 24 Oct, 10:00
 [Add to my calendar]  [Skip]
```

- With `The opening line` allowed, an input prefilled with the post's first line (150 characters). With `A line at the end`, an optional box `Your line at the end` (200 characters). As the changed line is typed, the MAS check (trust-compliance-check) runs on it after an 800 ms pause, and a team Block rule disables `Add to my calendar` with its reason.
- `Add to my calendar` makes a draft scheduled at the push's day, at the brand's first posting slot that day (`src/lib/postingSlots.ts`, else 10:00). With no day set it takes the next open slot from tomorrow. It then calls the server, which records the approval. While running the button reads `Adding...`.
  - Done: the block becomes `On your calendar for <Dow D Mon>, <time>. Already approved.` with `Open` (the draft in My posts).
  - Refused: the server's reason, and the draft is removed again.
- `Skip` marks it skipped, with toast `Skipped. Undo`.
- The Pipeline badge adds waiting pushes, so the count shows on every page. `countNeedsYou` reads local keys synchronously, so StudioLayout fetches the waiting count once on load and on window focus (one RLS read) and adds it.
- Phone alert: in its hourly run, `notify` sends one alert per new push to members with alerts on: title `<leader> sent you a post`, body `<title>. Add it to your calendar in the studio.`, link `/home#from-your-leader`.
- Not in a team, or nothing waiting: no card.

### Copy

- Leader dialog: title `Send to your team`; labels `Who`, `They can change`, `Post on`, `Note`; options `Everyone (<n>)`, `Pick people`, `Nothing`, `The opening line`, `A line at the end`; placeholder `For the CPF changes next month`; buttons `Cancel`, `Send to <n> people`, `Sending...`; lines `Pick at least one person.`, `Sent to <n> people.`, `Couldn't send it. Try again.`, `You've sent 20 posts to your team today. More tomorrow.`, `This post was retired.`
- Leader card: title `Sent to your team`; InfoTip `Who added, posted or skipped each post you sent.`; counts `Sent <n>`, `Added <n>`, `Skipped <n>`, `Posted <n>`; button `See who`; drawer chips `Waiting`, `Added`, `Posted`, `Skipped`; drawer column `Their change`; empty `Nothing sent yet. Send a post from the Team library.` with `Open Team library`.
- Member card: title `From your leader`; count `<n> waiting`; labels `Your opening line`, `Your line at the end`, `Post on <Dow D Mon>, <time>`; buttons `Add to my calendar`, `Adding...`, `Skip`, `Open`; lines `On your calendar for <Dow D Mon>, <time>. Already approved.`, `Skipped. Undo`, `Your change can't be more than 150 characters.`
- Server refusals: `Your leader retired this post.`, `This post wasn't sent to you.`, `Only the opening line can change on this post.`, `Only a line at the end can be added to this post.`, `This post can't be changed. Use it as it is.`
- Phone alert: title `<leader> sent you a post`, body `<title>. Add it to your calendar in the studio.`
- Audit trail labels `Sent to team`, `Added from leader`, `Skipped from leader`.

### Data

Stop for Leo: a schema change. Migration `supabase/hub/0NN_team_push.sql` (the next free number, after the team library's), on 011's pattern:

- `cs_team_pushes`:
  - `id uuid primary key default gen_random_uuid()`, `team_id uuid not null references cs_teams(id) on delete restrict`, `item_id uuid not null references cs_library_items(id) on delete restrict`;
  - `sent_by uuid not null`, `sent_by_name text not null`, `note text not null default '' check (char_length(note) <= 280)`;
  - `lock text not null default 'none' check (lock in ('none','opening-line','end-line'))`, `post_on date`, `created_at timestamptz not null default now()`.
  - Immutable by trigger.
- `cs_team_push_targets`: `push_id uuid references cs_team_pushes(id) on delete restrict`, `user_id uuid not null`, `user_name text not null`, `status text not null default 'sent' check (status in ('sent','added','skipped'))`, `draft_id text`, `submission_id uuid references cs_review_submissions(id) on delete restrict`, `change text not null default '' check (char_length(change) <= 200)`, `responded_at timestamptz`, primary key `(push_id, user_id)`. Status changes only through the RPCs, and an `added` row never changes again.
- RPCs, SECURITY DEFINER, each writing its event in the same transaction:
  - `cs_send_push(p_item_id uuid, p_user_ids uuid[], p_lock text, p_post_on date, p_note text)`: leaders only. The item must belong to the team and not be retired; null `p_user_ids` means every member; every id must be a current member; up to 200 people and 20 pushes a day per team. Event `push_sent` with the count.
  - `cs_use_pushed_item(p_push_id uuid, p_draft_id text, p_content text)`: the caller must be a target in `sent` or `skipped`. The lock check, on `cs_review_normalize` text:
    - `none`: the content starts with the item's text, and the rest is at most 300 characters (sign-off and disclosure);
    - `opening-line`: the first line is at most 150 characters, and the text after it starts with the item's text after its first line, with a rest of at most 300;
    - `end-line`: the content starts with the item's text, with a rest of at most 500 (a 200-character line plus the sign-off).
    It then inserts an approved submission (reviewer = the item's approver, comment `Sent by <leader>: <title>`), a `cs_library_uses` row, sets the target to `added` with `change`, and logs event `push_added`.
  - `cs_skip_push(p_push_id uuid, p_skip boolean)`: moves between `sent` and `skipped`, event `push_skipped` with `detail.skip`.
- `cs_review_events.kind` gains `push_sent`, `push_added` and `push_skipped`; `EVENT_LABEL` and the audit CSV follow.
- RLS: leaders read their team's pushes and targets; a member reads only pushes that list them and their own target rows. Clients get SELECT only.
- `Posted` joins `cs_post_record` (trust-archive) on owner and draft id; no extra column.
- `notify` reads members' `sent` targets with the service key and claims each alert in `cs_notify_sent` as item `push:<push id>`, so a push alerts once. That log is pruned after 90 days, so `notify` only alerts pushes created in the last 14 days.
- Client code in `src/lib/teamPush.ts`: the reads, the three RPC calls, and the pure helpers `lockAllows(lock, itemText, content)` (a mirror of the SQL check for instant feedback) and `pushCounts(targets, posted)`.

### AI and cost

- No model call and no Jev question. A person approved the post; the server compares text.
- The MAS check runs on the changed line, under its own `mas-check` cap.
- No paid provider. Phone alerts are web push (free). There is no email.

### Deep links

- `/home#from-your-leader` scrolls to the member's card; the phone alert links there.
- `/team?push=<id>` opens a push's drawer (push history); `/team#sent-to-team` scrolls to the card.
- `Send to team` itself sits on the library card at `/team/library?item=<id>`, from trust-approved-library.
- Builders: extend the existing `links.team` with `push`, and add `links.home(o: { section?: "from-your-leader" })` in the shape of `links.brand` (there is no home builder today). Add the `push` param and both anchors to `docs/deep-links.md`.

## Done when

- [ ] Leo approves the migration, and it is applied after an independent review.
- [ ] On Leo's two sign-ins, the leader sends a library post to `Everyone` with `The opening line` allowed, and the member sees it on Home with the badge count up by one.
- [ ] The member changes the opening line, adds it, and finds it on the calendar already approved: Copy, Post it for me and the server approval check all pass.
- [ ] A change to any other line is refused by the server with the opening-line reason.
- [ ] `Skip` and `Undo` move the status, and the leader's counts follow on reload.
- [ ] The leader's drawer shows who added, skipped or waits, with each person's change; once trust-archive ships, `Posted` fills in.
- [ ] A member with phone alerts on gets one alert per push, never two.
- [ ] Every send, add and skip appears in the audit trail and its CSV.
- [ ] Other sign-ins see no `Send to team` and no `From your leader` card.
- [ ] `npm run build` and the full `npx vitest run` pass; 390 px and 1440 px checked by eye; `src/data/northStar.ts` flipped in the same commit.

## Tests

- SQL `0NN_team_push.test.sql`:
  - a member cannot send, and a leader cannot send a retired item or to someone outside the team;
  - the 201st person and the 21st push of a day fail;
  - each lock accepts the allowed change and refuses a change elsewhere, and a 151-character opening line fails;
  - a good add writes one approved submission, one use, the target `added` and one event;
  - an `added` target cannot be skipped or added again;
  - pushes cannot be updated or deleted.
- `src/lib/teamPush.test.ts`: `lockAllows` agrees with the SQL cases above; `pushCounts` counts sent, added, skipped and posted; the slot picker takes the brand's first slot on the day, else 10:00, and the next open slot when no day is set.
- `src/lib/needsYou.test.ts`: waiting pushes add to the count.
- `supabase/functions/notify/logic.test.ts`: one alert per new push for members with alerts on, none for a push already alerted, none for a push older than 14 days, wording as above.
- `src/lib/teamReview.test.ts`: the three event kinds have labels and reach the CSV.
- Prove each case bites by breaking the code once.

## Open questions

- Should members be able to opt in once and have pushed posts go out on their connected accounts by themselves, as Hearsay's Dynamic Campaigns do? It posts in someone's name without a tap, so it needs each member's consent and Leo's call.
- Groups by office or cohort (Snappy Kraken) need teams inside teams. Today a person is in one flat team; that is trust-workspaces' question.
- A leaderboard or streaks for who posts pushed content (Supergrow) belongs to learn-team-analytics.
- Should the push also reach Leo's Telegram group, as team posts do today? Leo decides whether team posts move into this.
- The migration is a schema change and waits for Leo.

## Related

trust-approved-library, trust-approval, trust-compliance-check, trust-archive, trust-workspaces, learn-team-analytics, publish-queue, publish-calendar
