// Creates a Stripe subscription Checkout session for the Members Hub.
// Returns 503 payments-not-configured until STRIPE_SECRET_KEY + HUB_PRICE_ID are set.
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@16";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const key = Deno.env.get("STRIPE_SECRET_KEY");
  const price = Deno.env.get("HUB_PRICE_ID");
  if (!key || !price) {
    return new Response(JSON.stringify({ error: "payments-not-configured" }), {
      status: 503,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const supa = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
  );
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return new Response("unauthorized", { status: 401, headers: cors });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data: m } = await admin
    .from("hub_memberships")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const stripe = new Stripe(key);
  const origin = req.headers.get("origin") ?? "https://consultant-content-studio.vercel.app";
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price, quantity: 1 }],
    customer: m?.stripe_customer_id ?? undefined,
    customer_email: m?.stripe_customer_id ? undefined : user.email,
    client_reference_id: user.id,
    success_url: `${origin}/hub?checkout=success`,
    cancel_url: `${origin}/hub?checkout=cancel`,
  });

  return new Response(JSON.stringify({ url: session.url }), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
