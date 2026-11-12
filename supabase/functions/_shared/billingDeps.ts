// The real Stripe and database behind _shared/billing.ts, for postmosis-start, postmosis-webhook and
// postmosis-portal. The service key is used for exactly this: cs_subscriptions, cs_held_checkouts,
// cs_subscription_events, cs_account_for_email (035) and creating one account for a finished checkout. It never
// makes a session, a token or a sign-in link.

// pinned: these run with the service key
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.3";
import Stripe from "npm:stripe@16.12.0";
import type { Db, Deps, Row, StripeApi, StripeEvent, StripeSession, StripeSub } from "./billing.ts";

const COLUMNS = "user_id, email, status, stripe_customer_id, stripe_subscription_id, trial_end, current_period_end, cancel_at_period_end, past_due_since";

function stripeApi(key: string): StripeApi {
  const s = new Stripe(key);
  return {
    createCheckout: (params) => s.checkout.sessions.create(params as Stripe.Checkout.SessionCreateParams),
    session: async (id) => (await s.checkout.sessions.retrieve(id)) as unknown as StripeSession,
    subscription: async (id) => (await s.subscriptions.retrieve(id, { expand: ["customer"] })) as unknown as StripeSub,
    portal: (customer, return_url) => s.billingPortal.sessions.create({ customer, return_url }),
    verify: async (body, signature, whsec) => {
      try {
        return (await s.webhooks.constructEventAsync(body, signature, whsec)) as unknown as StripeEvent;
      } catch {
        return null;
      }
    },
  };
}

const adminClient = () => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

function database(): Db {
  const admin = adminClient();
  const one = async (column: string, value: string): Promise<Row | null> => {
    const { data, error } = await admin.from("cs_subscriptions").select(COLUMNS).eq(column, value).maybeSingle();
    if (error) throw error;
    return data as Row | null;
  };
  return {
    accountForEmail: async (email) => {
      const { data, error } = await admin.rpc("cs_account_for_email", { p_email: email });
      if (error) throw error;
      const hit = Array.isArray(data) ? data[0] : data;
      return hit?.user_id ? { userId: hit.user_id, madeBy: hit.made_by ?? null } : null;
    },
    createAccount: async (email, madeBy) => {
      // No email goes out. handle_new_user gives the account a profiles row with no roles.
      const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true, app_metadata: { postmosis_subscription: madeBy } });
      if (data?.user?.id) return data.user.id;
      if (error && (error.code === "email_exists" || error.status === 422)) return null;
      throw error ?? new Error("createUser returned nothing");
    },
    rowBySubscription: (id) => one("stripe_subscription_id", id),
    rowByUser: (id) => one("user_id", id),
    rowByCustomer: (id) => one("stripe_customer_id", id),
    saveRow: async (row) => {
      const { error } = await admin.from("cs_subscriptions").upsert(row, { onConflict: "user_id" });
      if (error) throw error;
    },
    claim: async (id, type) => {
      const { error } = await admin.from("cs_subscription_events").insert({ id, type });
      // 23505: a repeat delivery logged it first
      if (error && error.code !== "23505") throw error;
      return !error;
    },
    seen: async (id) => {
      const { data, error } = await admin.from("cs_subscription_events").select("id").eq("id", id).maybeSingle();
      if (error) throw error;
      return !!data;
    },
    saveHold: async (hold) => {
      const { error } = await admin.from("cs_held_checkouts").upsert(hold, { onConflict: "stripe_subscription_id" });
      if (error) throw error;
    },
  };
}

export const deps: Deps = {
  env: (k) => Deno.env.get(k),
  stripe: stripeApi,
  db: database,
  now: () => Date.now(),
  user: async (req) => {
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    return jwt ? (await adminClient().auth.getUser(jwt)).data?.user?.id ?? null : null;
  },
};
