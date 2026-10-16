// Pure parts of team-board (docs/team-roles.md): reading requests, invite tokens and the actor the posts board
// trusts. No Deno or npm imports, so vitest can test it. The board itself (moneybees-reels studio/api) decides
// every write against the card as it is; this side only proves who is asking.

export const ROLES = ["viewer", "commenter", "editor", "approver"] as const;
export type Role = (typeof ROLES)[number];
/** The posts board's brands (moneybees-reels studio/api/_db.js BRANDS). */
export const BOARD_BRANDS = ["leo", "moneybees", "finternship", "businessacademy", "activitytracker"];
export const MODULES = ["reels"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
export const INVITE_DAYS = 7;

export interface MemberRow {
  id: string;
  label: string;
  role: Role;
  brands: string[];
  modules: string[];
  member_id: string | null;
  invite_expires_at: string | null;
  claimed_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

export interface Actor {
  id: string;
  label: string;
  role: Role | "owner";
  brands: string[];
}

/** "uid1, uid2" -> set; empty when unset. */
export const idSet = (v: string | undefined): Set<string> => new Set((v ?? "").split(",").map((s) => s.trim()).filter(Boolean));

/** Who the board acts for: Leo (every brand) or a live member (their brands). null: neither. */
export function actorFor(uid: string, owner: boolean, member: MemberRow | null): Actor | null {
  if (owner) return { id: uid, label: "Leo", role: "owner", brands: ["*"] };
  if (!member || member.revoked_at || member.member_id !== uid) return null;
  return { id: uid, label: member.label, role: member.role, brands: member.brands.filter((b) => BOARD_BRANDS.includes(b)) };
}

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export const encodeActor = (a: Actor) => b64url(new TextEncoder().encode(JSON.stringify(a)));

/** 32 random bytes, base64url (43 characters). */
export const newToken = () => b64url(crypto.getRandomValues(new Uint8Array(32)));
export async function hashToken(token: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)));
  return [...d].map((x) => x.toString(16).padStart(2, "0")).join("");
}
export const inviteLink = (origin: string, token: string) => `${origin}/join#${token}`;

/** What the owner's team list shows; never the hash. */
export function statusOf(r: MemberRow, now = Date.now()): "revoked" | "joined" | "expired" | "invited" {
  if (r.revoked_at) return "revoked";
  if (r.claimed_at) return "joined";
  return r.invite_expires_at && Date.parse(r.invite_expires_at) > now ? "invited" : "expired";
}

export type CardPatch = Partial<Record<"stage" | "caption" | "schedule" | "version" | "brand", string>>;
export type Req =
  | { action: "me" }
  | { action: "board" }
  | { action: "card"; id: string; patch: CardPatch }
  | { action: "comment"; id: string; text: string; t: number | null; slide: number | null }
  | { action: "resolve"; id: string; cid: string; resolved: boolean }
  | { action: "claim"; token: string }
  | { action: "team.list" }
  | { action: "team.invite"; label: string; role: Role; brands: string[] }
  | { action: "team.update"; id: string; label?: string; role?: Role; brands?: string[] }
  | { action: "team.revoke"; id: string }
  | { action: "team.reinvite"; id: string };
type Parsed = { ok: true; req: Req } | { ok: false; status: number; error: string };

const bad = (error: string): Parsed => ({ ok: false, status: 400, error });
const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() && v.length <= max ? v : null);
const label = (v: unknown) => (typeof v === "string" && v.trim().length >= 1 && v.trim().length <= 60 ? v.trim() : null);
const role = (v: unknown): Role | null => (ROLES as readonly string[]).includes(v as string) ? (v as Role) : null;
function brands(v: unknown): string[] | null {
  if (!Array.isArray(v) || v.length === 0 || v.length > 20) return null;
  const out = [...new Set(v)];
  return out.every((b) => typeof b === "string" && BOARD_BRANDS.includes(b)) ? (out as string[]) : null;
}

export function parseRequest(body: unknown): Parsed {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const a = b.action;
  if (a === "me" || a === "board" || a === "team.list") return { ok: true, req: { action: a } };
  if (a === "card" || a === "comment" || a === "resolve") {
    const id = str(b.id, 200);
    if (!id) return bad("Which post?");
    if (a === "card") {
      const p = (b.patch && typeof b.patch === "object" ? b.patch : {}) as Record<string, unknown>;
      const patch: CardPatch = {};
      for (const k of ["stage", "caption", "schedule", "version", "brand"] as const) {
        if (!(k in p)) continue;
        if (typeof p[k] !== "string" || (p[k] as string).length > 2200) return bad("That change isn't valid.");
        patch[k] = p[k] as string;
      }
      if (!Object.keys(patch).length) return bad("Nothing to change.");
      return { ok: true, req: { action: "card", id, patch } };
    }
    if (a === "comment") {
      const text = typeof b.text === "string" ? b.text.trim() : "";
      if (!text || text.length > 2000) return bad("A note is 1 to 2000 characters.");
      const t = typeof b.t === "number" && Number.isFinite(b.t) && b.t >= 0 ? b.t : null;
      const slide = Number.isInteger(b.slide) && (b.slide as number) >= 1 && (b.slide as number) <= 20 ? (b.slide as number) : null;
      return { ok: true, req: { action: "comment", id, text, t, slide } };
    }
    const cid = str(b.cid, 40);
    if (!cid) return bad("Which note?");
    return { ok: true, req: { action: "resolve", id, cid, resolved: b.resolved === true } };
  }
  if (a === "claim") {
    return typeof b.token === "string" && TOKEN.test(b.token)
      ? { ok: true, req: { action: "claim", token: b.token } }
      : bad("This invite link isn't complete. Open the whole link Leo sent.");
  }
  if (a === "team.invite") {
    const l = label(b.label), r = role(b.role), br = brands(b.brands);
    if (!l) return bad("Give them a name, up to 60 characters.");
    if (!r) return bad("Pick a role.");
    if (!br) return bad("Pick at least one brand.");
    return { ok: true, req: { action: a, label: l, role: r, brands: br } };
  }
  if (a === "team.update" || a === "team.revoke" || a === "team.reinvite") {
    if (typeof b.id !== "string" || !UUID.test(b.id)) return bad("Which person?");
    if (a !== "team.update") return { ok: true, req: { action: a, id: b.id } };
    const out: Extract<Req, { action: "team.update" }> = { action: a, id: b.id };
    if ("label" in b) { const l = label(b.label); if (!l) return bad("Give them a name, up to 60 characters."); out.label = l; }
    if ("role" in b) { const r = role(b.role); if (!r) return bad("Pick a role."); out.role = r; }
    if ("brands" in b) { const br = brands(b.brands); if (!br) return bad("Pick at least one brand."); out.brands = br; }
    if (out.label === undefined && out.role === undefined && out.brands === undefined) return bad("Nothing to change.");
    return { ok: true, req: out };
  }
  return bad("Unknown action.");
}

/** The board path and method for a card action (moneybees-reels studio/vercel.json keeps /api/card). */
export function boardCall(req: Extract<Req, { action: "board" | "card" | "comment" | "resolve" }>): { path: string; body?: unknown } {
  if (req.action === "board") return { path: "/api/board" };
  const id = encodeURIComponent(req.id);
  if (req.action === "card") return { path: `/api/card?id=${id}`, body: req.patch };
  if (req.action === "comment") return { path: `/api/card?id=${id}&op=comment`, body: { text: req.text, t: req.t, ...(req.slide ? { slide: req.slide } : {}) } };
  return { path: `/api/card?id=${id}&op=resolve&cid=${encodeURIComponent(req.cid)}`, body: { resolved: req.resolved } };
}
