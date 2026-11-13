import { isLeoEmail } from "../_shared/leo.ts";

export const HELD_LIMIT = 200;

export const HELD_COLUMNS = "stripe_subscription_id, stripe_customer_id, email, status, reason, created_at, updated_at";

export type HeldRow = {
  stripe_subscription_id: string;
  stripe_customer_id: string;
  email: string;
  status: string;
  reason: string;
  created_at: string;
  updated_at: string;
};

export type HeldView = {
  subscription: string;
  customer: string;
  email: string;
  status: string;
  reason: string;
  at: string;
  updated: string;
  link: string;
  attached: boolean;
};

export type HeldList = { rows: HeldView[]; more: boolean; test: boolean };

export type HeldDeps = {
  email: (jwt: string) => Promise<string | null>;
  unresolved: (limit: number) => Promise<HeldRow[]>;
  onAccounts: (subscriptions: string[]) => Promise<string[]>;
  test: boolean;
};

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json", "Cache-Control": "no-store" } });

export const stripeLink = (subscription: string, test: boolean): string =>
  `https://dashboard.stripe.com/${test ? "test/" : ""}subscriptions/${encodeURIComponent(subscription)}`;

export const testModeOf = (get: (k: string) => string | undefined, publishable: string | null): boolean => {
  const secret = (get("POSTMOSIS_STRIPE_SECRET_KEY") ?? "").trim();
  return secret ? /^(sk|rk)_test_/.test(secret) : (publishable ?? "").startsWith("pk_test_");
};

export const viewOf = (row: HeldRow, test: boolean, attached = false): HeldView => ({
  subscription: row.stripe_subscription_id,
  customer: row.stripe_customer_id,
  email: row.email,
  status: row.status,
  reason: row.reason,
  at: row.created_at,
  updated: row.updated_at,
  link: stripeLink(row.stripe_subscription_id, test),
  attached,
});

export async function handleHeld(req: Request, d: HeldDeps): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  let email: string | null = null;
  try {
    email = jwt ? await d.email(jwt) : null;
  } catch {
    email = null;
  }
  if (!email) return json({ code: "signed_out", error: "Sign in again." }, 401);
  if (!isLeoEmail(email)) return json({ code: "not_allowed", error: "This list is Leo's." }, 403);
  try {
    const rows = await d.unresolved(HELD_LIMIT + 1);
    const shown = rows.slice(0, HELD_LIMIT);
    const on = new Set(shown.length ? await d.onAccounts(shown.map((r) => r.stripe_subscription_id)) : []);
    const views = shown.map((r) => viewOf(r, d.test, on.has(r.stripe_subscription_id)));
    const list: HeldList = { rows: [...views.filter((v) => !v.attached), ...views.filter((v) => v.attached)], more: rows.length > HELD_LIMIT, test: d.test };
    return json(list);
  } catch {
    return json({ code: "read_failed", error: "Couldn't read held payments. Try again in a minute." }, 500);
  }
}
