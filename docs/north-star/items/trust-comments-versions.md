# Comments and version history

`trust-comments-versions` | trust | phase 8 | status: partial | /north-star#trust-comments-versions

## Leo asked

No direct ask; from the competitor research.

## How the best do it

Fastlane shows neither comments nor a draft history in Leo's recording; the nearest thing it has is Settings > Activity, "Everything that ran, and who ran it", a log of runs and spend that belongs to agent-activity.

- Planable puts Google Docs style review on social posts: internal comments, paragraph annotations, text suggestions and "Resolve comments", plus "Team-only draft posts" and "Team-only notes" on Pro. Version history shows who changed what and can revert, kept 1 week on Basic, 30 days on Pro and without limit on Enterprise. ([features](https://planable.io/features/), [pricing](https://planable.io/pricing/))
- Foreplay: the ad details drawer has a Comments tab to add or read notes on a saved ad, and the comments show on every public shared board holding that ad. Board-level comments are on the roadmap; mentions and notifications are unverified. ([help](https://help.foreplay.co/articles/7962603-commenting))
- Typefully: comments on drafts with @mentions, Slack alerts for comments, and "Draft Activity", which logs every change with who made it and where it came from. ([changelog](https://typefully.com/changelog), [collaboration](https://typefully.com/changelog/collaboration-52))
- InVideo: a shareable review link takes frame-accurate comments the agent can act on, and edits can be branched, tagged and rolled back. ([editor](https://invideo.io/news/introducing-invideo-editor/))
- OpusClip Agent Opus keeps a version history and "Reimagine" makes a new version in another style while keeping the original. ([faq](https://help.opus.pro/agent-opus/article/ao-faq.md))

## What we have today

- Team review threads (`cs_review_comments`, SQL 013; `src/components/team/ReviewThread.tsx`): comments of up to 2,000 characters on a submitted post, @mentions, append-only, 60 per person per hour. They sit on the submission and never mark a line, suggest a change or get resolved.
- Preview link comments (`cs_preview_comments`, SQL 012; `/review/:token` in `src/pages/PreviewReviewPage.tsx`; `src/components/review/PreviewLinkPanel.tsx`): a reviewer without an account comments on a snapshot, the adviser replies from My posts, and a comment on an older snapshot is labelled "On an earlier version". Each side is capped at 50 a day and 300 in total per link. Comments carry no line marks, suggestions or resolve.
- Leo's posts board (team-board, docs/team-roles.md) has notes with "Resolve" (own notes, or any note for Leo) on MoneyBees board cards. It does not reach Content Studio drafts.
- Write keeps one level of Undo (`undoText` in `src/pages/GeneratePage.tsx`, line 749), in memory only. It is set by `acceptRewrite` (one-tap rewrites, flagged-line rewrites and the assistant's `?ask=` change), `cutHashtags` and `cleanDraft` (lines 2000-2032), and each of those then calls `persistDraftEntry`. A draft (`DraftEntry`, `src/lib/draftHistory.ts`) has no history: each save overwrites it.
- My posts already opens a draft's preview link panel with the reviewer's comments and replies (`/drafts?review=<id>`, `PreviewLinkPanel.tsx`).
- Team review submissions are immutable, so each version sent to a leader is kept with its hash and the leader's decision, though drafts that were never submitted leave no trace.
- Saved swipe posts (`src/lib/savedItems.ts`) have no notes, and ads cannot be saved yet (find-save-anywhere).

## Build

Gate: the History and Comments panels and item notes show only when `leoOnly(email)` for the adviser. On /team the line-comment button shows only when the signed-in leader passes `leoOnly(email)`. A reviewer on `/review/:token` has no account, so line comments show only on links made by a Leo account. `cs_preview_link_view` does not return the owner, so the preview-link function reads `owner_id` from `cs_preview_links` by the token's hash with the service key it already holds (service_role keeps its default grant on that table, SQL 012 line 40; no SQL change). It compares that id with Leo's two uids (40f07a18-b087-4c95-ba1f-d5444222968a and 13b28b1d-2ecb-40be-b3a9-aefc90366f9b, a constant in `supabase/functions/preview-link/logic.ts`) and returns `marks: true`. The owner id itself never goes into the public response.

Three parts, none needing a schema change: a version history per draft, line comments with suggested edits on the two review channels that exist, and a private note on any saved post or ad. Shared notes for teammates come with trust-workspaces Step 2.

### Screens and states

1. History panel in Write (`?panel=history`), opened from a "History" button with a clock icon beside Copy. A right-side panel on desktop and a full-screen sheet on phones, built like `PostDetailDrawer`.

```
History                                           [x]
 Today
  14:32  Your edits             +12 -3 words
  14:05  AI rewrite: Shorter    +4 -40 words      Approved by Mei
  13:58  Written by AI
 ------------------------------------------------
  14:05  AI rewrite: Shorter
  We all [-want to-] retire early. ...  [+start at 25+]
 [ Compare with now ]           [ Restore this version ]
```

- List: newest first, grouped "Today", "Yesterday" and dates, each with time (Singapore), what happened, and words added and removed against the version before.
- Picking a version shows its word diff against the one before it; "Compare with now" diffs it against the current draft instead.
- A version whose text hashes the same as an approved team submission shows "Approved by {leader}" (`reviewHash` against `latestSubmissionByDraft`).
- "Restore this version" puts its hook and text back into Write, records a new version, and toasts "Restored." with Undo.
- Empty: "No earlier versions yet." The InfoTip on the panel title: "Keeps the last 20 versions of each post."
- A version is recorded when:
  - Write first saves a generated post: "Written by AI", or "Written from @{ref}'s post" when the brief came from a remix with `ref`;
  - a one-tap rewrite, "Clean AI tells" or a hashtag trim is applied: "AI rewrite: {preset}", "Cleaned AI tells", "Hashtags trimmed" (call `recordVersion` next to `persistDraftEntry` in `acceptRewrite`, `cleanDraft` and `cutHashtags`);
  - an `?ask=` rewrite from the assistant is applied (it also lands in `acceptRewrite`, with `RewriteId` "ask"): "Assistant: {first 6 words of the ask}";
  - typed changes differ from the latest version and 2 minutes pass without typing, or the adviser leaves Write, opens another draft, presses Copy, Post it for me, "Submit for review" or "Share for review": "Your edits";
  - a restore or a suggestion is applied: "Restored the {HH:mm} version", "Suggestion from {name}";
  - an Undo is pressed: "Undo".
  Nothing is recorded when the hook and text equal the latest version.

2. Line comments for reviewers, on `/review/:token` and in the leader's queue on /team:
- Selecting text inside the post shows a floating "Comment on this" button. It puts the selection, up to 280 characters, above the comment box as a quote with a small x to clear it.
- A "Suggest a change" toggle under the quote opens a second box, pre-filled with the quote, for the new wording (600 characters).
- The comment is sent through the existing calls (`cs_preview_link_comment` via the preview-link function, and `cs_add_review_comment`) as one plain-text body:

```
> {quote}
Suggest: {new wording}
{comment}
```

  It stays readable as plain text on the public page and in the /team thread, which is append-only and part of the review record (SQL 013). The audit trail CSV (`auditCsv` in `src/lib/teamReview.ts`) lists `cs_review_events` only, and comments create no event, so comments and resolves are not in that CSV today. On /team, @mentions are read from the comment part only.

3. Comments panel in Write (`?panel=comments`), opened from a "Comments" button with the open count as a badge:

```
Comments (2 open)                                  [x]
 Mei, leader  14:20
   "returns of 8% a year"
   - returns of 8% a year
   + returns that have varied over the years
   Please don't quote a rate.
   [Apply suggestion]  [Resolve]  [Reply]
 Tan (compliance), via preview link  13:10
   "Act now"   This line has changed since.
   Too pushy.
   [Resolve]  [Reply]
 Resolved (3)  v
```

- Sources: comments on preview links whose `draft_id` is this draft (`fetchMyPreviewLinks`), and the threads of this draft's team submissions (`fetchMySubmissions`, then `fetchThread`).
- The quote is highlighted in Write's preview at its first exact match. If it is no longer in the draft: "This line has changed since."
- "Apply suggestion" swaps the first exact match for the new wording, records "Suggestion from {name}", and replies "Resolved #{id}: applied the suggestion." on the same channel. Without a match the button is disabled with the reason "This line has changed since."
- "Resolve" replies "Resolved #{id}" on the same channel, so the reviewer sees it and the thread keeps it; the comment moves to "Resolved". "Reopen" there replies "Reopened #{id}". The latest of the two wins.
- "Reply" uses the existing reply calls: `cs_reply_preview_link` (`src/lib/previewLinks.ts` line 173) for a preview link and `cs_add_review_comment` (`src/lib/teamReview.ts` line 754) for a team thread. Resolve, Reopen and Apply suggestion send through the same two calls.
- Loading: "Loading comments..." with a skeleton. Failed: "Couldn't load comments." with "Try again". Over a reply cap: the server's own refusal text under the button.
- Empty: "No comments yet." with the two existing actions, "Share for review" (opens PreviewLinkPanel) and "Submit for review" (DraftReviewControl) when the adviser is in a team.

4. Notes on saved posts and ads:
- In `PostDetailDrawer` (swipe posts) and on each `AdsSwipe` card: "Add a note" opens a 500-character box with "Save note"; a saved note shows as "Your note" with "Edit" and "Remove".
- Saved within 400 ms with the toast "Note saved."

### Copy

- History: "History", "Today", "Yesterday", "+{n} -{m} words", "Compare with now", "Compare with the one before", "Restore this version", "Restored.", "Undo", "No earlier versions yet.", InfoTip "Keeps the last 20 versions of each post.", "Approved by {leader}"
- Version labels: "Written by AI", "Written from @{ref}'s post", "AI rewrite: {preset}", "Cleaned AI tells", "Hashtags trimmed", "Assistant: {words}", "Your edits", "Restored the {HH:mm} version", "Suggestion from {name}", "Undo"
- Reviewer side: "Comment on this", "Suggest a change", placeholder "How should it read?", existing "Comment" button unchanged
- Comments panel: "Comments", "Comments ({n} open)", "via preview link", "Apply suggestion", "Resolve", "Reopen", "Reply", "Resolved ({n})", "This line has changed since.", "Loading comments...", "Couldn't load comments.", "Try again", "No comments yet."
- Reply bodies: "Resolved #{id}", "Resolved #{id}: applied the suggestion.", "Reopened #{id}"
- Notes: "Add a note", "Save note", "Your note", "Edit", "Remove", "Note saved.", placeholder "What to borrow from this"

### Data

- Versions: `content-studio-draftversions-${scoped(userId)}` = `Record<draftId, Version[]>`, oldest first. `Version = { id: string; at: string; by: "you" | "ai" | "assistant" | "reviewer"; label: string; hook: string; text: string }`; the id is base-36 time plus a random tail. The key name holds only the scoped user id, so `isSyncedKeyFor` in `src/lib/cloudSync.ts` (which reads key names, not values) uploads it like the drafts key. Sync is last write wins per key, so two devices editing at once keep the later device's list.
- Limits: 20 versions per draft and 400,000 characters for the key. Over that, the oldest middle versions of the oldest drafts go first; each draft keeps its first and newest. Versions of drafts no longer in the drafts store are dropped on the next write. They are not security state, so a version that comes back from another device is harmless.
- New `src/lib/draftVersions.ts`: `recordVersion`, `versionsOf`, `restoreVersion`, `pruneVersions`. New `src/lib/textDiff.ts`: a word-level LCS diff, with inputs over 3,000 words shown whole and no diff. No new npm dependency.
- Comments: no new storage. New `src/lib/reviewComments.ts` (the file does not exist yet) with `composeReviewComment({ quote, suggestion, text })` and `parseReviewComment(body)` returning `{ quote?, suggestion?, text, resolves?: number, reopens?: number }`, plus `openComments(comments)`. The body limit stays 2,000 characters (`cs_review_comments` and `cs_preview_comments` both check 1-2,000); the quote is cut at 280 and the suggestion at 600 before composing.
- `PreviewReviewPage.tsx` and `ReviewThread.tsx` get the selection button and the two fields. The preview-link function (`supabase/functions/preview-link/index.ts`, GET) adds `marks: boolean` to its public response, as set out under Gate.
- Notes: `content-studio-itemnotes-${scoped(userId)}` = `Record<string, { text: string; at: string }>`, keyed `post:{advisorId}-{shortCode}` (the `topPosts` id in `src/lib/savedItems.ts`) or `ad:{adId}` (`SwipeAd.adId` in `src/lib/adsSwipe.ts`), at most 200 notes. New `src/lib/itemNotes.ts`.
- No schema change.

### AI and cost

- No AI call and no Jev question. The diff, the comment parser and the resolve replies are plain code.
- No paid call, so nothing to price and no new cap. Resolve and Reopen replies count against the existing limits, 60 team comments per person per hour (SQL 013) and 50 a day or 300 in total per preview link side (SQL 012).

### Deep links

- `/generate?draft=<id>&panel=history` opens the History panel (push); `&version=<version id>` also selects that version (push).
- `/generate?draft=<id>&panel=comments` opens the Comments panel (push); `&comment=<source>-<id>` scrolls to and highlights one comment, where source is `preview` or `team`.
- `panel` already exists on /generate (shortcuts, post), so add `history` and `comments` to its row in docs/deep-links.md, plus rows for `version` and `comment`; builders `draftHistoryUrl` and `draftCommentUrl` in `src/lib/links.ts`.
- The Team page and My posts link a comment to `draftCommentUrl` so a leader's note opens on the exact line.

## Done when

- [ ] On Leo's sign-in, Write shows "History" and "Comments"; other sign-ins see Write as before.
- [ ] Writing a post, applying "Shorter", typing, and waiting 2 minutes leaves three versions with the right labels and word counts; "Restore this version" brings one back and Undo reverses it.
- [ ] The versions appear on a second device after sync, and a draft with 25 saves keeps 20.
- [ ] On a preview link made by Leo, selecting a line and suggesting a change sends one comment; in Write it shows the quote, the suggestion, and "Apply suggestion" swaps the line and replies "Resolved #{id}: applied the suggestion.", which the reviewer then sees on the link.
- [ ] A leader's line comment from /team shows in the author's Comments panel; "Resolve" adds the reply to that thread, and the leader sees it on /team.
- [ ] A comment whose line was since edited shows "This line has changed since." and its Apply button is disabled.
- [ ] A note on a swipe post and on an ad card saves, shows "Your note", and survives a reload.
- [ ] `npm run build`, the full `npx vitest run`, and a by-eye check at 390 px and 1440 px pass.
- [ ] `src/data/northStar.ts` item `trust-comments-versions` flipped to live with its `ours` line, in the same commit.

## Tests

- `src/lib/draftVersions.test.ts`: no version when hook and text are unchanged; 20 per draft; the size budget trims middle versions of the oldest drafts and keeps each draft's first and newest; versions of a removed draft go; a key built for a brand passes `isSyncedKeyFor`.
- `src/lib/textDiff.test.ts`: counts added and removed words; equal texts give no change; over 3,000 words gives no diff.
- `src/lib/reviewComments.test.ts` (new):
  - `composeReviewComment` and `parseReviewComment` round-trip, also with a quote but no suggestion;
  - a plain comment starting with ">" mid-text is not read as a quote;
  - "Resolved #12" then "Reopened #12" leaves 12 open;
  - the composed body never exceeds 2,000 characters;
  - `extractMentions` reads only the comment part.
- `src/lib/teamReview.test.ts`: `cs_review_normalize` rules in `normalizeReviewText` keep the inner newlines the parser needs.
- `supabase/functions/preview-link/logic.test.ts`: the owner check gives `marks` true only for Leo's two uids, false for any other id or a missing one, and the public response never carries `owner_id`.
- `src/lib/itemNotes.test.ts`: 500-character clip, 200-note limit, remove.
- Prove each case bites by breaking the code once.

## Open questions

- Leo: comments and versions shared with teammates inside one workspace wait for trust-workspaces Step 2 (schema). Until then a draft's history is the adviser's own, and comments come from reviewers through the two existing channels.
- Whether a Block rule from trust-compliance-check should stop Copy while a comment is still open. This spec only shows the count.
- Leo: whether comments and resolves belong in the team audit CSV. That needs a `commented` kind in `cs_review_events` and a change to `cs_add_review_comment`, a schema change; this spec leaves the CSV as it is.
- If Leo later wants real columns for quote, suggestion and resolved state, that is a migration on `cs_review_comments` and `cs_preview_comments`; the plain-text body format here can be read into them.

## Related

trust-approval, trust-workspaces, trust-archive, trust-team-push, agent-activity, edit-text-post, find-save-anywhere, remix-source-trail, plan-review-queue
