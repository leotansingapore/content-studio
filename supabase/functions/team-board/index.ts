// team-board: Leo's posts board for Leo and the people he invites (design: docs/team-roles.md).
// Proves who is asking (the Supabase user id, never the email), finds their live row in cs_board_members
// (022), and forwards board actions to the posts board (moneybees-reels studio/api) with BOARD_KEY and the
// actor. The board decides every write against the card as it is now; this function never does.
//
// Secrets: BOARD_KEY (same value as the moneybees-studio Vercel env), MB_STUDIO_URL, TEAM_OWNER_IDS (Leo's
// user id), TEAM_CLAIM_DENY_IDS (shared logins such as the demo account, which may never claim an invite).
// Deploy WITH JWT verification:
//   supabase functions deploy team-board --project-ref hgdbflprrficdoyxmdxe --use-api

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.3";
import { consumeUsage, usageRefusal } from "../_shared/usageCaps.ts";
import {
  actorFor, boardCall, encodeActor, hashToken, idSet, INVITE_DAYS, inviteLink, MODULES, newToken, parseRequest, statusOf,
  type MemberRow,
} from "./logic.ts";

const APP = "https://consultant-content-studio.vercel.app";
const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
const COLS = "id, label, role, brands, modules, member_id, invite_expires_at, claimed_at, revoked_at, created_at";
const expiry = () => new Date(Date.now() + INVITE_DAYS * 864e5).toISOString();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: userData } = await admin.auth.getUser(jwt);
  const uid = userData?.user?.id;
  if (!uid) return json({ error: "Sign in again." }, 401);

  const parsed = parseRequest(await req.json().catch(() => ({})));
  if (!parsed.ok) return json({ error: parsed.error }, parsed.status);
  const r = parsed.req;
  const owner = idSet(Deno.env.get("TEAM_OWNER_IDS")).has(uid);

  try {
    // Claiming comes before the membership gate: the person isn't a member until it succeeds.
    if (r.action === "claim") {
      if (owner || idSet(Deno.env.get("TEAM_CLAIM_DENY_IDS")).has(uid)) {
        return json({ error: "This account can't join a team. Sign in with your own account." }, 403);
      }
      const { data, error } = await admin.from("cs_board_members")
        .update({ member_id: uid, claimed_at: new Date().toISOString(), invite_hash: null })
        .eq("invite_hash", await hashToken(r.token)).is("claimed_at", null).is("revoked_at", null)
        .gt("invite_expires_at", new Date().toISOString())
        .select("label, role, brands");
      if (error?.code === "23505") return json({ error: "You're already on Leo's team. Ask Leo to add the brand instead." }, 409);
      // the table's own check: an owner can never join their own team, even if TEAM_OWNER_IDS is wrong
      if (error?.code === "23514") return json({ error: "This account can't join a team. Sign in with your own account." }, 403);
      if (error) throw new Error(`claim: ${error.message}`);
      if (!data?.length) return json({ error: "This invite link has expired or was already used. Ask Leo for a new one." }, 410);
      return json({ joined: true, ...data[0] });
    }

    let member: MemberRow | null = null;
    if (!owner) {
      const { data, error } = await admin.from("cs_board_members").select(COLS).eq("member_id", uid).is("revoked_at", null).maybeSingle();
      if (error) throw new Error(`member: ${error.message}`);
      member = data as MemberRow | null;
    }
    const actor = actorFor(uid, owner, member);

    if (r.action === "me") {
      if (owner) return json({ owner: true, member: false, id: uid, role: "owner", brands: ["*"], modules: MODULES, label: "Leo" });
      if (!actor || !member) return json({ owner: false, member: false });
      return json({ owner: false, member: true, id: uid, role: member.role, brands: actor.brands, modules: member.modules, label: member.label });
    }
    if (!actor) return json({ error: "You're not on this team." }, 403);

    if (r.action === "board" || r.action === "card" || r.action === "comment" || r.action === "resolve") {
      if (!owner && !member!.modules.includes("reels")) return json({ error: "You're not on this team." }, 403);
      if (r.action === "comment" && !owner) {
        const usage = await consumeUsage(admin, uid, "team-comment");
        if (!usage.allowed) {
          const refusal = usageRefusal(usage);
          return json(refusal.body, refusal.status);
        }
      }
      const key = Deno.env.get("BOARD_KEY"), base = Deno.env.get("MB_STUDIO_URL");
      if (!key || !base) throw new Error("BOARD_KEY or MB_STUDIO_URL unset");
      const call = boardCall(r);
      const res = await fetch(base + call.path, {
        method: call.body === undefined ? "GET" : "POST",
        headers: { "x-board-key": key, "x-board-actor": encodeActor(actor), ...(call.body === undefined ? {} : { "Content-Type": "application/json" }) },
        body: call.body === undefined ? undefined : JSON.stringify(call.body),
        signal: AbortSignal.timeout(25_000),
      });
      const body = await res.json().catch(() => null);
      // the board's refusals are plain sentences meant for the person; anything else stays in the log
      // a 401 from the board means this function's key is wrong, not that the person lost access
      if (res.status >= 500 || res.status === 401 || !body) {
        console.error("board answered", res.status, call.path);
        return json({ error: "The board didn't answer. Try again." }, 502);
      }
      return json(body, res.status);
    }

    // The team itself: Leo only.
    if (!owner) return json({ error: "Only Leo manages the team." }, 403);
    if (r.action === "team.list") {
      const { data, error } = await admin.from("cs_board_members").select(COLS).eq("owner_id", uid).order("created_at");
      if (error) throw new Error(`list: ${error.message}`);
      const rows = (data ?? []) as MemberRow[];
      // which account joined, so Leo can tell two people with one name apart
      const emails = new Map<string, string>();
      await Promise.all(rows.filter((x) => x.member_id).map(async (x) => {
        const { data: u } = await admin.auth.admin.getUserById(x.member_id!);
        if (u?.user?.email) emails.set(x.member_id!, u.user.email);
      }));
      return json({ members: rows.map((x) => ({ ...x, member_id: undefined, email: x.member_id ? emails.get(x.member_id) ?? null : null, status: statusOf(x) })) });
    }
    if (r.action === "team.invite") {
      const token = newToken();
      const { data, error } = await admin.from("cs_board_members")
        .insert({ owner_id: uid, label: r.label, role: r.role, brands: r.brands, invite_hash: await hashToken(token), invite_expires_at: expiry() })
        .select(COLS).single();
      if (error) throw new Error(`invite: ${error.message}`);
      return json({ member: { ...data, member_id: undefined, email: null, status: "invited" }, link: inviteLink(APP, token) });
    }
    if (r.action === "team.reinvite") {
      const token = newToken();
      const { data, error } = await admin.from("cs_board_members")
        .update({ invite_hash: await hashToken(token), invite_expires_at: expiry() })
        .eq("id", r.id).eq("owner_id", uid).is("claimed_at", null).is("revoked_at", null).select("id");
      if (error) throw new Error(`reinvite: ${error.message}`);
      if (!data?.length) return json({ error: "That invite was already used or removed. Send a new invite instead." }, 409);
      return json({ link: inviteLink(APP, token) });
    }
    if (r.action === "team.update") {
      const patch = { ...(r.label ? { label: r.label } : {}), ...(r.role ? { role: r.role } : {}), ...(r.brands ? { brands: r.brands } : {}) };
      const { data, error } = await admin.from("cs_board_members").update(patch)
        .eq("id", r.id).eq("owner_id", uid).is("revoked_at", null).select(COLS);
      if (error) throw new Error(`update: ${error.message}`);
      if (!data?.length) return json({ error: "That person isn't on the team any more." }, 404);
      return json({ member: { ...data[0], member_id: undefined, status: statusOf(data[0] as MemberRow) } });
    }
    // team.revoke
    const { data, error } = await admin.from("cs_board_members").update({ revoked_at: new Date().toISOString(), invite_hash: null })
      .eq("id", r.id).eq("owner_id", uid).is("revoked_at", null).select("id");
    if (error) throw new Error(`revoke: ${error.message}`);
    if (!data?.length) return json({ error: "That person isn't on the team any more." }, 404);
    return json({ revoked: true });
  } catch (e) {
    console.error("team-board", r.action, e);
    return json({ error: "Something went wrong. Try again." }, 500);
  }
});
