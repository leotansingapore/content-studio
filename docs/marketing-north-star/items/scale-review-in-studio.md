# Creator videos are reviewed inside Content Studio

Status: todo
App all apps, owner Claude, phase 7 (Scale what won).

## Why

Kenyon of Sideshift (37:09 to 37:56) describes rebuilding Sideshift from "a high volume creator marketplace with infrastructure to track, manage, and pay your creators" into one that also runs creators' "organic winners as paid ads". The creators, the review and the ads end up in one tool. On review itself (15:54): "I strongly believe in reviewing every single video before it goes live", so that "we're not just burning cash on videos" that will not convert. The review step is lifted only for creators who have proven they are self-sufficient.

The card's `why` cites Kenyon at 43:21 for "the platform that holds the creators, the reviews and the ads is the one that scales". He does not say that there; 43:13 is the start of his Sideshift V3 demo. The quotes above are the nearest things he does say.

The pilot starts in a Lark Base. Once five creators post every week, Leo's daily review is spread across Lark, chat apps and video links. Content Studio already has most of a review flow, so bringing creators into it gives one place for the video, the notes and the approval record.

## What we have today

Checked 26 Oct 2026 in this repo (b41ebf81).

- Team review, live. Members submit a draft to their team leader, who approves, asks for changes or rejects, and every step lands in an append-only audit trail. Schema: supabase/hub/011_team_review.sql (cs_teams, cs_team_invites, cs_team_members with roles leader and member, cs_review_submissions, cs_review_events), 013_team_comments.sql (threads and mentions) and 014_approval_rules.sql (reject, and a per-member "needs approval before posting" rule that locks Copy and Mark posted until the latest submission is approved and unchanged). Client logic: src/lib/teamReview.ts. Screens: src/pages/TeamPage.tsx at /team, with src/components/team/ReviewQueue.tsx, ReviewThread.tsx, DraftReviewControl.tsx ("Submit for review" on a My posts card), AuditTrail.tsx, LeaderView.tsx and MemberView.tsx. A submission deep-links as /team?post=<submission id> (docs/deep-links.md).
- Its limits for creators: a submission holds text only (the caption, platform, format and compliance flags) with no video and no posted URL, and cs_team_members.user_id is unique, so a person can be in one team only.
- Compliance preview links: /review/:token (src/pages/PreviewReviewPage.tsx, supabase/functions/preview-link, supabase/hub/012_preview_links.sql, src/lib/previewLinks.ts) let a manager or compliance officer read a shared post and comment without signing in.
- The posts board: /reels and /reels/team (src/lib/reelsBoard.ts, src/pages/ReelsTeamPage.tsx, supabase/functions/team-board, supabase/hub/022_board_members.sql and 023_board_invites.sql, docs/team-roles.md). It has video cards with versions, notes, stages from review to posted, and roles per brand. Its videos are written by the reels pipeline on Leo's Mac, and approved cards publish to our own Instagram accounts. A creator cannot upload to it, and a creator's post goes out on their own account, so it suits our reels and does not suit creator submissions.
- Checks already in the repo: scanCompliance (supabase/functions/_shared/compliance.ts, used through src/lib/compliance.ts) and Jev's MAS question (supabase/functions/_shared/mas.ts, warn at 0.5, through _shared/jev.ts pinned jev-1.13.0).
- Content Studio stores no video of its own. Uploads go to Zernio at posting time (presignUpload in src/lib/autoPost.ts), and Zernio posts only to accounts connected in Content Studio (supabase/functions/social, docs/zernio-connection.md).
- Tracked links (/links, docs/tracked-links.md) can give each creator a /t/<slug> link.

The card's `ours` line ("approves its own AI makes ... takes no outside submissions") misses team review, which already takes submissions from other people. What is missing is video, a posted link, and a way in for creators who sit in another team. Its `build` line says approved posts schedule through Zernio; a creator's video posts on the creator's own account, which Zernio can reach only if that creator connects it to Content Studio.

## What to do

1. Claude waits for the trigger: five creators posting weekly through the Lark roster. Then Claude writes the migration below and stops for Leo's yes, because it changes the schema.
2. Claude writes supabase/hub/025_creator_submissions.sql in the shape of 011 to 024, with a test file beside it (025_creator_submissions.test.sql). It adds two nullable columns to cs_review_submissions: `media_url` (https only, up to 2,000 characters, a link to the video file) and `posted_url` (https only, filled after posting). It replaces cs_submit_for_review with the same signature plus `p_media_url`, so the content hash covers the caption and the video link together; changing the link after approval then drops the approval. It adds a `cs_mark_review_posted(submission, url)` function for the author and the event kinds `posted` and `media_changed`. It is applied to the academy project through the Management API, like 011 to 024, after the test file passes.
3. Leo creates one team, "Creators", and makes its invite link. He turns on "needs approval before posting" for every creator in it (014). A creator signs in with an academy login and joins with the code. An adviser already in another team is the case in Open questions.
4. Claude adds a video form to the member side (MemberView and DraftReviewControl): video link, caption, platform, then "Submit for review". The status and Leo's notes show on the same card, using the existing thread from 013.
5. Claude changes the leader side (ReviewQueue and LeaderView): the video plays inline when the link is a direct file or a Drive preview, and opens in a new tab otherwise. Beside it sit six checklist chips from pilot-review (hook, pace, dead space cut, story, natural CTA, compliance line) that Leo ticks and that are saved into the review comment. Jev's MAS check runs on the caption and warns without blocking; Leo decides. Approve, changes and reject work as they do today.
6. After approval the creator posts from their own account with the collab tag, then pastes the post link into the card, which records `posted_url` and a `posted` event. A creator who has connected their account to Content Studio may schedule it from Content Studio instead, and the link fills in when it posts.
7. Pay stays in the Lark roster for now. Each month Claude exports the Creators team's approved submissions from the audit trail CSV (buildCsv in teamReview.ts) and Leo pays from it.
8. The gate: the video fields and the Creators team only appear for a team whose leader passes `leoOnly`, checked again on the server by the submit function against the team owner. Gating on the viewer alone would hide the form from creators, who are not Leo. Nothing changes for other teams until Leo says "on for everyone".
9. Claude runs `npm run build` and the full `npx vitest run`, checks /team as leader and as creator at 390 px and 1440 px, then pulls with rebase and pushes.

## Done when

- Leo said yes to the migration before it was applied, and the SQL test file passes against it.
- A creator in the Creators team submits a video link and caption, and Leo sees it in his queue with the video playing or one tap away.
- Changing the video link after approval sets the card back to needing review.
- Leo's ticked checklist and notes appear in the creator's thread, and the audit trail shows submitted, approved and posted with times.
- Every approved video has a posted link within two days, or shows as not yet posted.
- Teams not led by Leo see no change.

## Open questions

- Approve the schema change (two nullable columns, one replaced function, one new function, two event kinds)? Recommended: yes. Putting the link inside the caption text would avoid the migration, but it would make the approval hash and the posted record guesswork.
- A video link, or an upload into Content Studio? Recommended: a link first (Drive or Dropbox). An upload means a new storage bucket and its policies, and is only worth it if creators keep sending links that do not play.
- An adviser who is already in their agency's team cannot join a second one. Recommended: if the pilot's advisers are in a team Leo leads, review them there; otherwise ask Leo before changing the one-team rule, since 011 relies on it.
