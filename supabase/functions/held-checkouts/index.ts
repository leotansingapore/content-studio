import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.3";
import { publishableKeyOf } from "../_shared/billing.ts";
import { HELD_COLUMNS, handleHeld, testModeOf, type HeldRow } from "./logic.ts";

const admin = () => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const env = (k: string) => Deno.env.get(k);

Deno.serve((req) =>
  handleHeld(req, {
    email: async (jwt) => (await admin().auth.getUser(jwt)).data?.user?.email ?? null,
    unresolved: async (limit) => {
      const { data, error } = await admin().from("cs_held_checkouts").select(HELD_COLUMNS).is("resolved_at", null).order("created_at", { ascending: false }).limit(limit);
      if (error) throw error;
      return (data ?? []) as HeldRow[];
    },
    onAccounts: async (subscriptions) => {
      const { data, error } = await admin().from("cs_subscriptions").select("stripe_subscription_id").in("stripe_subscription_id", subscriptions);
      if (error) throw error;
      return (data ?? []).map((r: { stripe_subscription_id: string }) => r.stripe_subscription_id);
    },
    test: testModeOf(env, publishableKeyOf(env)),
  })
);
