// Stripe webhook for the Members Hub subscription lifecycle.
// Deploy with --no-verify-jwt; authenticity comes from the Stripe signature.
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@16";

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

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.client_reference_id;
    if (userId && session.subscription) {
      const sub = await stripe.subscriptions.retrieve(session.subscription as string);
      // Upsert without touching is_admin; keep any existing admin flag.
      const { data: existing } = await admin
        .from("hub_memberships")
        .select("id,is_admin")
        .eq("user_id", userId)
        .maybeSingle();
      const row = {
        user_id: userId,
        email: (session.customer_details?.email ?? "").toLowerCase(),
        status: "active",
        stripe_customer_id: session.customer as string,
        stripe_subscription_id: sub.id,
        current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      };
      if (existing) {
        await admin.from("hub_memberships").update(row).eq("id", existing.id);
      } else {
        await admin.from("hub_memberships").insert(row);
      }
    }
  }

  if (
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    const sub = event.data.object as Stripe.Subscription;
    const active =
      event.type === "customer.subscription.updated" &&
      (sub.status === "active" || sub.status === "trialing");
    await admin
      .from("hub_memberships")
      .update({
        status: active ? "active" : "canceled",
        current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("stripe_subscription_id", sub.id);
  }

  return new Response("ok", { status: 200 });
});
