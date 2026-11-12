// Postmosis paid sign-up, the public side (docs/postmosis-billing.md):
//
//   GET /postmosis-start?plan=pay|trial    303 to a new Stripe Checkout session (US$29 a month; trial = 7 days,
//                                          card up front). app.postmosis.com/start is a vercel.json rewrite here.
//                                          &site= carries the visitor's website into the new account.
//   POST /postmosis-start/session          { plan, site? } from postmosis.com/checkout: the same session in
//                                          embedded mode, answered as { clientSecret, publishableKey }, or
//                                          { off: true }. CORS names postmosis.com and localhost only. Also needs
//                                          POSTMOSIS_STRIPE_PUBLISHABLE_KEY. Rewritten from /start/session.
//   GET /postmosis-start/done?session_id=  Stripe's success_url (app.postmosis.com/start/done): checks the session
//                                          with Stripe, makes sure the account and its cs_subscriptions row
//                                          exist, then sends the browser to /auth, which emails the sign-in
//                                          link. It never signs anyone in.
//
// Off (302 to postmosis.com/pricing?checkout=off, no Stripe call) unless POSTMOSIS_CHECKOUT_ON and the three
// POSTMOSIS_ Stripe secrets are set. Visitors send no Supabase JWT, so this deploys WITHOUT JWT verification:
//   supabase functions deploy postmosis-start --project-ref hgdbflprrficdoyxmdxe --use-api --no-verify-jwt
// All behaviour is in _shared/billing.ts (tested in billing.test.ts).
import { handleStart } from "../_shared/billing.ts";
import { deps } from "../_shared/billingDeps.ts";

Deno.serve((req) => handleStart(req, deps));
