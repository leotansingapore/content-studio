# Delete your Content Studio data

> **DRAFT: not reviewed by a lawyer; do not publish until Leo approves**
>
> Written on 15 September 2026 from the code in `leotansingapore/content-studio`
> (main at `165b98d`). Meta requires apps to give users "an easily accessible and
> clearly marked way" to ask for their data to be deleted. That can be a public
> instructions page or a data deletion callback URL; this draft covers both.
> Parts 1 to 4 are the public page. Part 5 is internal and must **not** be
> published. Resolve every `[CONFIRM: …]` first. Items marked **Planned** depend on
> the Instagram and TikTok connections, which are not built yet.

---

## Part 1. Delete things yourself, right now

**Stop auditing an Instagram or TikTok account.** Go to Analytics, find the
account under "Your account audit", and tap the bin icon ("Stop auditing").
Confirm, and we delete the audit, its history and its post ideas, and remove the
handle from your accounts.

**Clear your F.A.D.S. worksheet.** In F.A.D.S., use the start-over option. It
clears all your answers and AI-polished drafts on every device you use.
[CONFIRM: button label]

**Other studio work.** Drafts, plans and other items can be removed from the page
they're on. [CONFIRM: which pages have delete controls]

**Disconnect Instagram or TikTok (Planned).** In Content Studio, disconnect the
account. We delete the access token and the data we read through it. You can also
revoke access in the Instagram or TikTok app. [CONFIRM: menu paths at launch]

**This device.** Signing out doesn't erase the work saved in your browser. To
remove it from a device, clear this site's data in your browser settings after
signing out.

## Part 2. Ask us to delete all your data

1. Email **[DPO EMAIL]** from the email address you use to sign in.
2. Use the subject line **"Delete my Content Studio data"**.
3. Tell us which you want:
   - **Content Studio data only.** You keep your sign-in, which is shared with
     [ACADEMY NAME].
   - **Everything, including your sign-in account.** This also ends your access
     to [ACADEMY NAME]. [CONFIRM: this is true, and whether the Academy needs a
     separate request]
4. If you have a paid Members Hub subscription, we cancel it first.

We'll reply to that email address to confirm the request came from you.

**Removed Content Studio in Instagram? (Planned)** When you remove Content Studio
from your Instagram account and ask for your data to be deleted there, Meta tells
us. We delete the data we got from Instagram and give you a confirmation code and
a link where you can check progress.

## Part 3. What we delete

### In our database

| Where | What it holds | What happens |
| --- | --- | --- |
| Studio work (`cs_user_data`) | Everything you created: drafts and post numbers you typed in, plans and calendar, board, coach and diagnosis answers, positioning, F.A.D.S. answers, voice samples and summary, saved items, writing preferences, Academy progress, the social handles you entered | Deleted |
| Account audits (`cs_social_audits`) | Handle, public profile details, up to 30 recent posts with their numbers, statistics and advice | Deleted |
| Audit history (`cs_social_snapshots`) | Summary numbers from each refresh | Deleted with the audit |
| Post ideas (`cs_social_ideas`) | Ideas suggested for your account and whether you used or skipped them | Deleted with the audit |
| Refresh log (`cs_social_audit_runs`) | When each audit refresh ran | Deleted |
| Usage counts (`cs_ai_usage`) | How often you used limited AI features each day | Deleted |
| Crash reports (`cs_client_errors`) | Error details from your sessions, linked to your account | Deleted |
| Membership (`hub_memberships`) | Hub status, industry, Stripe customer and subscription IDs | Deleted after your subscription is cancelled |
| Hub client list (`hub_allowlist`) | Hub clients only: your email, client name, niche, brand notes | Deleted |
| Your Hub trend drops (`hub_trends`) | Hub clients only: trend ideas written for your brand | Deleted |
| Connected accounts (Planned) | Instagram or TikTok access tokens and the data read with them | Access revoked where the platform allows it, then deleted |
| Sign-in account (Supabase Auth) | Email, password, sign-in records | Deleted only if you ask for everything (Part 2) |

### Outside our database

| Where | What happens |
| --- | --- |
| Your browser | We can't reach your devices. Clear this site's data on each one (Part 1). |
| Feedback service (assistant chats, feedback posts, comments, support messages with your name and email) | Deleted. [CONFIRM: how, and whether public feedback posts are deleted or anonymised] |
| Stripe (payment records) | Invoices and payment records are kept as required for tax and accounting. [CONFIRM: retention period and whether we ask Stripe to delete the customer] |
| Apify (public scrape results) | Removed according to our Apify plan's data retention setting. [CONFIRM: setting, or delete runs manually] |
| OpenAI (text sent for AI advice and ideas) | OpenAI keeps API data for up to 30 days, then deletes it. |
| Server logs and backups (Supabase, Vercel) | Removed when those logs and backups expire. [CONFIRM: periods] |
| Vercel Web Analytics | Holds no personal identifiers, so there's nothing to delete. |

### What we keep

- Payment and invoice records we must keep by law.
- A record that you asked for deletion: the date, a confirmation code and the
  outcome, without your content. [CONFIRM: we will keep this record]
- Records that contain no personal data, such as IDs of Stripe webhook events
  we've already processed.

## Part 4. How long it takes

| Step | When |
| --- | --- |
| We confirm we got your request | Within [3] business days [CONFIRM] |
| Your data is deleted from our database | Within [30] days of confirming it's you [CONFIRM] |
| Copies at our providers expire | As listed in Part 3 |
| We email you that it's done | When the database deletion is complete |

If we can't delete something, we'll tell you what and why.

Questions: [DPO NAME], Data Protection Officer, [DPO EMAIL].
[COMPANY NAME], [REGISTERED ADDRESS], Singapore.

---

## Part 5. Engineering notes (internal; do not publish)

### 5.1 Manual deletion runbook (today)

Nothing in the app deletes a whole account yet. Until it does, a person with
database admin access runs this after verifying the request. **Destructive: check
the user ID and email before running.**

```sql
-- Supabase SQL editor (service role). Replace <USER_ID> and <EMAIL>.
begin;
delete from public.cs_client_errors     where user_id = '<USER_ID>';
delete from public.hub_trends           where audience_type = 'client'
                                          and lower(audience_value) = lower('<EMAIL>');
delete from public.hub_allowlist        where email = '<EMAIL>';   -- citext, case-insensitive
delete from public.cs_social_audits     where user_id = '<USER_ID>'; -- cascades snapshots + ideas
delete from public.cs_social_audit_runs where user_id = '<USER_ID>';
delete from public.cs_ai_usage          where user_id = '<USER_ID>';
delete from public.cs_user_data         where user_id = '<USER_ID>';
delete from public.hub_memberships      where user_id = '<USER_ID>'; -- cancel in Stripe first
commit;
```

Notes from the schema:

- Every `cs_*` table and `hub_memberships` references `auth.users` with
  `on delete cascade`, so deleting the auth user would remove them anyway.
  `cs_client_errors` is the exception: it uses `on delete set null`, so reports
  would remain, unlinked. That's why the runbook deletes them explicitly.
- `hub_allowlist` and client-targeted `hub_trends` are keyed by **email**, not
  user ID, so no cascade reaches them.
- **Shared auth.** The Supabase project (`hgdbflprrficdoyxmdxe`) is shared with the
  Academy app. Deleting the auth user also cascades into that app's tables and
  ends its sign-in. [CONFIRM with the Academy owner before any full-account
  deletion]
- Browser keys are outside our reach: `content-studio-*`, `cs-sync-meta`,
  `cs-sync-pending-<user id>`, the Supabase session key, and `fb_*`
  (assistant/feedback). `handleSignOut` in `StudioLayout.tsx` calls
  `stopCloudSync()` and `supabase.auth.signOut()` but doesn't clear them.
- Supabase function logs contain audited handles (`console.error("audit failed",
  platform, handle, …)` in `auditRunner.ts`).

**Worth building:** a `delete-my-data` edge function (JWT-verified) that runs the
same deletes for `auth.uid()`, plus a "Delete my data" button in settings. That
turns Part 2 into self-service.

### 5.2 Meta data deletion callback (needed for Instagram)

Meta accepts either an instructions URL (Parts 1 to 4, published) or a callback
URL. Build the callback anyway: it handles users who remove the app from inside
Instagram. Per Meta's data deletion callback docs:

1. **Endpoint.** A new Supabase edge function, e.g. `instagram-data-deletion`,
   deployed with `--no-verify-jwt`. The signature is the auth. It must be HTTPS
   and be entered in the app's data deletion request URL setting.
   [CONFIRM: exact field name under Instagram business login settings]
2. **Parse `signed_request`** from the POST body:
   - split on `.` into the encoded signature and the payload;
   - base64url-decode both;
   - compute HMAC-SHA256 of the encoded payload with the app secret;
   - compare it in constant time with the signature, and reject with 400 on a
     mismatch;
   - read `user_id` from the payload JSON.

   [CONFIRM: Meta documents this for apps generally. Verify that Instagram API
   with Instagram Login sends the same format, and which secret signs it; it is
   likely the Instagram app secret]
3. **Delete** the connection row whose platform user ID matches, including its
   encrypted tokens and any media or insights cached from that connection. Decide
   whether the account audit for that handle goes too; it's derived from the
   same account, so the safe default is yes. Don't delete the rest of the user's
   studio work: it isn't Platform Data, and the user can ask for that separately.
4. **Record** the request in a new table, e.g. `cs_data_deletion_requests`, with a
   random `confirmation_code`, a `platform`, a hash of the platform user ID,
   `status`, `requested_at` and `completed_at`. Store no content and no email. Use
   service role only, with no RLS policies.
5. **Respond** with JSON:
   `{ "url": "https://<app-domain>/data-deletion/status?code=<code>", "confirmation_code": "<code>" }`.
6. **Status page.** Meta requires the URL to give "a human-readable explanation of
   the status of their request, including a legitimate justification for any
   refusal". That needs a public route plus a small anon-callable function that
   returns only the status for a code. This is app work; nothing here creates the
   page.
7. **Deauthorize callback.** When a user removes the app in Instagram, the same
   `signed_request` parsing applies. Revoke and delete the tokens straight away.
8. **Tests.** Unit-test the parser with a fixed secret and a known-good request.
   Include a negative case: a tampered payload or wrong secret must return 400
   and delete nothing. Make it idempotent: a repeated request returns the same
   code.
9. **Secrets.** Store the Instagram app secret as a Supabase function secret. Never
   log `signed_request` or user IDs in plain text.

### 5.3 TikTok

The TikTok docs checked on 15 September 2026 describe no deletion callback like
Meta's. On disconnect or a deletion request:

- call `POST https://open.tiktokapis.com/v2/oauth/revoke/` with `client_key`,
  `client_secret` and the user's access token;
- then delete the stored tokens and the data read with them.

[CONFIRM: whether TikTok webhooks can notify us when a user removes the app]

### Sources (accessed 15 September 2026)

- Meta, Data Deletion Callback:
  https://developers.facebook.com/docs/development/create-an-app/app-dashboard/data-deletion-callback
- Meta Platform Terms, sections 3.d (deleting data) and 4 (privacy policy):
  https://developers.facebook.com/terms/dfc_platform_terms/
- TikTok, Manage User Access Tokens (revoke):
  https://developers.tiktok.com/doc/oauth-user-access-token-management
- OpenAI, Data controls in the OpenAI platform (30-day retention):
  https://developers.openai.com/api/docs/guides/your-data
- Apify, storage data retention: https://docs.apify.com/platform/storage/usage
- Vercel Web Analytics, Privacy and Compliance:
  https://vercel.com/docs/analytics/privacy-policy
- Schema in this repo: `supabase/hub/001_hub_schema.sql`,
  `004_user_data_sync.sql`, `005_social_audits.sql`, `006_social_ideas.sql`,
  `007_client_errors.sql`, `008_stripe_events.sql`, `009_ai_usage.sql`
