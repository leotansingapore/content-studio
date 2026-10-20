# Pre-approved content library

`trust-approved-library` | trust | phase 8 | status: missing | /north-star#trust-approved-library

## Leo asked

No direct ask; from the competitor research.

## How the best do it

Fastlane has no cleared-content library: its Studio > Library holds the user's own made posts plus an "INSPIRATION" block of top posts and competitor ads ("24 of these match what you sell, shown first") with "Remix this" on each (notes-1, F11, `research/fastlane-pdf/lib-tile-00.webp`). Nothing in it has been approved by anyone, and the whole thing belongs to one person's workspace.

The adviser tools built their business on this:

- FMG Suite keeps a library of emails, social posts, market commentaries, videos, blogs, e-books and greeting cards, browsed by Email, Social, Video, Lead Generation and Greeting Cards, and its compliance page says "All content is FINRA-reviewed". Advisers use a piece as it is or edit it, and editing sends it back through review. FMG reports library email use up 44% from 2021 to 2022. ([content](https://fmgsuite.com/features/content/), [one-click compliance](https://fmgsuite.com/features/one-click-compliance/), [pricing](https://fmgsuite.com/pricing/))
- FMG Suite Enterprise lets the firm publish its own commentaries, campaigns, seminar kits and e-books into a firm library that advisers use "with the click of a mouse". Compliance reviews a piece only when an adviser edits it. Enterprise pricing is not published. ([enterprise](https://fmgsuite.com/enterprise/))
- Levitate: broker-dealers and RIA Super Admins mark each library template "Pre-Reviewed", "Approved" or "Rejected". Standard users see only Approved and Pre-Reviewed items, with a note, while Rejected ones are hidden. "Reject Campaign" needs a reason (Citations, Content, Images, Other) and a note, and Levitate tracks rejection trends. Its CSV export has no compliance status column. ([review statuses](https://help.levitate.ai/article/428-compliance-pre-review-pre-approve-and-reject-content), [FINRA-reviewed content](https://martech360.com/news/levitate-now-offering-finra-reviewed-content-as-part/))
- Smarsh (legacy Actiance Socialite): marketing supplied pre-approved posts that advisers published at once to one or more profiles with no review. Advisers could not edit them, and any comment they added went to review. Raymond James used it. Its status under Smarsh is unverified. ([Network Computing](https://networkcomputing.com/network-infrastructure/actiance-funnels-approved-social-posts-to-financial-advisors), [Advisor.ca](https://stg.advisor.ca/industry-news/industry/raymond-james-advisors-going-social))
- Broadridge Advisor: 3,000+ pieces written to FINRA rules and filed with FINRA. Its Video Studio has 30+ FINRA-reviewed videos that fill in the adviser's photo, brand colours, logo and contact details, on the Growth tier. ([email and social](https://broadridge.com/advisor/emailsocialmarketing), [video](https://wealthprofessional.ca/investments/wealth-technology/broadridge-empowers-advisors-to-make-their-mark-with-video/361314), [pricing](https://advisor.broadridge.com/pricing))
- Lately AI lets employees choose pre-approved content and publish it to their own channels. ([financial services](https://www.lately.ai/industries/compliant-social-media-content-for-financial-services-agents-advisers-brokers))
- Social Jazz auto-schedules branded insurance posts to agents' accounts: Free is 2 posts a week on 1 account, Plus from USD 19 a month, Pro 49, Premium 199 (per Pinney). ([Pinney](https://pinneyinsurance.com/best-social-media-tools-life-insurance-agents-2026/))

What to copy: a library only a leader or the firm fills, items an adviser can post unedited with no wait, edits that go back to review, items a leader can withdraw, and a count of who used each one.

## What we have today

Checked against origin/main 08537d1.

- No shared library of cleared posts. Every post is written per person.
- Nearest pieces, none of them cleared:
  - Inspiration (`/inspiration`, `src/components/Inspiration.tsx`, data `src/data/inspiration.json`): 100 hand-picked example posts; "Use as vibe" opens Write to write new words in that shape;
  - Creators (`/profiles`), Top posts (`/swipe`) and Following, all other people's posts to remix;
  - the Members Hub guides (`/hub/guides`), paid and unlinked;
  - Leo's team posts (`src/lib/teamPosts.ts`), which jobs write and Leo approves in the calendar before they go to his Telegram group. They never reach an adviser's own accounts.
- The approval parts this item reuses: team review submissions with a content hash (`cs_review_submissions`, SQL 011), "Edited since approval" (`deriveReviewState`), the team rule lock on Copy, Mark posted and Post it for me (`postingBlockReason`), the review queue's Approved tab (`src/components/team/ReviewQueue.tsx`), and the audit trail.
- What the submissions table allows: its guard trigger runs before UPDATE or DELETE only, so a SECURITY DEFINER function can insert a row that is already `approved`. Such a row must carry `reviewer_id`, `reviewer_name` and `reviewed_at` (`cs_review_submissions_reviewed_shape`), and the reviewer cannot be the author (`cs_review_submissions_no_self_review`).
- `/library` is taken by publish-library's spec (Fastlane's Library of made posts, with `links.library`), so this item lives at `/team/library`.

## Build

Every part needs shared tables between a leader and the members, so the whole item stops for Leo before the migration runs. After that, gate the page and the entry points with `leoOnly(email)`. Build after trust-approval phase A, which makes the approved text the text that goes out.

The idea in one line: using a library item unedited creates an approved submission for that exact text, so every existing lock opens with no new rules. An edit changes the hash, the post becomes "Edited since approval", and it goes to the leader like any other post.

### Screens and states

New page `src/pages/TeamLibraryPage.tsx` at `/team/library` (publish-library owns `/library`), nav entry `{ to: "/team/library", label: "Team library", icon: Library, owners: LEO_EMAILS }` in the `improve` section after Team review, with a `KEYWORDS` line in `src/lib/jumpTo.ts` (`"approved posts library team"`). The page returns `NotFoundPage` when `leoOnly(email)` is false, as `/north-star` does.

```
Team library                     [All topics v] [All platforms v] [Search posts]
+--------------------------------+  +--------------------------------+
| in  LinkedIn | Text post       |  | ig  Instagram | Carousel       |
| 3 questions before you buy...  |  | What your hospital bill...     |
| <first 3 lines>                |  | <first 3 lines>                |
| Approved by Mei Lin, 12 Oct    |  | Approved by Mei Lin, 9 Oct     |
| [Use as is] [Edit and submit]  |  | [Use as is] [Edit and submit]  |
+--------------------------------+  +--------------------------------+
```

Cards are 1 across at 390 px, 2 at 768 px and 3 at 1440 px.

For a member:

- `Use as is`:
  1. makes a draft in My posts (`upsertDraft`, `status: "draft"`, the item's platform and format, `hook` = first line, `draft` = the item's text, `library: { itemId, title }`);
  2. calls `cs_use_library_item(item_id, draft_id, content)` with `content` = `postText(draft, brand)` built with link tagging off;
  3. the server records an approved submission for that text.
  While this runs the button reads `Adding...`; when it is done the app shows the toast `Added to My posts, already approved. Schedule it when you're ready.` with `Open`, which goes to `/drafts?status=draft`. If the server refuses, the new draft is deleted again and the reason shows.
- `Edit and submit` makes the same draft without the server call and opens it in Write (`/generate?draft=<id>`). Write shows one line above the editor: `From the team library. Edits go to your leader for review.`
- Card states: a used card shows `You used this on <D Mon>` and its buttons stay; a retired item disappears for members.
- Empty: `Your leader hasn't added any posts yet.`
- Not in a team: `The team library comes with a team. Start or join one in Team review.` with `Open Team review` (`/team`).
- Loading: six skeleton cards. Error: `Couldn't load the library.` with `Try again`.
- Refusals from the server: `Your leader retired this post.`, `This post isn't in your team's library.`, `You've used 100 library posts today. More tomorrow.`

For a leader:

- The same page, plus `Show retired` (`?show=retired`) and, on each card, `Used by <n>` and `Retire`.
- `Used by <n>` opens a drawer (`?item=<id>`) listing each member who used it, when, and the lines their copy added after the approved text (their sign-off), headed `Added after the approved text`. Posted status per member arrives with trust-archive.
- `Retire` asks `Retire "<title>"? Advisers can't use it again. Posts already made from it keep their approval.` with `Cancel` and `Retire`. Done: toast `Retired.` with no Undo, since the event is on record, and the card moves under Show retired.
- Adding items:
  - from Team review's Approved tab, a button `Add to team library` on each approved submission. A small dialog asks for `Title` (prefilled with the first line, 80 characters) and up to 3 `Topics`, then `Add`. The text is the submission's, unchanged;
  - from the leader's own posts in My posts, `Add to team library` in the post's menu. The MAS check (trust-compliance-check) runs first; a High result asks `High risk: <label>. Add it anyway?` before the dialog.
  - Done: toast `Added to the team library.` with `Open`.
- Leader empty state: `Add approved posts from Team review.` with `Open Team review`.

### Copy

- h1 `Team library`; InfoTip `Posts your leader approved. Use one as is and it needs no review.`
- Filters `All topics`, `All platforms`, placeholder `Search posts`, toggle `Show retired`.
- Card lines `Approved by <name>, <D Mon>`, `You used this on <D Mon>`, `Used by <n>`.
- Buttons `Use as is`, `Edit and submit`, `Adding...`, `Open`, `Retire`, `Cancel`, `Add to team library`, `Add`, `Open Team review`, `Try again`.
- Toasts `Added to My posts, already approved. Schedule it when you're ready.`, `Added to the team library.`, `Retired.`
- Write line `From the team library. Edits go to your leader for review.`
- Dialog labels `Title`, `Topics`; retire confirm `Retire "<title>"? Advisers can't use it again. Posts already made from it keep their approval.`; MAS confirm `High risk: <label>. Add it anyway?`
- Drawer heading `Who used it`, column `Added after the approved text`.
- Empty and error lines as listed above, and the three server refusals.
- Audit trail labels `Added to team library`, `Retired from team library`, `Used from team library`.

### Data

Stop for Leo: a schema change. Migration `supabase/hub/0NN_team_library.sql` (the next free number), on 011's pattern:

- `cs_library_items`:
  - `id uuid primary key default gen_random_uuid()`, `team_id uuid not null references cs_teams(id) on delete restrict`, `title text not null check (char_length(title) between 1 and 80)`, `topics text[] not null default '{}'` (up to 3, each up to 30 characters);
  - `platform` and `format` with the same checks as `cs_review_submissions`, `content text not null check (char_length(content) between 1 and 20000)`, `content_hash text not null`;
  - `approved_by uuid not null`, `approved_by_name text not null`, `source_submission_id uuid references cs_review_submissions(id) on delete restrict`;
  - `created_at timestamptz not null default now()`, `retired_at timestamptz`, `retired_by uuid`, `retired_by_name text`.
  - A guard trigger keeps everything but the `retired_*` columns unchanged, lets those change once from null, and refuses deletes.
- `cs_library_uses`: `id bigserial`, `item_id uuid not null references cs_library_items(id) on delete restrict`, `user_id uuid not null`, `user_name text not null`, `draft_id text not null`, `submission_id uuid references cs_review_submissions(id) on delete restrict`, `tail text not null default '' check (char_length(tail) <= 300)`, `used_at timestamptz not null default now()`, append-only like the events table.
- RPCs, SECURITY DEFINER, each writing its event in the same transaction:
  - `cs_add_library_item(p_title, p_topics, p_submission_id uuid default null, p_platform text default null, p_format text default null, p_content text default null)`: leaders only. With a submission id it must be approved and from the same team, and its text is copied; otherwise the leader's own text is used, and the event is `library_added`.
  - `cs_retire_library_item(p_item_id)`: leaders only, at most once per item, with the event `library_retired`.
  - `cs_use_library_item(p_item_id, p_draft_id, p_content)`: a member of the item's team, item not retired, at most 100 a day per user. The check is `starts_with(cs_review_normalize(p_content), cs_review_normalize(item.content))` with the rest at most 300 characters (the member's sign-off and disclosure). It inserts an `approved` submission (reviewer = the item's approver, `review_comment` = `From the team library: <title>`), skipped when the caller is that approver because a submission cannot review itself, then the use row, then event `library_used`.
- `cs_review_events.kind` gains `library_added`, `library_retired` and `library_used`; `EVENT_LABEL` and the audit CSV follow.
- RLS: members read their team's items that are not retired and their own uses; leaders read every item and use in their team. Clients get SELECT only.
- `DraftEntry` gains `library?: { itemId: string; title: string }`, so Write can show its line. `loadDrafts` casts stored JSON without a field check, so Write reads it through a guard `libraryOf(draft)` that returns null for anything malformed.
- Library posts go out with link tagging off, because tagging rewrites links inside the approved text: `postText` in `src/lib/autoPost.ts` and Write's `forPosting` skip `tagLinks` when `draft.library` is set.
- Client code in `src/lib/teamLibrary.ts`: reads through RLS, the three RPC calls, and the pure helpers `libraryTail(content, itemContent)` and `libraryOf(draft)`.

### AI and cost

- No model call and no Jev question: a person approves, and the server compares text.
- The MAS check runs on a leader's own post before it is added, at its own cap (`mas-check`).
- No paid provider and no usage cap; the 100-a-day limit on uses lives in SQL.

### Deep links

- `/team/library` with `topic`, `platform` (`all` default), `q`, and for leaders `show=retired`; all replace the history entry.
- `?item=<id>` opens the leader's usage drawer and pushes a history entry.
- Edit and submit opens the existing `/generate?draft=<id>`.
- Builder `links.teamLibrary({ topic, platform, q, show, item })` in `src/lib/links.ts` (`links.library` belongs to publish-library), and `/team/library` rows in `docs/deep-links.md`.

## Done when

- [ ] Leo approves the migration, and it is applied after an independent review.
- [ ] On Leo's two sign-ins (leader and member of one team), the leader adds a post from the Approved tab, and the member sees it on `/team/library`.
- [ ] `Use as is` puts it in My posts already approved: Copy and Post it for me are open under the team rule, and the server's approval check (trust-approval) accepts it.
- [ ] Editing that draft by one word turns it to "Edited since approval" and locks posting again until the leader approves.
- [ ] `Retire` hides the item from members, a stale `Use as is` is refused with the retired line, and posts made before keep their approval.
- [ ] `Used by <n>` lists the member with the lines their copy added.
- [ ] A use whose text does not start with the item's text, or adds more than 300 characters, is refused by the server.
- [ ] Every add, retire and use appears in the audit trail and its CSV.
- [ ] Other sign-ins see no Team library entry, and a typed `/team/library` shows the 404 page.
- [ ] `npm run build` and the full `npx vitest run` pass; nav tests updated; 390 px and 1440 px checked by eye; `src/data/northStar.ts` flipped in the same commit.

## Tests

- SQL `0NN_team_library.test.sql`, like 011's and 014's:
  - a member cannot add or retire, and a leader can;
  - an item's text cannot be updated and no item can be deleted;
  - a use from another team, of a retired item, with a different text, or with a 301-character tail fails;
  - a good use writes one approved submission, one use row and one event;
  - a leader using their own item writes no submission;
  - the 101st use of a day fails.
- `src/lib/teamLibrary.test.ts`: `libraryTail` returns the added lines, and null when the text does not start with the item's; `libraryOf` keeps a valid `library` field and returns null for a malformed one; the draft built by `Use as is` has the item's platform, format and first line.
- `src/lib/teamReview.test.ts`: the three new event kinds have labels, and the CSV writes them.
- `src/lib/autoPost.test.ts`: `postText` leaves links untagged on a library draft even when the brand kit tags links.
- `src/lib/nav.test.ts` and `navRoutes.test.ts`: `/team/library` maps to one page and stays hidden for someone@example.com.
- Prove each case bites by breaking the code once.

## Open questions

- Should retiring an item also withdraw the approval of posts already made from it, for example after a rule change? This spec keeps their approval; Leo decides.
- The 300-character tail lets a member's own sign-off ride on an approved post without review, and the leader only sees it afterwards in `Used by`; Leo decides whether a member's sign-off needs its own approval.
- Should Leo seed a library for every user, outside any team? That is find-adviser-library's job and is left out here.
- Should a library post be able to schedule itself into the member's next open slot (Social Jazz, FMG's automated posting)? That belongs to trust-team-push and publish-queue.
- The migration is a schema change and waits for Leo.

## Related

trust-team-push, trust-approval, trust-compliance-check, trust-archive, find-adviser-library, learn-team-analytics, trust-workspaces, publish-queue
