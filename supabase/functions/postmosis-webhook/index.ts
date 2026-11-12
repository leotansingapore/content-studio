// Stripe webhook for Postmosis subscriptions (docs/postmosis-billing.md): checkout.session.completed,
// customer.subscription.updated, customer.subscription.deleted, invoice.payment_failed. The Members Hub's events
// arrive here too (same Stripe account) and are skipped: only a subscription on POSTMOSIS_PRICE_ID is ours.
// Authenticity is the Stripe signature, so this deploys WITHOUT JWT verification:
//   supabase functions deploy postmosis-webhook --project-ref hgdbflprrficdoyxmdxe --use-api --no-verify-jwt
// All behaviour is in _shared/billing.ts (tested in billing.test.ts).
import { handleWebhook } from "../_shared/billing.ts";
import { deps } from "../_shared/billingDeps.ts";

Deno.serve((req) => handleWebhook(req, deps));
