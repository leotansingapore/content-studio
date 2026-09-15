// Stripe webhook for the Members Hub subscription lifecycle.
// Deploy with --no-verify-jwt; authenticity comes from the Stripe signature.
// A failed lookup or write returns 500 so Stripe retries the event. Finished
// events are recorded in hub_stripe_events, so a repeat delivery is skipped.
// Status rules live in membership.ts (unit-tested).
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@16";
import { checkoutStatus, subscriptionStatus } from "./membership.ts";

function failed(step: string, error: unknown): Response {
  console.error(`hub-stripe-webhook: ${step} failed`, error);
  return new Response(`${step} failed`, { status: 500 });
}

Deno.serve(async (req) => {
  const key = Deno.env.get("STRIPE_SECRET_KEY");
  const whsec = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!key || !whsec) return new Response("not configured", { status: 503 });

  const stripe = new Stripe(key);
  const sig = req.headers.get("stripe-signature");
  if (!sig) return new Response("missing signature", { status: 400 });

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(await req.text(), sig, whsec);
  } catch {
    return new Response("bad signature", { status: 400 });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: seen, error: seenError } = await admin
    .from("hub_stripe_events")
    .select("id")
    .eq("id", event.id)
    .maybeSingle();
  if (seenError) return failed("event lookup", seenError);
  if (seen) return new Response("already handled", { status: 200 });

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.client_reference_id;
    if (userId && session.subscription) {
      let sub: Stripe.Subscription;
      try {
        sub = await stripe.subscriptions.retrieve(session.subscription as string);
      } catch (error) {
        return failed("subscription lookup", error);
      }
      const { data: existing, error: lookupError } = await admin
        .from("hub_memberships")
        .select("id,status")
        .eq("user_id", userId)
        .maybeSingle();
      if (lookupError) return failed("membership lookup", lookupError);

      // Leaves is_admin and the email on file alone (client matching uses the email).
      const fields = {
        status: checkoutStatus(sub.status, existing?.status ?? null),
        stripe_customer_id: session.customer as string,
        stripe_subscription_id: sub.id,
        current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      };
      if (existing) {
        const { error } = await admin.from("hub_memberships").update(fields).eq("id", existing.id);
        if (error) return failed("membership update", error);
      } else {
        const { data: account } = await admin.auth.admin.getUserById(userId);
        const email = (account?.user?.email ?? session.customer_details?.email ?? "").toLowerCase();
        const { error } = await admin
          .from("hub_memberships")
          .insert({ user_id: userId, email, ...fields });
        if (error) return failed("membership insert", error);
      }
    }
  }

  if (
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    const sub = event.data.object as Stripe.Subscription;
    const stripeStatus =
      event.type === "customer.subscription.deleted" ? "canceled" : sub.status;
    const { data: rows, error: lookupError } = await admin
      .from("hub_memberships")
      .select("id,status")
      .eq("stripe_subscription_id", sub.id);
    if (lookupError) return failed("membership lookup", lookupError);
    for (const row of rows ?? []) {
      const { error } = await admin
        .from("hub_memberships")
        .update({
          status: subscriptionStatus(stripeStatus, row.status),
          current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      if (error) return failed("membership update", error);
    }
  }

  const { error: logError } = await admin
    .from("hub_stripe_events")
    .insert({ id: event.id, type: event.type });
  // 23505: a concurrent delivery of the same event recorded it first.
  if (logError && logError.code !== "23505") return failed("event log", logError);
  return new Response("ok", { status: 200 });
});
