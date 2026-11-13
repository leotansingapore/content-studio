// brand-team: invites to a shared brand (design: docs/shared-brands.md). Three actions:
//   invite  {profileId, name, email}  an owner whose own plan gives access emails a one-time link. Nothing about
//                                     the address's account is looked up here, so the answer can't reveal one.
//   start   {token}                   the join page, signed out: for a live link, makes the invited address an
//                                     account (with a `member` subscription row) if it has none, and says which
//                                     email to sign in with. Needs no user: the anon key passes JWT verification.
//   covered {}                        the app's gate for a member account: whether an owner's plan covers it.
// Taking the invite, the team list, removing, revoking and leaving are 037's SQL functions, called by the app.
//
// Secrets: RESEND_API_KEY (the Postmosis sender notify uses). Caps: brand-invite and brand-invite-global
// (usageCaps.ts), and 037's per-owner and per-address limits.
// Deploy WITH JWT verification:
//   supabase functions deploy brand-team --project-ref hgdbflprrficdoyxmdxe --use-api

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.3";
import { countUsage, GLOBAL_COUNTER_USER, usageRefusal } from "../_shared/usageCaps.ts";
import { hasAccess, MEMBER, readSubscription, teamCovered } from "../_shared/subscription.ts";
import { hashToken, INVITE_DAYS, inviteEmail, inviteRefusal, inviterName, newToken, parseRequest } from "./logic.ts";

const FROM = "Postmosis <noreply@mail.themoneybees.co>";
const GONE = "This invite has expired or was already used. Ask for a new one.";
const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });

type User = { id: string; email?: string | null; app_metadata?: Record<string, unknown> | null; user_metadata?: Record<string, unknown> | null };
// deno-lint-ignore no-explicit-any
type Admin = any;

async function sendEmail(to: string, mail: { subject: string; text: string }, idempotencyKey: string): Promise<boolean> {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) {
    console.error("RESEND_API_KEY missing, no invite sent");
    return false;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
      body: JSON.stringify({ from: FROM, to: [to], subject: mail.subject, text: mail.text }),
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok) return true;
    console.error("resend refused", res.status);
  } catch (e) {
    console.error("resend failed", e instanceof Error ? e.message : e);
  }
  return false;
}

/** An account an invite made gets its member row; never over a row a checkout wrote meanwhile. */
async function memberRow(admin: Admin, userId: string, email: string) {
  const { error } = await admin.from("cs_subscriptions").upsert({ user_id: userId, email, status: MEMBER }, { onConflict: "user_id", ignoreDuplicates: true });
  if (error) throw new Error(`member row: ${error.message}`);
}

async function invite(admin: Admin, user: User, r: { profileId: string; name: string; email: string }): Promise<Response> {
  // only a plan that gives access may invite: no row (older accounts, academy logins, the demo login) can't mint accounts
  const row = await readSubscription(admin, user.id);
  if (!row || !hasAccess(row, Date.now())) return json({ error: "Inviting your team needs an active plan.", code: "plan" }, 403);
  for (const [who, feature] of [[user.id, "brand-invite"], [GLOBAL_COUNTER_USER, "brand-invite-global"]] as const) {
    const usage = await countUsage(admin, who, feature);
    if (!usage.allowed) {
      const refusal = usageRefusal(usage);
      return json(refusal.body, refusal.status);
    }
  }
  const { data: brand, error: brandError } = await admin
    .from("cs_brands")
    .upsert({ owner_id: user.id, profile_id: r.profileId, name: r.name }, { onConflict: "owner_id,profile_id" })
    .select("id")
    .single();
  if (brandError || !brand) throw new Error(`brand: ${brandError?.message}`);
  const token = newToken();
  const { data: inviteId, error } = await admin.rpc("cs_brand_invite", {
    p_brand: brand.id,
    p_inviter: user.id,
    p_email: r.email,
    p_hash: await hashToken(token),
    p_expires: new Date(Date.now() + INVITE_DAYS * 864e5).toISOString(),
  });
  if (error) {
    const refusal = inviteRefusal(String(error.message ?? ""));
    if (refusal) return json({ error: refusal.error }, refusal.status);
    throw new Error(`invite: ${error.message}`);
  }
  const sent = await sendEmail(r.email, inviteEmail({ inviter: inviterName(user), brand: r.name, token }), `brand-invite-${inviteId}`);
  // the invite row is filed but its only link didn't go: pressing Invite again turns it off and sends a new one
  if (!sent) return json({ error: "Couldn't send the invite. Try again in a minute." }, 503);
  return json({ invited: true, email: r.email });
}

async function start(admin: Admin, token: string): Promise<Response> {
  const { data, error } = await admin.rpc("cs_brand_invite_open", { p_hash: await hashToken(token) });
  if (error) throw new Error(`open: ${error.message}`);
  const open = (data ?? [])[0] as { email: string; brand_name: string; invited_by: string } | undefined;
  if (!open) return json({ error: GONE }, 410);
  const lookup = async (): Promise<string | null> => {
    const found = await admin.rpc("cs_account_for_email", { p_email: open.email });
    if (found.error) throw new Error(`lookup: ${found.error.message}`);
    return (found.data ?? [])[0]?.user_id ?? null;
  };
  let id = await lookup();
  if (!id) {
    const made = await admin.auth.admin.createUser({ email: open.email, email_confirm: true, app_metadata: { postmosis_invited_by: open.invited_by } });
    // another tab opened the same link a moment earlier and made it
    id = made.error ? await lookup() : made.data?.user?.id ?? null;
    if (!id) throw new Error(`create: ${made.error?.message ?? "no id"}`);
  }
  const { data: u } = await admin.auth.admin.getUserById(id);
  if (u?.user?.app_metadata?.postmosis_invited_by) await memberRow(admin, id, open.email);
  return json({ email: open.email, brand: open.brand_name });
}

async function covered(admin: Admin, user: User): Promise<Response> {
  const row = await readSubscription(admin, user.id);
  if (!row) {
    // an account from before billing stays open; one an invite made without its row gets the row now
    if (!user.app_metadata?.postmosis_invited_by) return json({ covered: true });
    await memberRow(admin, user.id, user.email ?? "");
  } else if (row.status !== MEMBER) {
    return json({ covered: hasAccess(row, Date.now()) });
  }
  return json({ covered: await teamCovered(admin, user.id) });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  const parsed = parseRequest(await req.json().catch(() => ({})));
  if (!parsed.ok) return json({ error: parsed.error }, parsed.status);
  const r = parsed.req;
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  try {
    if (r.action === "start") return await start(admin, r.token);
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data } = await admin.auth.getUser(jwt);
    const user = data?.user as User | null;
    if (!user?.id) return json({ error: "Sign in again." }, 401);
    if (r.action === "covered") return await covered(admin, user);
    return await invite(admin, user, r);
  } catch (e) {
    // details stay in the log; the person gets a sentence
    console.error("brand-team", r.action, e instanceof Error ? e.message : e);
    return json({ error: "That didn't go through. Try again in a minute." }, 500);
  }
});
