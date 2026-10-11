# Tracked links and campaign reports (g39, g40), 019

Migration `supabase/hub/019_tracked_links.sql`, tests in `019_tracked_links.test.sql`. Not applied yet: an independent review reads the migration first (Leo's rule), then it is applied by hand like 011-018. No edge function or screen exists yet.

It follows 015 (link-in-bio): clients read through RLS (SELECT only) and write through SECURITY DEFINER functions that check `auth.uid()`. anon holds no table privilege and no function EXECUTE. The public side goes through one edge function deployed `--no-verify-jwt` that holds the service key and calls only the two functions granted to `service_role`.

## What an adviser gets

- A short link `/t/<slug>` for any web address (an offer, a guide, a form), with a label and an optional campaign name. The slug is theirs to pick, or a random 10-character one.
- Taps per link per Singapore day, and people: a person counts once per campaign (once per link for a link outside a campaign), however often they tap.
- A public report per campaign, off until switched on. It shows the campaign name, total taps and people, the last 7 days, and each link's label, address without its query string or fragment, taps and people. Nothing about the adviser beyond the campaign name.

## Tables

| Table | Holds | Client access |
| --- | --- | --- |
| `cs_tracked_links` | owner, campaign, slug, label, URL | owner SELECT (RLS) |
| `cs_tracked_link_campaigns` | owner, name (unique per owner ignoring case), report slug or null | owner SELECT (RLS) |
| `cs_tracked_link_days` | per link per day: taps, new people | owner SELECT (RLS) |
| `cs_tracked_link_visitors` | one 32-byte hash per person per campaign, the link and day of the first tap | none |
| `cs_tracked_link_slug_holds` | slugs released in the last 30 days and who released them | none |
| `cs_tracked_link_salt` | one 32-byte random salt, made on first apply and kept | none, not even `service_role` |

A campaign exists while it has a link: saving or deleting deletes the caller's campaigns left with none, report included.

## Functions

Owner (authenticated, each checks `auth.uid()` and the row's owner):

- `cs_save_tracked_link(p_id, p_slug, p_label, p_url, p_campaign)`: creates (`p_id` null) or edits. A blank slug keeps the current one on an edit, or picks a random one for a new link. A blank campaign takes the link out of its campaign. Renaming holds the old slug for 30 days.
- `cs_delete_tracked_link(p_id)`: deletes the link with its counts and the people first seen on it, and holds its slug for 30 days.
- `cs_set_tracked_link_report(p_campaign_id, p_on)`: on makes a random 20-character report slug (100 bits) or keeps the current one; off deletes it, so an old report link never works again.

Public (`service_role` only, called by the edge function):

- `cs_tracked_link_click(p_slug, p_visitor, p_count)`: returns the stored URL or null. Counts the tap unless the link has 5,000 today. `p_visitor` is the visitor key below; a missing or malformed one counts the tap but no person. `p_count = false` counts nothing.
- `cs_tracked_link_report_public(p_report_slug)`: the report JSON (`campaign`, `clicks`, `people`, `days[7]` of `{day, clicks, people}`, `links[]` of `{label, url, clicks, people}`, most tapped first), or null.

## Unique people

- The edge function computes the visitor key and never sends the raw IP to the database: SHA-256 hex of `r:<token>` when the request has a well-formed `?r=` token (`^[A-Za-z0-9_-]{22}$`, for links the app puts in its own DMs, one token per recipient), else of `v:<ip>|<user agent>`, else none.
- The database stores SHA-256(salt, scope, key), where scope is the link's campaign id, or the link id outside a campaign. One person therefore counts once per campaign, and the same person cannot be matched across campaigns or advisers.
- Visitor rows are deleted 90 days after the first tap (daily job `tracked-link-prune`), so a person who comes back after that counts again. The daily counts stay.
- A person who taps once from a DM (with `r`) and once from a bio (without) counts twice. Nothing checks that an `r` token was minted by the app, so a visitor who invents tokens inflates people the same way changing user agent would; the caps below bound it.

## Edge function contract (tracked-link, to build after apply)

- `GET /tracked-link/<slug>[?r=<token>]`: check the slug shape before any query, compute the visitor key, send bots and link previewers on with `p_count = false` (reuse `isBot` from `link-in-bio/logic.ts`), and count only on GET, never HEAD. Re-parse the returned URL with `new URL()`, follow only http(s) (`safeRedirectUrl`), and answer 302 with `Cache-Control: no-store`. An unknown slug goes to the app's home page.
- `GET /tracked-link/report/<report slug>`: check `^[a-z0-9]{20}$` first, return the JSON or 404, `X-Robots-Tag: noindex`.
- `/t/<slug>` on the app domain reaches the function through a rewrite, so the function must read the visitor's IP from the header that survives it, not the rewrite's own address.

## Caps

- 100 links per account. Labels and campaign names 1-60 characters, URLs up to 2,048, slugs 3-40 lowercase letters, digits or hyphens. Oversized raw input is refused before any regex runs.
- Taps counted up to 5,000 per link per Singapore day; the redirect keeps working after that.
- New people counted up to 1,000 per account per Singapore day, under a per-account advisory lock, so visitor rows stay under about 91,000 per account.
- Reserved slugs: 015's list (admin words and every top-level app route) plus t, track, tracked-link, link, links, report, reports, campaign, campaigns.

## Grants, one by one

- `cs_tracked_links`, `cs_tracked_link_campaigns`, `cs_tracked_link_days`: revoke all from public, anon, authenticated (undoes Supabase's default ALL grant); grant select to authenticated for the owner-read policies.
- `cs_tracked_link_visitors`, `cs_tracked_link_slug_holds`: revoke all from public, anon, authenticated; no policy.
- `cs_tracked_link_salt`: revoke all from public, anon, authenticated and service_role; no policy.
- `cs_tracked_link_lock_slugs`: revoked from public, anon, authenticated (internal helper, not SECURITY DEFINER).
- `cs_save_tracked_link`, `cs_delete_tracked_link`, `cs_set_tracked_link_report`: revoked from public and anon, granted to authenticated.
- `cs_tracked_link_click`, `cs_tracked_link_report_public`: revoked from public, anon and authenticated, granted to service_role.
- Policies: `cs_tracked_links_owner_read` and `cs_tracked_link_campaigns_owner_read` (`owner_id = auth.uid()`), `cs_tracked_link_days_owner_read` (days of a link the caller owns).
- Every function pins `search_path = public, pg_temp`.

## Applying

Run after 011 (it uses `cs_clean_label` and `cs_generate_invite_code`) on a database with pg_cron. One transaction with `lock_timeout = 3s`: the foreign keys to `auth.users` take SHARE ROW EXCLUSIVE on it briefly; run again later if it times out. Safe to run twice; the salt is kept. Then run the test file, which rolls back.

## Proof (2026-10-11)

On a throwaway Postgres 18 with a Supabase stand-in that copies the live default grants (tables, functions and sequences granted to anon, authenticated and service_role) and a pg_cron stand-in:

- 011, then 019 applied twice; the salt was unchanged by the second run.
- The test file passes. 34 sabotage runs each removed or loosened one guard (every revoke and grant, search_path, each owner check and policy, the URL rules, reserved slugs, slug holds, every cap, the salt and scope in the hash, the bot flag, the report's fields, query-string stripping and off switch, the prune windows), and each turned a named check red.
- Parallel runs (not committed): the tap cap, the people cap across two links, one person tapping two links of a campaign at once, the link cap and the slug release race all held. With the per-account advisory lock removed, the people cap overshot (1,001 rows).
