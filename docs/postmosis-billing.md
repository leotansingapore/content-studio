# Postmosis billing

Paid sign-up for app.postmosis.com: one plan at US$29 a month, bought outright or after a 7-day trial with a card up front. Nobody can sign themselves up at /auth. An account is created by a server function, and only after Stripe confirms a paid or trialing subscription.

Everything here is off until the flag and the three Stripe secrets are set. The embedded checkout on postmosis.com needs a fifth value, the publishable key. Off means the app behaves as it did before this was built.

## How it works

1. The pricing page links to `https://app.postmosis.com/start?plan=pay` or `?plan=trial`. `vercel.json` rewrites `/start` and `/start/done` to the `postmosis-start` edge function.
2. `/start` creates a Stripe Checkout Session (subscription mode, the one price, promotion codes allowed, card always collected, `trial_period_days: 7` for `plan=trial` only) and answers 303 to Stripe. Stripe collects the email. `/start` takes nothing else from its address: no email and no customer.
3. Stripe sends the browser to `/start/done?session_id=...` and, separately, posts events to `postmosis-webhook`. Both run the same routine (`syncSubscription` in `supabase/functions/_shared/billing.ts`), in either order, any number of times. It reads the subscription from Stripe, creates the account if the email has none, and writes the `cs_subscriptions` row or a hold (see "Which checkouts are attached").
4. `/start/done` then answers 303 to `https://app.postmosis.com/auth?email=<email>&checkout=done`. The sign-in page asks Supabase for the normal sign-in link for that address, with the link landing on `/welcome`, and shows the usual "check your inbox" state with the code box and a "Send it again" button (one a minute, with Supabase's own limit behind it). Only the person who can open that inbox ends up signed in, because paying signs nobody in.
5. In the app, `ProtectedRoute` reads the signed-in account's own row. A row with no access shows the paywall instead of the studio. No row means an account from before billing: full access, no change.
6. A customer whose subscription has ended subscribes again from the paywall. That button calls `postmosis-portal` with `{restart: true}` (JWT on), which creates the Checkout Session with `customer` set to the Stripe customer on the caller's own row. Paying returns through `/start/done` as before; they are already signed in, so /auth passes them straight to the studio.
7. Settings > Billing (`/settings/billing`, shown only to an account with a row) and the billing line at the top of the studio open Stripe's customer portal through `postmosis-portal` (JWT on). The card, invoices and cancelling live there.

### The checkout page on postmosis.com

The marketing site asks the visitor for their website, shows pricing, and takes payment on its own page, `postmosis.com/checkout`, with Stripe's embedded Checkout beside an order summary. The page posts `{plan, site}` to `https://app.postmosis.com/start/session` and mounts the form with the `clientSecret` and `publishableKey` it gets back. Stripe's form asks for the email and shows Apple Pay and Google Pay once the domain is registered (runbook step 5). An answer of `{off: true}` means checkout is not switched on: the page should fall back to the plain link `/start?plan=...&site=...`, which also works with no JavaScript.

The session is the same one `/start` makes (price, trial rule, promotion codes, metadata), in `ui_mode: "embedded"`, and it returns to `/start/done` the same way. Nothing after payment differs.

### The visitor's website

`site` travels from the marketing site to the new account so onboarding can start from it:

1. The server checks it before it goes anywhere (`siteOf` in `supabase/functions/_shared/subscription.ts`): trimmed, at most 200 characters, an http or https address whose host has a dot and a real ending, no port and no login. That is the rule of the website box in the app (`webAddress` in `src/lib/onboardingFlow.ts`), and `src/lib/checkoutSite.test.ts` holds the two to the same cases. Anything else is dropped without an error.
2. Only the host and path are kept, lower-case host, no scheme, query or fragment: `https://WWW.Acme.sg/about?x=1` becomes `www.acme.sg/about`.
3. It goes into the Checkout Session's metadata and the subscription's metadata as `site`.
4. When a checkout creates an account, the value is read back from the subscription, checked again, and saved as `user_metadata.postmosis_site`. It is never written onto an account that already exists.

For /welcome: `checkoutSite()` in `src/lib/subscription.ts` returns that value for the signed-in user, or null.

```ts
import { checkoutSite } from "@/lib/subscription";
const site = await checkoutSite(); // "acme.sg/about" or null
```

It reads the session, so it costs no request. `user_metadata` can be edited by the account's owner, so the helper runs the same check again and returns null for anything that is not a web address. Treat the result as the visitor's own typing: prefill the box with it, and let the box's own check run when they continue. It is null for accounts from before this, for a restart from the paywall, and when the visitor typed nothing.

### Why the browser sends the sign-in link, not the server

The app's Supabase client uses PKCE, so an emailed link only finishes in the browser that asked for it. A link requested by a server has no PKCE challenge and the client rejects it ("Not a valid PKCE flow url"). So `/start/done` hands the email to /auth and that browser asks, exactly as the form does. The public endpoints cannot mint a token, a session or a sign-in link: the database interface they are given (`Db` in `billing.ts`) has no such call, and a test checks every answer they give.

## Who gets access

The rule is one function, `hasAccess` in `supabase/functions/_shared/subscription.ts`. The app imports the same file, so the gate and the server agree.

| Row | Access |
| --- | --- |
| no row | yes, always (an account from before billing, or a free account) |
| `trialing`, `active` | yes |
| `comp` (set by hand) | yes |
| `past_due` | yes for 7 days from `past_due_since` with a warning line and an "Update your card" link, then no |
| `canceled`, `unpaid`, `incomplete`, `incomplete_expired`, `paused`, anything unknown | no |

The 7 days are `GRACE_DAYS`. Stripe keeps retrying the card during that time, and a payment that goes through sets the row back to `active`. `past_due_since` is set when the status first becomes `past_due` and is not moved by later events.

A subscription cancelled in the portal stays `trialing` or `active` with `cancel_at_period_end` until its period ends. The billing line then says when it ends and that no charge follows.

### The paywall is a screen, not a lock

The gate in `ProtectedRoute` runs in the browser and fails open: a lookup that errors or takes over 4 seconds lets the person in. It stops an honest customer, not someone calling the API directly. The server refuses a lapsed customer in two places:

- `social` answers as switched off for an account whose row gives no access, listed in `SOCIAL_CONNECT_USERS` or not. Removing a brand still works, so its connected accounts can go.
- `consumeUsage` in `_shared/usageCaps.ts`, the one function every metered AI and scraping call goes through, answers 402 `subscription_lapsed` before counting a use.

Both read the row with `readSubscription`. No row, a failed read or a missing table refuses nobody. Each function picks the check up the next time it is deployed. Until then it runs the old code.

Known gap: anything that does not go through `consumeUsage` or `social` is not refused. That includes the synced workspace data (`cloudSync`, the customer's own rows under RLS), the public link functions and any function with no daily cap. A lapsed customer who calls those directly gets what any signed-in account gets.

## Which checkouts are attached to an existing account

The email typed at Stripe proves nothing about who owns the inbox, so an email match alone never attaches a checkout, whether or not the account has a row. A checkout is attached to an account that already exists in two cases only:

- (a) The account was created by this same subscription (the webhook or `/start/done` got there a moment earlier). The account carries the subscription id in `app_metadata.postmosis_subscription`, set at creation.
- (b) The subscription's Stripe customer is the one already on the account's row, and that row no longer gives access. Only the signed-in restart creates such a checkout, because the public `/start` never sets a customer. The row is found by the customer id, so a customer who changed their email at Stripe still matches.

Everything else is held in `cs_held_checkouts` and changes no row:

| Reason | When |
| --- | --- |
| `account_without_subscription` | The email belongs to an account with no row (from before billing). Otherwise a stranger could pay under its email, cancel, and paywall it. |
| `customer_mismatch` | The email belongs to an account whose row has lapsed, and the checkout is from a different Stripe customer (or the row has none on file). Otherwise a stranger could pay under a lapsed customer's email and put their own Stripe customer on the row, and the owner's Billing page would open the stranger's portal. |
| `second_subscription` | The account's row still gives access (a paying customer or a `comp` account), whichever Stripe customer paid. Cancelling the second one locks nobody out. |

A held checkout gates nobody. The webhook keeps its `status` in step with Stripe. The payer sees the same "check your inbox" page either way.

A lapsed customer who pays again through the public pricing page, signed out, is therefore held as `customer_mismatch` (Stripe makes a new customer for them). Attach it by hand once they confirm, or refund it and point them at the paywall's button.

### Resolving a held checkout by hand

```sql
select * from cs_held_checkouts where resolved_at is null order by created_at;
```

For each one, either refund and cancel the subscription in Stripe, or attach it once the account's owner confirms the payment is theirs:

```sql
insert into cs_subscriptions (user_id, email, status, stripe_customer_id, stripe_subscription_id)
select u.id, h.email, h.status, h.stripe_customer_id, h.stripe_subscription_id
from cs_held_checkouts h join auth.users u on lower(u.email) = h.email
where h.stripe_subscription_id = 'sub_...'
on conflict (user_id) do update set status = excluded.status, stripe_customer_id = excluded.stripe_customer_id,
  stripe_subscription_id = excluded.stripe_subscription_id, updated_at = now();
update cs_held_checkouts set resolved_at = now(), note = 'attached' where stripe_subscription_id = 'sub_...';
```

Attaching puts that account under billing from then on: it is gated if the subscription lapses. The next webhook event for the subscription fills in the dates.

### The held payments page

Leo's sign-ins see Settings > Held payments (`/settings/held`): every unresolved held checkout, newest first, up to 200. Each shows the email, the reason in plain words, Stripe's status, when it was held, and a link to the subscription in Stripe's dashboard. The link opens Stripe's test mode while `POSTMOSIS_STRIPE_PUBLISHABLE_KEY` is a test key.

- It only reads. Attaching and refunding stay in Stripe and the SQL above.
- It sends no alert.
- The `held-checkouts` function serves it. It checks the caller's email against `LEO_EMAILS` (`supabase/functions/_shared/leo.ts`, which `src/lib/leoOnly.ts` re-exports) and reads `cs_held_checkouts` with the service role.
- Deploy it WITH JWT verification: `supabase functions deploy held-checkouts --project-ref hgdbflprrficdoyxmdxe --use-api`

## Posting to connected accounts

A subscriber whose row gives access may connect social accounts without being on `SOCIAL_CONNECT_USERS`, at the existing customer cap of 3. Every Zernio id check in `docs/zernio-connection.md` is unchanged, and the team cap (`ZERNIO_MAX_ACCOUNTS`) still holds everyone. Auto-DM, threads and PDF posts stay with `NORTH_STAR_USERS`.

## Secrets

Edge secrets on the academy project. New names, so nothing collides with the Members Hub (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `HUB_PRICE_ID`).

| Name | What |
| --- | --- |
| `POSTMOSIS_CHECKOUT_ON` | `1` (or `true`, `on`, `yes`) switches billing on. Anything else is off. |
| `POSTMOSIS_STRIPE_SECRET_KEY` | The D'Marketing Agency Stripe account's secret key, or a restricted key with write on Checkout Sessions and Customer portal and read on Subscriptions and Customers. |
| `POSTMOSIS_STRIPE_WEBHOOK_SECRET` | The signing secret of the `postmosis-webhook` endpoint. |
| `POSTMOSIS_PRICE_ID` | The US$29 monthly price. Also how the webhook tells Postmosis subscriptions from the hub's. |
| `POSTMOSIS_STRIPE_PUBLISHABLE_KEY` | The same Stripe account's publishable key (`pk_test_...` or `pk_live_...`), sent to the checkout page by `POST /start/session`. It is public by nature. Only the embedded checkout needs it. A value that does not start with `pk_test_` or `pk_live_` counts as missing, so a secret key pasted here is never sent to a browser. It must be from the same mode (test or live) as the secret key. |

`POST /start/session` answers 200 `{off: true}` when the flag or any of the four keys is missing. The publishable key switches nothing else off.

With the flag or any of the three missing, `/start` and `/start/done` answer 302 to `https://postmosis.com/pricing?checkout=off`, the webhook answers 503 and the portal answers 503 `{code:"off"}`, with no call to Stripe or the database.

## Endpoints

| Endpoint | JWT | Answers |
| --- | --- | --- |
| `GET /start?plan=pay\|trial[&site=]` | no | 303 to Stripe Checkout. A valid `site` is carried in the metadata, an invalid one is dropped. Another plan: 302 to `postmosis.com/pricing`. Stripe error: 302 to `pricing?checkout=error`. Off: 302 to `pricing?checkout=off`. Not GET: 405. |
| `POST /start/session` with JSON `{plan: "pay"\|"trial", site?}` | no | 200 `{clientSecret, publishableKey}` for an embedded Checkout Session returning to `/start/done`. Off: 200 `{off: true}`. Another plan, or a body that is not JSON or is over 2000 characters: 400 `{error: "plan"}`. Stripe failure: 502 `{error: "stripe"}`. An `Origin` other than `https://postmosis.com`, `http://localhost[:port]` or `http://127.0.0.1[:port]`: 403 `{error: "origin"}` with no CORS header. `OPTIONS`: 204. Any other method: 405. CORS allows `POST, OPTIONS` and the `content-type` header, names the caller's origin exactly, and never allows credentials. Also answered directly at `.../functions/v1/postmosis-start/session`. |
| `GET /start/done?session_id=` | no | 303 to `app.postmosis.com/auth?email=<email>&checkout=done` once the account and row (or the hold) exist. Session not finished, not a Postmosis session, or nothing paid: 302 to `pricing?checkout=pending`. Malformed or unknown id: 302 to `pricing`. A failed write: 503 in plain text asking for a reload. |
| `POST postmosis-webhook` | no, Stripe signature | 200 `ok` or `already handled`. 400 on a missing or bad signature. 500 on a failed read or write, so Stripe retries. 503 when off. |
| `POST postmosis-portal` `{}` | yes | `{url}` of Stripe's portal for the caller's own Stripe customer. 401 signed out, 404 `no_subscription`, 503 `off`. |
| `POST postmosis-portal` `{restart: true}` | yes | `{url}` of a new Checkout (pay now, no trial) for the caller's own Stripe customer, returning to `/start/done`; cancelling returns to the app. 409 `not_ended` unless the row is `canceled` or `incomplete_expired`, so a subscription Stripe is still retrying is never doubled. 401, 404 and 503 as above. |

The webhook listens for `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted` and `invoice.payment_failed`. For each it asks Stripe for the subscription again instead of trusting the event's copy, so events that arrive out of order still leave the latest state. Finished events are logged in `cs_subscription_events` and a repeat is skipped.

## Go-live runbook

Do the whole thing in Stripe test mode first, then go live with step 12. Steps 5 to 9 were done on 12 November 2026 for the first release; a later change to the functions repeats step 8 for `postmosis-start`.

1. Stripe, D'Marketing Agency account. Product catalogue > Add product: name `Postmosis`, recurring, US$29.00, monthly. Copy the price id (`price_...`).
2. Stripe > Developers > Webhooks > Add endpoint. URL `https://hgdbflprrficdoyxmdxe.supabase.co/functions/v1/postmosis-webhook`. Events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`. Copy the signing secret (`whsec_...`). Leave the hub's endpoint as it is.
3. Stripe > Settings > Billing > Customer portal: allow customers to update payment methods, view invoices and cancel subscriptions, then save. Portal sessions fail in live mode until this is saved once.
4. Stripe > Settings > Billing > Subscriptions and emails: switch on the reminder email before a free trial ends, and the emails for failed payments. Read the timing Stripe shows there for a 7-day trial. The card networks expect a trial reminder, and this is the only one sent.
5. Stripe > Settings > Payments > Payment method domains > Add a new domain: `postmosis.com`. Without it the embedded form shows cards only, with no Apple Pay or Google Pay. Follow what that page asks for each wallet. If it asks for an Apple Pay verification file, that file is served by the marketing site at `postmosis.com/.well-known/`, not by this repo. Do it in test mode and again in live mode. In Settings > Payments > Payment methods, check Apple Pay and Google Pay are on.
6. Stripe > Developers > API keys: copy the publishable key (`pk_test_...`). It is set in step 10.
7. Apply the SQL, by hand, with Leo's ok. Check nothing with these names exists first:
   ```sql
   select to_regclass('public.cs_subscriptions'), to_regclass('public.cs_held_checkouts'), to_regclass('public.cs_subscription_events');
   ```
   Then `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/hub/035_subscriptions.sql`. Run `035_subscriptions.test.sql` on a throwaway or local database only, never through the Management API.
8. Deploy the functions while the flag is still unset:
   ```
   supabase functions deploy postmosis-start   --project-ref hgdbflprrficdoyxmdxe --use-api --no-verify-jwt
   supabase functions deploy postmosis-webhook --project-ref hgdbflprrficdoyxmdxe --use-api --no-verify-jwt
   supabase functions deploy postmosis-portal  --project-ref hgdbflprrficdoyxmdxe --use-api
   supabase functions deploy social            --project-ref hgdbflprrficdoyxmdxe --use-api
   ```
   Check: `curl -s -o /dev/null -w "%{http_code} %{redirect_url}" "https://hgdbflprrficdoyxmdxe.supabase.co/functions/v1/postmosis-start?plan=pay"` (a GET; HEAD answers 405) answers 302 to `pricing?checkout=off`. And the embedded mode: `curl -s -X POST -H "Content-Type: application/json" -d '{"plan":"pay"}' "https://hgdbflprrficdoyxmdxe.supabase.co/functions/v1/postmosis-start/session"` answers `{"off":true}`.
9. Merge and push to main (that is the Vercel deploy). Check the same GET on `https://app.postmosis.com/start?plan=pay` gives the same 302, the same POST on `https://app.postmosis.com/start/session` gives `{"off":true}`, and that the app opens as before for an existing account. Then check CORS from the site's origin: `curl -s -i -X OPTIONS -H "Origin: https://postmosis.com" -H "Access-Control-Request-Method: POST" https://app.postmosis.com/start/session` answers 204 with `access-control-allow-origin: https://postmosis.com`.
10. Set the secrets with the test-mode values, flag last:
   ```
   supabase secrets set --project-ref hgdbflprrficdoyxmdxe POSTMOSIS_STRIPE_SECRET_KEY=... POSTMOSIS_STRIPE_WEBHOOK_SECRET=... POSTMOSIS_PRICE_ID=... POSTMOSIS_STRIPE_PUBLISHABLE_KEY=pk_test_...
   supabase secrets set --project-ref hgdbflprrficdoyxmdxe POSTMOSIS_CHECKOUT_ON=1
   ```
11. Run the test-mode walkthrough below.
12. Go live: repeat steps 1 to 6 in live mode, set the four live values over the test ones (the publishable key must be the live one too, or the form will not load), and check one real purchase end to end. Refund it in Stripe afterwards if it was your own card.

### Test-mode walkthrough

Use an inbox you can read and that has no account yet. Card `4242 4242 4242 4242`, any future date, any CVC.

1. Open `https://app.postmosis.com/start?plan=trial`. Stripe Checkout shows US$29 a month with 7 days free and asks for a card.
2. Pay. You land on /auth with the email filled in and "Your payment went through... a sign-in link is on its way". You are not signed in.
3. `select * from cs_subscriptions order by created_at desc limit 1;` shows `trialing` with a `trial_end`. `select * from cs_subscription_events order by received_at desc limit 5;` shows the events. The Stripe webhook page shows 200s.
4. Tap the emailed link in the same browser and you land on `/welcome`, signed in, with a Billing tile in Settings and this line at the top of the studio: "7 days left in your trial. US$29 is charged on <date>, then each month." Manage billing sits beside it.
5. Open Stripe's portal from Manage billing and cancel there. After a reload the line in the app says the trial ends on that date with no charge to follow.
6. Now cancel the subscription immediately from the Stripe dashboard and reload the app, which shows the paywall with "Subscribe again" and Sign out. The button opens Checkout for your own Stripe customer (email shown, not editable), and paying puts you back in the studio with the same row on the new subscription.
7. Failed payment: in Stripe, swap the customer's card for `4000 0000 0000 0341` and end the trial now. The row goes `past_due`, the app shows the amber line with a date 7 days on. Set `past_due_since` back 8 days by hand to see the paywall with "Update your card".
8. Held checkouts: run `/start?plan=trial` with the email of an existing account that has no row. Afterwards `cs_subscriptions` has no row for it, `cs_held_checkouts` has one (`account_without_subscription`), and that account still opens the studio. Then, with the account from step 6 cancelled again, run `/start?plan=pay` signed out under its email: the row is unchanged, and the hold says `customer_mismatch`.
9. Reload `/start/done?session_id=...` from your history: the same /auth page, nothing new created.
10. Social: signed in as the trial account, Settings shows Social accounts (the check is cached for 6 hours per device).
11. The checkout page: open `https://postmosis.com`, type a website you own, pick the trial and land on `postmosis.com/checkout`. The payment form loads beside the order summary and asks for an email. On a device with a wallet set up, Apple Pay or Google Pay should show above the card fields. A real device in live mode is the true check. Pay with the test card and an inbox with no account. You land on /auth as in step 2.
12. `select raw_user_meta_data ->> 'postmosis_site' from auth.users order by created_at desc limit 1;` shows the website as `host/path`. In Stripe, the subscription's metadata shows `app: postmosis` and the same `site`.
13. With `POSTMOSIS_STRIPE_PUBLISHABLE_KEY` unset, the checkout page gets `{off: true}` and falls back to the plain link, while `/start?plan=trial&site=...` still opens Stripe's hosted page.
14. Clean up: delete the test accounts in Supabase Auth (their rows go with them), delete the held rows, cancel the test subscriptions.

Test mode writes to the production database, so the accounts it creates are real ones and the addresses must be yours.

### Switching off

`supabase secrets unset --project-ref hgdbflprrficdoyxmdxe POSTMOSIS_CHECKOUT_ON`. New checkouts stop at once and the pricing page gets `?checkout=off`.

This also switches off the webhook and the portal. While it is off:

- Stripe retries failed webhook deliveries for up to 3 days. Switched back on within that time, nothing is lost. After longer, resend the failed events from the Stripe webhook page, oldest first.
- Customers cannot open the portal from the app. Cancel or change a card for them in Stripe.
- Rows keep their last status, so nobody already in is locked out by the switch.

To stop only new sign-ups and leave existing customers alone, take the links off the pricing page instead and leave the flag on.

### Giving someone a free account

- They already have an account with no row: nothing to do. No row is full access.
- They have no account: create the user in Supabase > Authentication > Add user (auto confirm), and they sign in at /auth with the emailed link without needing a row.
- To let a free account connect social accounts, or to turn a paying customer free, give it a `comp` row. A later checkout under that email is held, never swapped in.
  ```sql
  insert into cs_subscriptions (user_id, email, status)
  select id, lower(email), 'comp' from auth.users where lower(email) = 'person@example.com'
  on conflict (user_id) do update set status = 'comp', stripe_subscription_id = null, updated_at = now();
  ```
  If they were paying, cancel their Stripe subscription as well, after the row is `comp`.

## Abuse cases considered

`/start` and `/start/done` are public and hold the service key.

| Case | How it is closed |
| --- | --- |
| Signing in as someone by paying under their email | No public endpoint returns a token, a session or a sign-in link. `/start/done` returns an address on /auth carrying the email, and the sign-in link goes to the inbox. A test checks every answer the public endpoints give. |
| Paywalling an existing free account by paying under its email and cancelling | An account with no row is never given one by a checkout; the checkout is held. |
| Locking out a paying customer with a second subscription under their email, then cancelling it | A row that still gives access is not replaced; the second checkout is held. |
| Taking over a lapsed customer's billing by paying under their email (their Billing page would then open the payer's Stripe portal) | A row is only ever moved to a subscription of the Stripe customer it already has. Any other checkout is held as `customer_mismatch` and the row is untouched. |
| Starting a checkout on someone else's Stripe customer | Only `postmosis-portal` sets `customer`, from the signed-in caller's own row. The public `/start` ignores everything in its address but `plan`. |
| A Members Hub checkout session at `/start/done`, or hub events at the webhook | A session must carry `metadata.app = postmosis`, which only `/start` sets, and a subscription must be on `POSTMOSIS_PRICE_ID`. |
| Forged or replayed webhook calls | Stripe's signature is checked before anything is read. The subscription is then re-read from Stripe, so a replayed genuine event can only write Stripe's current state. |
| Open redirect | Every target is a constant origin (`postmosis.com/pricing`, `app.postmosis.com/auth`) or the https URL Stripe returned. The only request-derived value in a redirect is the email from Stripe, URL-encoded. |
| Guessed or injected session ids | The id must match `cs_(test\|live)_[A-Za-z0-9]{8,250}` before Stripe is asked, Stripe's ids are long random strings, and an unknown id gets the pricing page. |
| A leaked `/start/done` link (browser history, a shared screen) | It makes that browser ask for a sign-in link to the payer's inbox, which gives the holder no access. Still open: the /auth address it lands on shows the payer's email. |
| `/auth?email=x&checkout=done` used to send sign-in emails to someone | The same as typing their address into /auth: Supabase limits how often an address is emailed, and nothing goes out unless an account uses it. |
| Accounts created in bulk | An account is created only after Stripe reports a paid or trialing subscription, and that takes a card that passes Stripe's checks. |
| Another site using `POST /start/session` from its visitors' browsers | CORS names only `https://postmosis.com` and a local dev server, by exact match, never a wildcard and never with credentials, and a request carrying any other `Origin` is refused with 403 before anything else is read. A caller that sends no `Origin` (curl, a server) is served: it could set any header it liked anyway, and gets only what `/start` already gives anyone. |
| Steering the session through the request (a price, a customer, an email, a return address, a coupon, a longer trial) | The session is built from constants plus `plan` and `site`. Nothing else in the body or the address is read; a test sends every such field and compares the whole session. |
| `site` used to inject metadata keys, oversize values or script | It must be a string that passes `siteOf`, and is stored as one value under the fixed key `site`, at most 200 characters, host and path only. It is checked on the way in, again when read back from Stripe, and again by `checkoutSite()` when the app reads it. The app should still treat it as typed text. |
| Stripe's errors or keys leaking through the new endpoint | The answer is one of five fixed shapes. A Stripe failure answers `{error: "stripe"}` and logs only Stripe's error code. The only key ever sent is the publishable one, and only if it looks like one. |
| The client secret of an embedded session | It lets its holder pay for that one session and nothing else: it signs nobody in and reads no account. The every-answer test covers this mode too. |
| Checkout Sessions created in bulk through `/start` or `/start/session` | Each is a free Stripe API call that expires by itself, and link-preview bots get the app's preview page instead of the function (the `/start` rewrites sit after the bot rule in `vercel.json`). Still open: we add no rate limit to Stripe's own. |
| The portal or a restart asked for someone else's customer | The customer id comes from the caller's own row, never from the request. |
| Reading other people's billing | RLS lets an account read only its own `cs_subscriptions` row and write nothing; the holds, the event log and the email lookup are service-role only. |
| Calling the API directly while lapsed | Partly closed: see "The paywall is a screen, not a lock". |

## Known limits

- Repeat trials. A person can take another 7-day trial with a new email. The card is checked each time but nothing stops a reused card. Stripe Radar can block on card fingerprint.
- Trial reminder and failed-payment emails are Stripe's. The app sends none.
- The billing line shows the list price. With a promotion code Stripe charges less than the line says. The portal shows the exact amount.
- An account created by a checkout is marked email-confirmed before anyone has proved the inbox, although signing in still needs it.
- A customer who pays twice under one email has the second subscription held, not merged. It never attaches by itself when it came through the public pricing page (a different Stripe customer): refund it or attach it by hand.
- A lapsed row with no Stripe customer on file (made by hand) cannot restart from the paywall; the button answers "There's no subscription on this account." Give it a `comp` row or delete the row.
- The paywall offers a new checkout only for `canceled` and `incomplete_expired`. For `past_due` and `unpaid` it opens the portal to fix the card, because Stripe is still collecting on that subscription.
- A lapsed customer's connected social accounts stay connected at Zernio and keep costing until they remove the brand or the accounts are disconnected by hand.
- The 4-second lookup limit and fail-open gate mean a customer with no access can occasionally be let in for one page load.

## Files

- `supabase/hub/035_subscriptions.sql`, `035_subscriptions.test.sql`
- `supabase/functions/_shared/subscription.ts` (access rule, shared with the app), `billing.ts` (the endpoints' behaviour), `billingDeps.ts` (Stripe and database wiring), with `subscription.test.ts` and `billing.test.ts`
- `supabase/functions/postmosis-start`, `postmosis-webhook`, `postmosis-portal`
- `supabase/functions/social/index.ts`, `supabase/functions/_shared/usageCaps.ts` (server-side checks)
- `src/lib/subscription.ts`, `src/components/ProtectedRoute.tsx`, `Paywall.tsx`, `BillingNote.tsx`, `src/pages/BillingPage.tsx`, `src/pages/Auth.tsx`
- `src/lib/checkoutSite.test.ts` (the site rule against the app's website box, and `checkoutSite()`)
- `vercel.json` (the `/start`, `/start/session` and `/start/done` rewrites)
