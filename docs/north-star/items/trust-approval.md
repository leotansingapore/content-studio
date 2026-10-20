# Nothing posts unapproved

`trust-approval` | trust | phase 8 | status: partial | /north-star#trust-approval

## Leo asked

No direct ask; from the competitor research. The north-star README ends every remix as a post ready to approve and schedule (that is the README's wording, not Leo's), and this item is the approve half for anyone other than the author: a team leader, or a compliance officer with no account.

## How the best do it

Fastlane treats the user as the only approver. The first Strategy screen says "Pick who it should reach. Senna drafts the posts and you approve them before anything goes out." (on the second visit the sub is shortened to "Pick who it should reach. Senna drafts the posts.").

![Fastlane 0:00](../../../public/north-star/fastlane/t000.webp)

Adding a campaign starts nothing: "Nothing is running yet: start the run when you are ready, or leave it for Senna to propose a start." Spending and posting wait for a press.

![Fastlane 0:28](../../../public/north-star/fastlane/t028.webp)

In the post reviewer, pressing "Make | 5 credits" both accepts a post and pays for it ("Nothing is made or charged until you press Make."), with Swap, Edit and Skip beside it, under the line "AI can make mistakes. Check each post before it goes out." Fastlane's public pages call the swipe review "Blitz mode" ("Tinder mode") and promise "Nothing publishes without your approval", on the Free plan too ([AI UGC](https://usefastlane.ai/tools/ai-ugc-video-generator), [pricing](https://usefastlane.ai/pricing)).

![Fastlane 0:41](../../../public/north-star/fastlane/t041.webp)

Settings lists "What runs without you" ("What Senna does alone and what waits for you.") and "Members" ("Who works in this workspace with you."), neither opened in the recording (t346). Nothing on screen shows a second approver or a link for someone outside the workspace.

Approval by someone else:

- ContentStudio: one or several approvers per post, with a choice of whether one or all must approve. External approvers review through a magic link with no account, see a preview per network, and approve or reject with a note. There is a "force publish" when a reviewer goes quiet and an activity log of comments, edits and decisions; approved posts schedule themselves (Advanced plan and above). ([workflow](https://contentstudio.io/social-media-approval-workflow), [pricing](https://contentstudio.io/pricing))
- Planable sets approval per workspace as "None", "Optional", "Required" or "Multi-level", where Basic has None and Optional, Pro adds Required and Enterprise adds Multi-level; once approved, a post schedules with "No extra steps". ([pricing](https://planable.io/pricing/), [features](https://planable.io/features/))
- Levitate (adviser marketing): on by default for financial customers. After scheduling, the adviser enters the compliance officer's email, who gets a PDF. The officer can reply with approval words, which Levitate detects and turns pending into scheduled, or the adviser clicks "Mark as Approved". An admin can pre-fill and lock the officer's email. Substantive edits after approval need approval again, and a social post whose time passes unapproved does not go out. ([compliance flow](https://help.levitate.ai/article/118-compliance-flow))
- Cloud Campaign: "Send a full calendar in one secure link"; multi-level approvals add a compliance or principal sign-off; "Require Approval" holds posts until sign-off. ([insurance agencies](https://www.cloudcampaign.com/solutions/insurance-marketing-agencies))
- FMG Suite One-Click Compliance sends new content straight to the compliance inbox, and "When they hit 'approve' the content goes live." ([one-click compliance](https://fmgsuite.com/features/one-click-compliance/))
- Quso.ai (formerly Vidyo.ai) offers "Send for Approval only" or "Add Schedule time and Send for Approval". An approver can view the post by link without an account but must sign in to approve. ([help](https://helpdesk.quso.ai/help/send-post-for-approval.md))
- Twenty Over Ten Lead Pilot has a "Compliance PDF" icon on drafts for firms whose compliance team works from email. ([help](https://help.twentyoverten.com/en/downloading-a-pdf-for-compliance))
- Simplified's "Client Review" bundles a campaign's drafts into one link that collects approve, reject and comment per post with no login. MagicPost clients approve without an account. Predis.ai emails the reviewer a "View Posts" link and schedules accepted posts by itself. Ordinal lists "Blocking Approvals by Default" on its pricing. ([Simplified](https://simplified.com/agencies), [MagicPost](https://magicpost.in/), [Predis](https://predis.ai/use-cases/approval-flow/), [Ordinal](https://www.tryordinal.com/pricing))

What to copy: approval by a link with no account, a lock that holds until the exact text is approved, a second level for compliance, and an approval that leads straight into scheduling.

## What we have today

Checked against origin/main 08537d1.

- Team review at `/team` (`src/pages/TeamPage.tsx`, `src/components/team/*`, `src/lib/teamReview.ts`, SQL 011, 013, 014). Members submit a draft; a leader approves, asks for changes or rejects (a reason is required for both). Leaders do not submit (`useDraftReviews` is on for members only), and nobody can review their own submission. Submissions are immutable, events are append-only, and each submission keeps a SHA-256 of its normalised text (`cs_review_hash`).
- The team rule "Needs approval before posting" (SQL 014, a row in `cs_team_approval_rules` while on, deleted when off, set per member in LeaderView's TeamCard; leaders and the team owner cannot be put on it) locks Copy in Write, Mark posted in My posts, Calendar and Home, a drag to Posted on Board, and the Schedule button in Post it for me (`postingBlockReason` through `useDraftReviews`). A post edited after approval shows "Edited since approval". A failed read keeps the lock shut (`memberRule`).
- Preview links: Share for review on My posts (`src/components/review/PreviewLinkPanel.tsx`, `/drafts?review=<id>`) makes `/review/<token>` (`src/pages/PreviewReviewPage.tsx`, edge function `preview-link`, SQL 012). Someone with no account reads a snapshot and comments under a typed name (placeholder `e.g. Carol Lim, Compliance`). Links last 14 days and can be turned off (`This link has ended`). A newer link on the same draft leaves the older one open with the warning "<name> has shared a newer version of this post. Ask them for the new link before approving." The reviewer cannot approve. The link's text is `reviewTextForDraft`, the body only.
- `social/logic.ts` already has `isAllowed(list, uid)` (`*` or a comma list), used for `SOCIAL_CONNECT_USERS`, and `social/index.ts` already holds a service-role client (`admin`).
- Gaps found in the code:
  - The approved text is the draft body only (`reviewTextForDraft` strips markdown), while Write's Copy (`forPosting`) and Post it for me (`postText(draft, brand)` in `src/lib/autoPost.ts`) add the sign-off and disclosure lines and tag links when the brand kit asks, so the leader approves less than what goes out.
  - Post it for me's caption box stays editable under the team rule. A member can change the approved caption in the panel and schedule it, because the lock reads the draft, not the caption.
  - Post it for me also sends the draft's first comment (`draft.firstComment`), which the panel never shows and the leader never reviews, and a YouTube title typed in the panel.
  - The `social` edge function (`supabase/functions/social/posts.ts` `runPost`, action "schedule") never checks approval, and it accepts a per-platform `captions` map that replaces the content on those platforms (the panel does not send it yet; publish-schedule plans to). The lock lives only in the browser.
  - There is a single approval level and no approval from outside the team.

## Build

Gate the new behaviour with `leoOnly(email)` in the app and with a server allowlist secret `APPROVAL_GATE_USERS` read by the existing `isAllowed` in `supabase/functions/social/logic.ts`, set to Leo's two uids. To test as a member, Leo makes a team on tanjunsing@gmail.com and joins it as a member from leotanjs95@gmail.com (one team per person, so both must be out of any other team first).

Phase A closes the gaps above with no schema change. Phase B adds approval by link and a second level, and it needs migrations, so it stops for Leo first.

### Screens and states

Phase A

1. Approve the text that goes out: under the gate, `Submit for review` sends `reviewTextForPost(draft, brand)`, which is `normalizeReviewText(postText(draft, brand))` with `brand = loadBrand(userId)` (`src/lib/carousel.ts`), the same string Write's Copy and Post it for me produce. Share for review sends the same text, so a link reviewer reads what goes out too. `deriveReviewState` accepts a list of hashes: the full-text hash, plus the old body-only hash so approvals made before the change still unlock Copy and Mark posted. Post it for me accepts only the full-text hash (the server can only compute that one); a post approved the old way shows `Approved before the sign-off was included. Resubmit to post it for me.`
2. Post it for me under the team rule: the caption box becomes read-only and shows the approved text, labelled `Caption (approved)`, with the line `This is the text your leader approved. To change it, edit the post and resubmit.` The draft's first comment is left off with the line `First comments aren't part of the approval, so this one stays off.`, and the YouTube title box only takes text that appears word for word in the approved caption (empty by default). A member off the rule sees today's panel.
3. Server check: Post it for me sends `draftId` with the schedule request. In `social/index.ts`, where the service client `admin` lives, `approvalGate` runs before `runPost` for action "schedule" and callers in `APPROVAL_GATE_USERS`:
   - no row in `cs_team_approval_rules` for the caller: allowed;
   - otherwise the newest `cs_review_submissions` row for `(team_id = the rule's team, author_id = caller, draft_id)` must be `approved`, and `sha256(reviewNormalize(text))` must equal its `content_hash` for the content and for every entry of `captions`;
   - under the rule a non-empty `firstComment` is refused, and a YouTube title must appear in the approved text;
   - a missing `draftId` under the rule, or any read error, refuses (fail closed). `retry` re-sends a post Zernio already holds, so it is not gated again.
   Refusal is HTTP 403 `{ code: "needs_approval", error }` with the same words `postingBlockReason` uses, so the panel shows one familiar line. A read error is 503 `Couldn't check your approval status. Try again.`

Phase B (stop for Leo: two migrations)

4. Approve by link: `/review/<token>` gains a decision block under the post, above the comments:

```
Your decision
 Your name   [ e.g. Carol Lim, Compliance        ]
 Note        [ What needs to change?              ]
 [Approve]   [Ask for changes]
```

   - `Approve` first shows `You're approving the post exactly as shown above.` with `Confirm approval` and `Cancel`.
   - `Ask for changes` needs a note: `Add a note saying what needs to change.`
   - Sending: the pressed button reads `Sending...` within 400 ms.
   - Done: the block becomes the record, `Approved by Carol Lim, Compliance on 21 Oct, 3:04 pm (Singapore time).` or `Carol Lim, Compliance asked for changes on 21 Oct, 3:04 pm.` with the note, plus `Change my decision`. A change adds a new row; the newest decision counts.
   - Ended or turned-off link: today's `This link has ended`, with no decision block.
   - Superseded link (a newer one exists for the draft): today's newer-version warning shows and the decision block does not.
   - Failed: `Couldn't send your decision. Try again.` with the typed name and note kept.
   - Too many decisions on one link (20): `This link has had too many changes. Ask for a new link.`
5. The adviser sees it in the Share for review panel and on the post's row in My posts: `Approved by <name>, <when>`, `<name> asked for changes: "<note>"` or `Waiting for a decision`.
6. Hold for advisers with no team: a toggle in the Share for review panel, `Hold this brand's posts until a reviewer approves them`, stored per brand. While on, Copy, Mark posted and Post it for me need the newest link decision on that draft to be `approved` on the same full-text hash. Block reasons: `Send it for approval first.`, `Waiting for your reviewer's approval.`, `Your reviewer asked for changes.`, `You edited it after your reviewer approved it. Send a new link.` This hold is self-imposed, so it lives in the browser only, and the server gate covers team rules alone.
7. Two levels for a team: in LeaderView's TeamCard, beside each member's `Needs approval before posting` box, a select `Who approves` with `You` (default) and `You, then compliance by link`. Under the second:
   - after the leader approves, the member's `DraftReviewControl` shows `Approved by your leader. Compliance sign-off is next.` with `Make an approval link`. That makes a preview link from the approved text;
   - posting needs both the leader's approval and a link approval whose hash equals the approved submission's hash;
   - done: `Approved by your leader and by <name>.`
   - The server gate checks both levels.

### Copy

- Phase A: `Caption (approved)`, `This is the text your leader approved. To change it, edit the post and resubmit.`, `First comments aren't part of the approval, so this one stays off.`, `The YouTube title has to come from the approved caption.`, `Approved before the sign-off was included. Resubmit to post it for me.`, `Couldn't check your approval status. Try again.`, and the existing reasons `Submit it for review first.`, `Waiting for your leader's approval.`, `Your leader asked for changes. Edit and resubmit.`, `Your leader rejected this post.`, `You edited it after approval. Resubmit it first.`
- Review page: heading `Your decision`; labels `Your name` (placeholder `e.g. Carol Lim, Compliance`, today's), `Note`; note placeholder `What needs to change?`; buttons `Approve`, `Ask for changes`, `Confirm approval`, `Cancel`, `Change my decision`; lines `You're approving the post exactly as shown above.`, `Add your name so the adviser knows who decided.`, `Add a note saying what needs to change.`, `Sending...`, `Couldn't send your decision. Try again.`, `This link has had too many changes. Ask for a new link.`; records `Approved by <name> on <D Mon>, <h:mm am> (Singapore time).` and `<name> asked for changes on <D Mon>, <h:mm am>.`
- Adviser side: `Approved by <name>, <when>`, `<name> asked for changes: "<note>"`, `Waiting for a decision`.
- Hold: toggle `Hold this brand's posts until a reviewer approves them`, InfoTip `Copy and Post it for me unlock once your link is approved.`, and the four block reasons in step 6.
- Two levels: select label `Who approves`, options `You`, `You, then compliance by link`; `Approved by your leader. Compliance sign-off is next.`, `Make an approval link`, `Approved by your leader and by <name>.`; audit detail `<member>: needs approval before posting on (you, then compliance by link)`.

### Data

Phase A, no schema change:

- Submissions keep their columns; only the text sent changes under the gate.
- `social` reads `cs_team_approval_rules` and `cs_review_submissions` with the service client it already holds. The pure parts go in `supabase/functions/social/logic.ts`: `reviewNormalize` (a copy of `cs_review_normalize`: CRLF and CR to LF, then spaces, tabs and newlines trimmed from both ends) and `approvalRefusal(ruleOn, latest, input, hashes)`. The allowlist reuses `isAllowed`.
- `ScheduleInput` gains an optional `draftId` (1 to 200 characters, the same check as `cs_review_submissions.draft_id`).

Phase B (stop for Leo):

- Migration `supabase/hub/0NN_preview_decisions.sql` (the next free number). Table `cs_preview_decisions`:
  - columns `id bigserial primary key`, `link_id uuid not null` and `owner_id uuid not null`, `draft_id text not null` copied from the link with no foreign key (links cascade away with a deleted account in 012, so a restrict key would block account deletion and a cascade would erase the record), `decision text not null check (decision in ('approved','changes_requested'))`, `reviewer_name text not null check (char_length(reviewer_name) between 1 and 80)`, `note text check (char_length(note) <= 2000)`, `content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$')`, `created_at timestamptz not null default now()`;
  - a constraint that `changes_requested` has a non-blank note;
  - append-only and no-truncate triggers like `cs_review_events` in 011, RLS reads where `owner_id = auth.uid()`, no client writes.
  - RPC `cs_preview_link_decide(p_token text, p_name text, p_decision text, p_note text)`, granted to service_role only like `cs_preview_link_comment`. It refuses an ended, revoked or superseded link and a 21st decision on one link, and stores `cs_review_hash(link.content)`.
  - `cs_preview_link_view` returns the newest decision.
  - The `preview-link` edge function gets POST action `decide`.
- Migration `supabase/hub/0NN_approval_levels.sql`:
  - `alter table cs_team_approval_rules add column levels text not null default 'leader' check (levels in ('leader','leader-then-link'))`;
  - `cs_set_approval_required(p_user_id uuid, p_required boolean, p_levels text default 'leader')`. Drop the two-argument function in the same migration: left beside a three-argument one with a default, a two-argument call becomes ambiguous in Postgres. The old call then resolves to the new function, and the event `detail` gains `levels`.
- The hold toggle lives in the synced key `content-studio-approval-hold-${scoped(userId)}` as `{ on: boolean, at: string }`; turning it off writes `on: false` and never deletes the key.

### AI and cost

- No model call. Approving is a person's decision, so there is no Jev question here; the MAS check (trust-compliance-check) runs before submission and its flags travel with the post.
- No paid provider and no new cap. Link creation keeps 012's caps (50 links a day). Decisions are capped at 20 per link in SQL, and the `preview-link` function keeps its request-size limit.

### Deep links

- `/drafts?review=<id>` (exists) opens the Share for review panel with the decision status.
- `/review/<token>` (exists) is the public page, decision block included.
- `/team?status=approved` (exists) lists approved posts.
- `/team#approval-rules` scrolls to the TeamCard's rules (new anchor id `approval-rules`), which goes in the /team row of `docs/deep-links.md`.

## Done when

- [ ] Phase A on Leo's two sign-ins: the member's submission shows the sign-off and disclosure lines to the leader, and approval unlocks Copy and Post it for me.
- [ ] Under the rule the Post it for me caption is read-only with the approved label.
- [ ] A schedule request built by hand with an edited caption is refused by `social` with 403 `needs_approval`, and so are one with no `draftId`, one whose `captions` map carries other text, and one with a first comment.
- [ ] A post approved before the change still unlocks Copy and Mark posted, and Post it for me asks for a resubmit.
- [ ] A member with no rule, and every sign-in outside the gate, schedules exactly as today.
- [ ] Phase B, after Leo approves the migrations: a reviewer with no account approves on `/review/<token>`, the adviser sees `Approved by ...` within one reload, and `Ask for changes` refuses an empty note.
- [ ] With the hold on, Copy stays locked until the link is approved; an edit after approval locks it again.
- [ ] With `You, then compliance by link`, posting needs both approvals, client and server.
- [ ] Every decision appears in the post record (trust-archive) once that ships.
- [ ] `npm run build` and the full `npx vitest run` pass; 390 px and 1440 px checked by eye on `/review/<token>`, My posts and Post it for me; `src/data/northStar.ts` flipped in the same commit.

## Tests

- `src/lib/teamReview.test.ts`:
  - `reviewTextForPost` equals `normalizeReviewText(postText(...))`;
  - `deriveReviewState` with two hashes returns approved for either and edited for neither;
  - `postItForMeReason(state, legacyOnly)` gives the resubmit line when only the old hash matches.
- `supabase/functions/social/logic.test.ts`:
  - `reviewNormalize` matches `normalizeReviewText` on CRLF, CR and edge whitespace;
  - `approvalRefusal` covers no rule, rule with nothing submitted, pending, changes requested, rejected, approved on a different hash, and approved on the same hash (null);
  - under the rule it refuses a `captions` entry whose hash differs, a non-empty first comment, and a YouTube title missing from the approved text;
  - an unreadable rule or submission refuses.
  - `isAllowed` already has its tests; add one case with `APPROVAL_GATE_USERS` unset to prove the gate is off.
- `supabase/functions/social/posts.test.ts`: `checkSchedule` keeps a valid `draftId` and refuses one over 200 characters.
- Phase B SQL tests, like 012's and 014's:
  - a decision on a revoked, expired or superseded link fails;
  - `changes_requested` with a blank note fails;
  - the 21st decision on a link fails;
  - decisions cannot be updated or deleted;
  - `levels` accepts only its two values, and the old `cs_set_approval_required` call still works.
- `src/lib/previewLinks.test.ts`: `holdReason(hold, latestDecision, currentHash)` gives each of the four reasons, and null when approved on the same hash.
- Prove each case bites by breaking the code once.

## Open questions

- Should the approval include the sign-off and disclosure lines for everyone, outside the gate too? Phase A assumes yes once Leo turns it on, since that is what goes out. Leo decides when.
- Should a first comment go to the leader as part of the approved text? Phase A leaves it off under the rule, which is the safe and reversible choice. Bringing it in changes the hashed text, so Leo decides.
- Should a compliance officer's link go out by email from the app (Resend is wired in `notify`), with the officer's address remembered per team as Levitate does? Phase B copies the link for the adviser to send. Leo decides.
- Should an approval also schedule the post (FMG, Predis, ContentStudio)? Today the adviser presses Schedule after approval. Leo decides with publish-schedule.
- Should a leader be able to "force publish" past a quiet reviewer, as ContentStudio allows? Left out: it defeats the record.
- Both phase B migrations are schema changes and wait for Leo.

## Related

trust-compliance-check, trust-archive, trust-approved-library, trust-team-push, trust-comments-versions, trust-workspaces, plan-review-queue, publish-schedule, agent-approvals
