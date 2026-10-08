# New tables for four Content Studio features (design, phase 1)

Migrations `supabase/hub/012` to `015`, each with a `.test.sql` beside it. They depend on 011 (live) and are applied by hand, in order, with the 011 test re-run after 014. Nothing here is applied or deployed yet.

The same shape holds for all four. Clients read through RLS (SELECT only) and write through SECURITY DEFINER functions that check `auth.uid()`. anon holds no table privilege and no function EXECUTE. Public pages reach the database through two edge functions deployed `--no-verify-jwt`; each holds the service key and calls only the functions granted to `service_role`. That is the same pattern as `content-studio-mcp`.

## 1. Compliance preview link (s24), 012

- Route: `/review/:token`, a public SPA page outside `ProtectedRoute`. The existing catch-all rewrite in `vercel.json` already serves it.
- Edge function `preview-link`:
  - `GET /preview-link/<token>` calls `cs_preview_link_view` and returns the snapshot plus comments, or 404 for an unknown, expired or revoked token (the caller can't tell which).
  - `POST /preview-link/<token>` with `{name, body, website}` calls `cs_preview_link_comment`. A filled `website` field is the honeypot: the function answers 200 and writes nothing.
  - Body capped at 8 KB, token shape checked before any query, `Cache-Control: no-store`, `X-Robots-Tag: noindex`, CORS limited to the app origins.
- Public: only what the adviser chose to share, snapshotted when the link is made (sender name, title, platform, format, text) and the comments. No account id, draft id or email leaves the server. With no name given, the page says "Your adviser".
- Token: 32 random bytes, base64url, shown once. Only its SHA-256 is stored. A link lasts 14 days by default (1 to 30) and can be revoked. Revoking is a server update, never a synced key.
- Caps: 50 links per adviser per 24 h. Per link, 50 comments per 24 h and 300 in total, with the adviser's replies counted. Name 1-80 characters, comment 1-2,000. The count runs under a row lock, so parallel posts can't overshoot.
- In the app: My posts shows comments under each shared post, a reply box (`cs_reply_preview_link`), "Share new version" (a new link; the old page then says a newer version exists) and "Turn off link". The page sets `referrer: no-referrer` so the token never leaks through a link in the post.

## 2. Team comments with @mentions (s25), 013

- No public surface. RPCs: `cs_add_review_comment(submission, body, mentions[])` and `cs_mark_review_mentions_seen(submission)`.
- Who reads a thread: the author, the team's leaders, and current teammates who were mentioned in it. A mentioned teammate can also read that one submission. Only the author or a leader can bring a new person in, so a draft never spreads further than they chose.
- Comments are append-only, like the audit trail.
- Caps: 2,000 characters, 10 mentions per comment, 60 comments per person per hour.
- Team page: "Mentioned you (n)" counts unseen mention rows. Opening the thread marks them seen.

## 3. Approval rules (s23), 014

- Adds status `rejected`, which needs a reason and is final. The author can still submit a new version. Also adds event kinds `rejected` and `approval_rule_set`.
- `cs_review_submission` is replaced with the same signature. The live body was checked identical to the 011 file first. One 011 test (8.4) used `rejected` as its example of an unknown decision and now uses `binned`.
- `cs_team_approval_rules`: one row means that member needs approval before posting. Only leaders of the member's current team change it (`cs_set_approval_required`), never on themselves, and every change is logged. The member and the leaders read it; other members don't see who is on approval. The rule survives leaving and rejoining.
- Gate: for a member with a rule, Copy and Mark posted stay locked until the post's latest submission is approved and its text unchanged. Posting happens outside the app, so the gate is client-side and the table is the record.

## 4. Link-in-bio (s53), 015

- Route: `/l/:slug`, a public SPA page.
- Edge function `link-in-bio`:
  - `GET /link-in-bio/<slug>` returns name, line, photo and link labels and ids (no URLs), with `Cache-Control: public, max-age=60`.
  - `GET /link-in-bio/<slug>/<linkId>` sends a 302 to the stored URL and counts the click. An unknown link goes to the page instead. The redirect never takes a URL from the request, so it is not an open redirect. User agents that look like bots or link previewers are sent on without counting (`p_count = false`).
- Saved URLs must be http(s) with no spaces, control characters or `user@` part.
- Caps: 10 pages per account, one per brand profile, 20 links per page, label 1-60, URL up to 2,048 characters, photo a PNG/JPEG/WebP data URL of up to 350,000 characters (the brand kit's cap). Clicks are counted up to 5,000 per link per Singapore day; after that the redirect still works but stops counting.
- In the app: an editor prefilled from the brand kit (name, role, photo), the slug, the links, a publish switch, and clicks for the last 7 and 30 days. It lists every page on the account, so a page left behind by a deleted profile can still be deleted (`profiles.ts` is off limits).

## Proof

Run on a throwaway Postgres 18 with a Supabase stand-in that copies the live default grants (new tables, functions and sequences granted to anon, authenticated and service_role), so every revoke is exercised:

- 011 then 012-015 applied, each twice to show it is idempotent.
- All five test files pass: 011 again after 014, then 012-015.
- 15 sabotage runs: each removes one guard (an anon revoke, the revoked-link filter, the comment cap, an owner policy, the mention widening rule, current-membership, the team-only mentions, cross-team rule changes, the rejection reason, rule visibility, URL scheme, `user@`, published, the click cap). Each one turned its test red.
