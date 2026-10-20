# A permanent record

`trust-archive` | trust | phase 8 | status: partial | /north-star#trust-archive

## Leo asked

No direct ask; from the competitor research.

## How the best do it

Fastlane keeps an activity log. Settings > Activity ("Everything that ran, forever.", reached from Your work > "All activity >") lists every event under "WHEN", "WHAT HAPPENED", "WHO" and "DETAILS", grouped "TODAY" and "EARLIER", with filter tabs "All", "Senna", "You", "Autopilot", "Corrections", "Scheduled runs" and "Strategy". Rows read like "Paid for a video | You | 210 credits | Talking Head UGC: ...", "Competitor added" and "Plan added", and a hover shows "Details >". The Settings index describes it as "Everything that ran, and who ran it."

![Fastlane 5:42](../../../public/north-star/fastlane/t342.webp)

It is a log of actions and credits. No row in the recording holds the text of a post as it went out or who approved it, and no export button shows. Studio > Library lists everything made with status pills "All", "Ready", "Scheduled", "Posted", "Building", "Failed" and a search box, "Search titles, copy and captions" (notes-1, F11).

![Fastlane Studio > Library](../research/fastlane-pdf/lib-tile-00.webp)

The adviser tools treat the record as a product of its own:

- Twenty Over Ten Lead Pilot: "All landing pages and social content deployed through Lead Pilot will be archived to meet FINRA requirements", stored WORM (write once, read many) for at least 7 years. It says plainly what is left out: emails, and anything posted natively on the network. ([what Lead Pilot archives](https://help.twentyoverten.com/en/what-does-lead-pilot-archive), [Lead Pilot](https://help.twentyoverten.com/en/lead-pilot))
- Smarsh captures posts, comments, DMs, reactions, images, videos and metadata with timestamps, in native format, across 100+ channels, for SEC 17a-4, FINRA 3110/4511 and FCA. It handles 40+ million messages a day. Contact sales for pricing. ([social compliance](https://www.smarsh.com/social-media-compliance), [channels](https://www.smarsh.com/channels/social/))
- Proofpoint Patrol hands the normalised content and every supervisory action to any archive, in 17a-4 compliant environments, for LinkedIn, X, Facebook Pages, Instagram Business, YouTube and Google Business Profiles. ([data sheet](https://www.proofpoint.com/uk/resources/data-sheets/patrol))
- Snappy Kraken has "Built-In Archiving & Approval Workflows": content is routed for review, edits lock after approval, and communications are archived in the platform. SOC 2 Type 2. ([campaigns](https://snappykraken.com/campaigns))
- SageContent's Video Board tracks each video from idea to posted, with a Compliance Review stage that keeps approval dates and the reviewing representative. History exports to CSV or DOCX, and teams get one dashboard of every approval and edit. Flex is USD 250 a month. ([site](https://www.sagecontent.ai/), [blog](https://www.sagecontent.ai/blog/best-ai-marketing-tools-financial-advisors))
- Hearsay Social (Yext) connects to the firm's CRM and archive systems. ([datasheet](https://info.yext.com/rs/906-IBA-353/images/Hearsay_Social_Datasheet_2022.pdf))

What to copy: rows that can never change, the text exactly as it went out, who approved that exact text and when, a plain statement of what is and is not recorded, and an export a compliance officer can open.

## What we have today

Checked against origin/main 08537d1.

- The review audit trail. `cs_review_events` (SQL 011, 014) is append-only by trigger and records submitted, approved, changes requested, rejected, joins, leaves and rule changes, each with a content hash. Leaders read it on `/team` (`src/components/team/AuditTrail.tsx`) by Singapore date range (`?from=&to=`) and export CSV (`auditCsv`, file `review-audit-<team>-<from>-to-<to>.csv`, formula-safe cells).
- `cs_review_submissions` keeps each submitted text unchanged, with no foreign key to the user, so it outlives a deleted account. The audit CSV carries each event's content hash, not the text.
- Preview links and their comments stay as rows after a link ends (SQL 012), but `cs_preview_links.owner_id` cascades on account deletion, so they go with the account.
- `social-sweep` (`supabase/functions/social-sweep`, SQL 021) already runs two jobs from pg_cron with the `x-social-sweep-secret` header from Vault: `{"job":"recount"}` daily at 03:15 and `{"job":"orphans"}` on Sundays at 03:45 Singapore time, each with a `dryRun` option.
- My posts keeps `status`, `postedAt`, the Zernio post id, status and live links (`zernio.links`) per draft (`src/lib/draftHistory.ts`). It is no record, though: it holds 50 posts per brand and drops the oldest (`MAX_DRAFTS`), anyone can edit it, and synced deletes have no tombstones.
- Nothing stores the text as it actually went out. Post it for me builds the caption on the device, and the `social` function sends it to Zernio without keeping it. Mark posted only changes the local draft.
- Leo's team posts (`content-studio-teamposts-<uid>`, `postedAt`, `postLink`) and the reels board publisher live outside this flow.

## Build

Gate with `leoOnly(email)` on the nav entry and the page. Everything here rests on one new append-only table, so the whole item stops for Leo before the migration runs.

### Screens and states

A new page, `src/pages/PostRecordPage.tsx` at `/record`, nav entry `{ to: "/record", label: "Post record", icon: ScrollText, owners: LEO_EMAILS }` in the `improve` section beside Team review.

```
Post record                                              (i)   [Export CSV]
[Me | My team]   From [2026-09-21]  To [2026-10-20]   [All platforms v]  [Search text]
-------------------------------------------------------------------------------------
Tue 20 Oct, 10:00  LinkedIn  @leotan   "Most people check their CPF once a year..."
                   Published  |  Approved by Mei Lin, 19 Oct 4:12 pm   [Open live post]
Mon 19 Oct, 18:00  Instagram @leotan   "3 questions to ask before you buy..."
                   Marked posted  |  No approval on record
-------------------------------------------------------------------------------------
                                  [Load more]
```

- `Me | My team`: My team shows only for a team leader and lists every member's rows, each with the member's name.
- Rows, newest first, 50 a page.
- Status chips: `Scheduled`, `Published`, `Marked posted`, `Cancelled`, `Failed`. The approval line reads `Approved by <name>, <when>`, `Approved by <leader> and <reviewer>, <when>` (two levels), or `No approval on record`.
- A row opens a drawer (`?item=<id>`) with:
  - the text exactly as sent, in a read-only box with `Copy text`;
  - media: one line per file with its kind, its link and the first 12 characters of its SHA-256;
  - `Content fingerprint`: the first 12 characters of the content hash, with the full hash in a tooltip;
  - approval: who approved, when, and their comment, plus the submission's own text when it differs from what went out (it should not, after trust-approval);
  - `This post's history`: every row for the same draft, oldest first (Scheduled, then Published);
  - buttons `Print or save as PDF` and `Copy link`. The repo has no PDF library and adding one is a new dependency, so the button calls `window.print()` with an `@media print` stylesheet that shows only the open drawer, laid out as one page; the browser's print dialog saves it as a PDF.
- While it loads, five skeleton rows show with `Loading your record...`.
- Empty: `Nothing went out in these dates.`
- Error: `Couldn't load your record.` with `Try again`.
- Not switched on yet (table missing, `friendlyError` codes): `The post record isn't switched on yet.`
- Export with nothing to export: `There's nothing in these dates to export.`; done: toast `Record exported`.
- Bad dates in the URL fall back to the last 30 days, as the audit trail does.

At 390 px each row stacks: date and platform, then the first line, then the chip and approval line, then `Open live post`, with the filters wrapping and no sideways scroll.

What writes a row (server side only, never the page):

1. Post it for me scheduled: after Zernio accepts the post, `social` writes `scheduled` with the caption sent, the accounts, the media links, the time it goes out and the approval found for that text. It needs the `draftId` that trust-approval phase A adds to the schedule request; a request without one is recorded with `draft_id` = `unknown`.
2. Published or failed: whenever `social` reads a post (action `post`, the status chip's poll) and a platform shows `published` with its link, it writes `published` for that platform once; a failed post writes `failed` once and a cancel that succeeds writes `cancelled`.
3. The daily catch-up: `social-sweep` gets a third job, `{"job":"record"}`, at 03:30 Singapore time. For `scheduled` rows of the last 14 days with no later row, it reads each post from Zernio and writes what happened. `dryRun: true` reports what it would write.
4. Mark posted: My posts, Calendar, Home and Board call the RPC `cs_record_marked_posted` with the text Copy produced (`postText(draft, brand)`) after the local update. On failure the toast reads `Marked posted, but it isn't in your record yet.` with `Try again`.

The approval link at record time: the newest `approved` submission by the owner for that draft whose `content_hash` equals the hash of the text sent. With trust-approval phase B, the newest approved link decision on the same hash is linked too.

### Copy

- Page h1 `Post record`; InfoTip `Every post that went out through the studio, kept unchanged.`
- A second InfoTip beside Export: `Posts made outside the studio are not in this record.`
- Toggle `Me`, `My team`; filters `From`, `To`, `All platforms`, placeholder `Search text`; buttons `Export CSV`, `Load more`, `Open live post`, `Copy text`, `Print or save as PDF`, `Copy link`, `Try again`.
- Status chips use the five labels above, from `Scheduled` to `Failed`.
- Approval lines `Approved by <name>, <D Mon h:mm am>`, `Approved by <leader> and <reviewer>, <D Mon h:mm am>`, `No approval on record`.
- Drawer headings `Text as sent`, `Media`, `Content fingerprint`, `Approval`, `This post's history`.
- States `Loading your record...`, `Nothing went out in these dates.`, `Couldn't load your record.`, `The post record isn't switched on yet.`, `There's nothing in these dates to export.`, `Record exported`, `Marked posted, but it isn't in your record yet.`
- Printed page title `Post record`, with the labels `Posted by`, `Brand`, `Platform`, `Account`, `Went out`, `Live link`, `Approved by`, `Approved at`, `Content fingerprint` and `Text as sent`.

### Data

Stop for Leo: a schema change and a new cron job.

Migration `supabase/hub/0NN_post_record.sql` (the next free number), built on 011's pattern:

- Table `cs_post_record`:
  - `id uuid primary key default gen_random_uuid()`, `owner_id uuid not null` (no foreign key, so it outlives the account), `owner_name text not null default ''`, `team_id uuid references cs_teams(id) on delete restrict` (the owner's team when written, else null), `profile_id text not null default ''`, `draft_id text not null check (char_length(draft_id) between 1 and 200)`;
  - `kind text not null check (kind in ('scheduled','published','marked_posted','cancelled','failed'))`, `platform text not null check (platform ~ '^[a-z0-9-]{1,40}$')`, `account text not null default '' check (char_length(account) <= 200)`;
  - `content text not null check (char_length(content) between 1 and 20000)`, `content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$')`, `media jsonb not null default '[]' check (jsonb_typeof(media) = 'array')` holding up to 20 `{url, kind, sha256}`;
  - `live_url text check (live_url ~ '^https://')`, `zernio_post_id text`, `goes_out_at timestamptz`;
  - `submission_id uuid references cs_review_submissions(id) on delete restrict`, `approved_by text`, `approved_at timestamptz`, `link_decision_id bigint` (filled once trust-approval phase B exists);
  - `happened_at timestamptz not null`, `recorded_at timestamptz not null default now()`.
- `unique (zernio_post_id, platform, kind)` where `zernio_post_id is not null`, so a poll and the sweep never write the same event twice.
- Two indexes serve the page's reads: `(owner_id, happened_at desc)` and `(team_id, happened_at desc)`.
- Append-only and no-truncate triggers copied from `cs_review_events`. Client roles get SELECT only. RLS: the owner reads their own rows; `cs_is_team_leader(team_id)` reads the team's.
- RPC `cs_record_marked_posted(p_draft_id text, p_profile_id text, p_platform text, p_content text, p_posted_at timestamptz)`: authenticated, owner is `auth.uid()`, posted time no later than now and no more than 30 days back, 200 calls a day per user, approval looked up by hash in the same transaction.
- pg_cron: `{"job":"record"}` daily at 03:30 Singapore time, with the secret header 021 uses.

Other storage:

- Media hashes: Post it for me hashes each file with `crypto.subtle.digest` before upload and sends `{url, kind, sha256}` with the schedule request. That call reads the whole file into memory, so a video over 100 MB is sent with `sha256: null` rather than stall a phone. The server stores the hashes as given (the device's claim, labelled so in the drawer); the files stay in Zernio's storage and are not copied (see Open questions).
- The `social` function gets the pure parts in `supabase/functions/social/logic.ts`: `recordRows(view, scheduled)` turns a post view into the rows still missing, and `approvalFor(subs, hash)` picks the approval.
- No `content-studio-` key: the record lives only on the server. The page reads it with RLS through `src/lib/postRecord.ts` (`fetchRecord`, `fetchAllRecord` paged like `fetchAllEvents`, `recordCsv`, `recordCsvFilename`, `approvalLine`).

### AI and cost

- No model call and no Jev question: the record keeps facts and decides nothing.
- No paid provider and no new usage cap. The only extra calls are Zernio reads in the daily sweep, one per unresolved post. The sweep runs on the service key and spends no adviser's `social-read` cap, so it reads at most 500 posts a run and leaves the rest for the next night.
- Storage is about 2 KB a row, so a busy adviser posting twice a day adds under 2 MB a year.

### Deep links

- `/record` with `who` (`me` default, `team`), `from` and `to` (YYYY-MM-DD, default the last 30 days), `platform` (`all` default), `q`; all replace the history entry.
- `?item=<record id>` opens the drawer and pushes a history entry, so Back closes it.
- Builder `links.record({ who, from, to, platform, q, item })` in `src/lib/links.ts`, and a /record row in `docs/deep-links.md`.
- The Calendar and My posts status chip for a published post links to `/record?item=<id>` once a row exists.

## Done when

- [ ] Leo approves the migration and cron job, and both are applied after an independent review.
- [ ] On Leo's sign-in, scheduling a post through Post it for me writes a `scheduled` row with the exact caption, and when it publishes a `published` row with the live link appears, written once even after several polls.
- [ ] A post approved in team review shows `Approved by <leader>` in the record, and one posted after an edit shows `No approval on record`.
- [ ] Mark posted writes a `marked_posted` row with the copied text.
- [ ] A leader's `My team` view lists every member's rows; a member cannot read another member's rows (checked with the anon key and a member token).
- [ ] An UPDATE or DELETE on `cs_post_record` fails for every role, service role included.
- [ ] CSV export over 30 days opens in a spreadsheet with no formula cells, and `Print or save as PDF` gives one readable page per post at A4 and Letter.
- [ ] `social-sweep` `{"job":"record","dryRun":true}` lists what it would write and writes nothing.
- [ ] Other sign-ins see no `/record` and a typed URL shows the 404 page.
- [ ] `npm run build` and the full `npx vitest run` pass; nav tests updated; 390 px and 1440 px checked by eye; `src/data/northStar.ts` flipped in the same commit.

## Tests

- `src/lib/postRecord.test.ts`:
  - `recordCsv` headers and order, with SGT and UTC times and an apostrophe before formula-like cells (reusing `csvCell`);
  - `recordCsvFilename` slugs;
  - `approvalLine(row)` gives each of the three lines;
  - the drawer's print stylesheet hides the nav, filters and list (a render test checks the `print:hidden` classes), so only one post prints.
- `supabase/functions/social/logic.test.ts`:
  - `recordRows` writes `published` per platform with a link, `failed` once, and nothing already written;
  - `approvalFor` picks the newest approved submission on the same hash and ignores pending, rejected and other hashes.
- `supabase/functions/social-sweep/logic.test.ts`: the record job picks only unresolved rows from the last 14 days, and its dry run writes nothing.
- SQL test `0NN_post_record.test.sql`, like 011's:
  - UPDATE, DELETE and TRUNCATE fail;
  - the owner and their leader can read a row, another member cannot;
  - the RPC refuses a future time, a time over 30 days back and the 201st call of a day;
  - the unique index stops a second `published` row for the same post and platform.
- `src/lib/nav.test.ts` and `navRoutes.test.ts`: `/record` maps to one page and stays out of the More sheet for someone@example.com.
- Prove each case bites by breaking the code once.

## Open questions

- How long MAS or an adviser's firm requires these records kept, and whether that needs WORM storage beyond append-only triggers, is for Leo or a compliance adviser to settle; until then rows are kept with no end date.
- Whether to copy each posted image and video into Supabase storage so the record keeps working after Zernio's links expire. It costs storage, so Leo decides; the file hashes still prove what went out.
- Whether to record replies, comments and DMs on published posts, as Smarsh does. That needs the inbox (publish-inbox) and is left out.
- Whether Leo's team posts and the reels board's Instagram publisher should write to the same record. They post outside Content Studio today.

## Related

trust-approval, trust-compliance-check, trust-team-push, trust-comments-versions, learn-reports-export, learn-team-analytics, agent-activity, publish-library, publish-schedule
