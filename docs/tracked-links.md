# Tracked links and campaign reports (g39, g40), 019

Migration `supabase/hub/019_tracked_links.sql`, tests in `019_tracked_links.test.sql`. Reviewed independently (approve with changes, fixes F1-F4 below are in), then applied to academy on 2026-10-11 through the Management API, like 011-018. Migration 020 (`020_bio_slug_holds.sql`) gives link-in-bio the same hold when an account is deleted.

Only members make links: `cs_save_tracked_link` refuses an account where `hub_is_member()` (001: admin, client or active) is false, because the redirect sits on the app's own host. Deleting a link and the report switch need no membership, so a lapsed member can still clean up.

It follows 015 (link-in-bio): clients read through RLS (SELECT only) and write through SECURITY DEFINER functions that check `auth.uid()`. anon holds no table privilege and no function EXECUTE. The public side goes through one edge function deployed `--no-verify-jwt` that holds the service key and calls only the two functions granted to `service_role`.

## What an adviser gets

- A short link `/t/<slug>` for any web address (an offer, a guide, a form), with a label and an optional campaign name. The slug is theirs to pick, or a random 10-character one.
- Taps per link per Singapore day, and people: a person counts once per campaign (once per link for a link outside a campaign), however often they tap.
- A public report per campaign, off until switched on. It shows the campaign name, total taps and people, the last 7 days, and each link's label, host (no path, query string or fragment: a path can name the adviser or carry a Drive or Docs share id), taps and people. Nothing about the adviser beyond the campaign name.

## Tables

| Table | Holds | Client access |
| --- | --- | --- |
| `cs_tracked_links` | owner, campaign, slug, label, URL | owner SELECT (RLS) |
| `cs_tracked_link_campaigns` | owner, name (unique per owner ignoring case), report slug or null | owner SELECT (RLS) |
| `cs_tracked_link_days` | per link per day: taps, new people | owner SELECT (RLS) |
| `cs_tracked_link_visitors` | one 32-byte hash per person per campaign, the link and day of the first tap | none |
| `cs_tracked_link_slug_holds` | released slugs, who released them and when (set 335 days ahead for a deleted account, so its hold lasts a year); no foreign key, so a hold outlives its account | none |
| `cs_tracked_link_salt` | one 32-byte random salt, made on first apply and kept | none, not even `service_role` |

A campaign exists while it has a link: saving or deleting deletes the caller's campaigns left with none, report included. Moving or deleting the last link of a campaign whose report is on therefore kills that report link; the screen must say so before the save. A link that moves to another campaign keeps its daily counts, so the new campaign's report includes its earlier taps and people.

## Functions

Owner (authenticated, each checks `auth.uid()` and the row's owner):

- `cs_save_tracked_link(p_id, p_slug, p_label, p_url, p_campaign)`: creates (`p_id` null) or edits. A blank slug keeps the current one on an edit, or picks a random one for a new link. A blank campaign takes the link out of its campaign.
- `cs_delete_tracked_link(p_id)`: deletes the link with its counts and the people first seen on it.
- `cs_set_tracked_link_report(p_campaign_id, p_on)`: on makes a random 20-character report slug (100 bits) or keeps the current one; off deletes it, so an old report link never works again.

Slug holds come from one trigger, `cs_tracked_links_hold_slug` (function `cs_tracked_link_hold_slug`, SECURITY DEFINER), before every delete or slug change on `cs_tracked_links`: the owner's delete or rename, a direct delete, and the cascade when an account is deleted. It takes the slug's advisory lock, so a grab waits until the release commits and then sees the hold.

- Released by its owner: held from everyone else for 30 days; the owner can take it back.
- Released because the account was deleted: held for a year (`released_at` set 335 days ahead, so the 30-day check and the prune job need nothing else), because the account's bio and post links may stay up long after it is gone. Nobody can take it back; the prune job drops it after the year.
- No per-account cap on holds: each rename or delete holds one more slug for 30 days (as 015), so the table is bounded by 30 days of saves.

Public (`service_role` only, called by the edge function):

- `cs_tracked_link_click(p_slug, p_visitor, p_count)`: returns the stored URL or null. Counts the tap unless the link has 5,000 today. `p_visitor` is the visitor key below; a missing or malformed one counts the tap but no person. `p_count = false` counts nothing.
- `cs_tracked_link_report_public(p_report_slug)`: the report JSON (`campaign`, `clicks`, `people`, `days[7]` of `{day, clicks, people}`, `links[]` of `{label, host, clicks, people}`, most tapped first), or null.

## Unique people

- The edge function computes the visitor key and never sends the raw IP to the database: SHA-256 hex of `v:<ip>|<user agent>`, else none. It never logs the key or the IP. No `?r=` per-recipient token until the app mints them; when it does, sign each one (HMAC with an edge secret) and check the signature before using it as the key.
- The database stores SHA-256(salt, scope, key), where scope is the link's campaign id, or the link id outside a campaign. One person therefore counts once per campaign, and the same person cannot be matched across campaigns or advisers.
- Visitor rows are deleted 90 days after the first tap (daily job `tracked-link-prune`), so a person who comes back after that counts again. The daily counts stay.
- A visitor who changes user agent or IP counts as a new person; the caps below bound it.

## In the app

- Playbook > Tracked links (`/links`, `src/pages/TrackedLinksPage.tsx`, `src/lib/trackedLinks.ts`): a member makes a link (address, label, optional campaign and short address; Brand kit offers fill it in one tap), copies the `/t/` address, sees clicks and people per link for 7 or 30 days with a daily chart, renames a link or moves it to another campaign, deletes it (confirm), and switches each campaign's public report on or off, with its address. Deleting or moving the last link of a campaign whose report is on says first that the report goes too.
- Someone who is not a member sees one line saying tracked links come with membership; links they already have stay listed, so they can still copy or delete them.
- `/t/report/<report slug>` (`TrackedReportPublicPage.tsx`): the public report, no sign-in, `noindex`. It shows only what the report JSON holds.

## Edge function (tracked-link)

`supabase/functions/tracked-link`, deployed `--no-verify-jwt` like link-in-bio; it holds the service key and calls only the two `service_role` functions.

- `GET /tracked-link/<slug>`: checks the slug shape before any query, computes the visitor key, sends bots and link previewers on with `p_count = false` (`isBot` from `link-in-bio/logic.ts`) and counts only on GET, never HEAD. It re-parses the returned URL with `new URL()`, follows only http(s) (`safeRedirectUrl`) and answers 302 with `Cache-Control: no-store`. An unknown slug gets a plain-text 404 (Supabase serves `text/html` from a function as `text/plain`, so there is no HTML page).
- `GET /tracked-link/report/<report slug>`: checks `^[a-z0-9]{20}$` first, returns the JSON or 404, `X-Robots-Tag: noindex`, `Cache-Control: no-store` (switching a report off works at once).
- `/t/<slug>` on the app host is a `vercel.json` rewrite (before the SPA catch-all) to the function; Vercel passes the 302 through. The public report page is the SPA route `/t/report/<report slug>`, which the one-segment rewrite does not catch.
- Errors are logged by code only: no slug, key or IP reaches the log.

### Which IP the function sees (measured 2026-10-11)

A temporary build of the function compared each header with the caller's own address and answered yes or no (no address was returned or logged), called through `/t/` on production and directly:

- Through the `/t/` rewrite, `x-forwarded-for` (3 entries) and `cf-connecting-ip` hold Vercel's servers, never the visitor. `x-vercel-proxied-for` held the visitor every time, including with forged `X-Forwarded-For`, `X-Vercel-Forwarded-For`, `X-Vercel-Proxied-For`, `Forwarded` and `X-Real-IP` sent together (6 of 6). `x-vercel-forwarded-for` carried the visitor's forged value in 6 of 10 forged requests. There is no `x-real-ip`.
- Direct to the function, Supabase's gateway rewrites `x-forwarded-for`: its first entry and `cf-connecting-ip` are the caller even when forged. Forged `x-vercel-*` headers do pass through on a direct call.
- Live check with a test link (2026-10-11, IPv4): the same browser user agent through `/t/` twice and then directly to the function counted 3 taps and 1 person; a second user agent made 2 people; curl's user agent and a HEAD request counted nothing and were still sent on (302); forged `X-Vercel-Proxied-For`, `X-Vercel-Forwarded-For` and `X-Forwarded-For` through `/t/` counted the tap but no new person.
- So `clientIp` takes `x-vercel-proxied-for`, then `x-vercel-forwarded-for`; a request with `x-vercel-id` and neither gets no person (the tap still counts), so people are never counted by Vercel's address; otherwise the first `x-forwarded-for` entry, then `cf-connecting-ip`. A direct caller who forges `x-vercel-proxied-for` makes one more person per value, as a changed user agent would; the caps bound it.

## Caps

- 100 links per account. Labels and campaign names 1-60 characters, URLs up to 2,048, slugs 3-40 lowercase letters, digits or hyphens. Oversized raw input is refused before any regex runs.
- A link cannot point at our own `/t/` or `tracked-link` function addresses (no redirect loops). Add a custom domain to `c_self_re` in `cs_save_tracked_link` when one is set up.
- Taps counted up to 5,000 per link per Singapore day; the redirect keeps working after that.
- New people counted up to 1,000 per account per Singapore day, under a per-account advisory lock, so visitor rows stay under about 91,000 per account.
- Reserved slugs: 015's list (admin words and every top-level app route) plus t, track, tracked-link, link, links, report, reports, campaign, campaigns.

## Grants, one by one

- `cs_tracked_links`, `cs_tracked_link_campaigns`, `cs_tracked_link_days`: revoke all from public, anon, authenticated (undoes Supabase's default ALL grant); grant select to authenticated for the owner-read policies.
- `cs_tracked_link_visitors`, `cs_tracked_link_slug_holds`: revoke all from public, anon, authenticated; no policy.
- `cs_tracked_link_salt`: revoke all from public, anon, authenticated and service_role; no policy.
- `cs_tracked_link_lock_slugs`: revoked from public, anon, authenticated (internal helper, not SECURITY DEFINER).
- `cs_tracked_link_hold_slug`: trigger function, revoked from public, anon, authenticated.
- `cs_save_tracked_link`, `cs_delete_tracked_link`, `cs_set_tracked_link_report`: revoked from public and anon, granted to authenticated.
- `cs_tracked_link_click`, `cs_tracked_link_report_public`: revoked from public, anon and authenticated, granted to service_role.
- Policies: `cs_tracked_links_owner_read` and `cs_tracked_link_campaigns_owner_read` (`owner_id = auth.uid()`), `cs_tracked_link_days_owner_read` (days of a link the caller owns).
- Every function pins `search_path = public, pg_temp`.

## Applying

Run after 011 (it uses `cs_clean_label` and `cs_generate_invite_code`) on a database with pg_cron. One transaction with `lock_timeout = 3s`: the foreign keys to `auth.users` take SHARE ROW EXCLUSIVE on it briefly; run again later if it times out. Safe to run twice; the salt is kept. Then run the test file, which rolls back.

## Applied on academy (2026-10-11)

- 019 then 020 through the Management API SQL endpoint. Both test files passed on academy (each ends in ROLLBACK; a copy with a last `select` before the rollback proved each ran to the end), and 015's own test still passed after 020. Bite checks on academy: with the test account's membership set to active, check 0.0 failed; with 020's trigger dropped inside the test, check 1.2 failed.
- Catalog probe after apply: RLS on all six tables, the three SELECT policies for authenticated, execute on the click and report functions for service_role only, no anon grant, service_role cannot read the salt, the `cs_tracked_links_hold_slug` and `cs_bio_pages_hold_slug` triggers enabled, the `tracked-link-prune` (04:23 UTC) and `bio-slug-hold-prune` (04:29 UTC) jobs active, and the live function bodies carry the member gate, the year hold, the host-only report and the self-link check.

## Proof (2026-10-11)

On a throwaway Postgres 18 with a Supabase stand-in that copies the live default grants (tables, functions and sequences granted to anon, authenticated and service_role) and a pg_cron stand-in:

- 011, then 019 applied twice; the salt was unchanged by the second run.
- The test file passes. 38 sabotage runs each removed or loosened one guard (every revoke and grant, search_path, each owner check and policy, the URL rules, reserved slugs, slug holds and the hold trigger, every cap, the salt and scope in the hash, the bot flag, the report's fields, query-string stripping and off switch, the prune windows), and each turned a named check red.
- Parallel runs (not committed): the tap cap, the people cap across two links, one person tapping two links of a campaign at once, the link cap and the slug release race all held. With the per-account advisory lock removed, the people cap overshot (1,001 rows). An account deletion held open for 1.5 seconds while another adviser grabbed its 5 slugs lost none; without the trigger's slug lock it lost 1.
- An account deleted by a non-superuser owner of `auth.users` with no rights on these tables still left a year-long hold (the cascade runs as the table owner and the trigger is SECURITY DEFINER).
