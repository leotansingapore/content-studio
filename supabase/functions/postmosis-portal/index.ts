// Opens Stripe's customer portal (change the card, cancel, invoices) for the signed-in account's own Stripe
// customer, read from its cs_subscriptions row (docs/postmosis-billing.md). Deploy WITH JWT verification:
//   supabase functions deploy postmosis-portal --project-ref hgdbflprrficdoyxmdxe --use-api
// All behaviour is in _shared/billing.ts (tested in billing.test.ts).
import { handlePortal } from "../_shared/billing.ts";
import { deps } from "../_shared/billingDeps.ts";

Deno.serve((req) => handlePortal(req, deps));
