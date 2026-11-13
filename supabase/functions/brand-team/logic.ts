// brand-team's pure parts (docs/shared-brands.md): the request, the invite token and its hash, the address, the
// words of the email and of each refusal. No Deno or npm imports, so vitest runs them.

export const APP = "https://app.postmosis.com";
export const JOIN_URL = `${APP}/brands/join`;
export const INVITE_DAYS = 7;
const PROFILE = /^(me|p[a-z0-9]{1,39})$/;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
// demo.com is a real domain nobody here owns (magicLink.ts): never email it
const DEMO = /@demo\.com$/i;

export type Req =
  | { action: "invite"; profileId: string; name: string; email: string }
  | { action: "start"; token: string }
  | { action: "covered" };

/** Line breaks and control characters out, runs of spaces to one, then cut: a name can't write its own email. */
export function cleanText(raw: unknown, max: number): string {
  return typeof raw === "string" ? raw.replace(/[\x00-\x1f\x7f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max).trim() : "";
}

/** One plain address, trimmed and lower-cased, or null. */
export function cleanEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const e = raw.trim().toLowerCase();
  return e.length <= 254 && /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[a-z]{2,24}$/.test(e) ? e : null;
}

export function parseRequest(body: unknown): { ok: true; req: Req } | { ok: false; status: number; error: string } {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  if (b.action === "covered") return { ok: true, req: { action: "covered" } };
  if (b.action === "start") {
    return typeof b.token === "string" && TOKEN.test(b.token)
      ? { ok: true, req: { action: "start", token: b.token } }
      : { ok: false, status: 400, error: "This invite link is broken. Open it again from the email." };
  }
  if (b.action === "invite") {
    if (typeof b.profileId !== "string" || !PROFILE.test(b.profileId)) return { ok: false, status: 400, error: "This brand can't be shared." };
    const name = cleanText(b.name, 40);
    if (!name) return { ok: false, status: 400, error: "The brand needs a name first." };
    if (typeof b.email === "string" && DEMO.test(b.email.trim())) return { ok: false, status: 400, error: "Demo addresses can't be invited." };
    const email = cleanEmail(b.email);
    if (!email) return { ok: false, status: 400, error: "That doesn't look like an email address." };
    return { ok: true, req: { action: "invite", profileId: b.profileId, name, email } };
  }
  return { ok: false, status: 400, error: "Unknown request." };
}

/** 32 random bytes, base64url: the one-time part of the invite link. */
export function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Hex sha256 of the token, as 037 computes it (only this is stored). */
export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

/** Who the email says invited them: the name on the account, else the start of its email. */
export function inviterName(user: { email?: string | null; user_metadata?: Record<string, unknown> | null }): string {
  const meta = user.user_metadata ?? {};
  return cleanText(meta.full_name, 60) || cleanText(meta.name, 60) || cleanText((user.email ?? "").split("@")[0], 60) || "Someone";
}

export function inviteEmail({ inviter, brand, token }: { inviter: string; brand: string; token: string }): { subject: string; text: string } {
  return {
    subject: `${inviter} invited you to ${brand} on Postmosis`,
    text: [
      "Hi,",
      "",
      `${inviter} added you to ${brand} on Postmosis, so you can work on its posts, plan and calendar together.`,
      "",
      `Join here. The link works once and lasts ${INVITE_DAYS} days:`,
      `${JOIN_URL}#${token}`,
      "",
      "You sign in with this email address. If you weren't expecting this, you can ignore it.",
      "",
      "Postmosis",
    ].join("\n"),
  };
}

/** A refusal 037's cs_brand_invite raises, in words for the owner; null for anything else (a real error). */
export function inviteRefusal(message: string): { status: number; error: string } | null {
  if (message.includes("owner_self")) return { status: 400, error: "That's your own email." };
  if (message.includes("recipient_cap")) return { status: 429, error: "That address has had enough invites today. Try again tomorrow." };
  if (message.includes("team_full")) return { status: 409, error: "Your team is full: 10 people across your brands. Remove someone to invite another." };
  if (message.includes("not_owner")) return { status: 403, error: "Only the brand's owner can invite people." };
  return null;
}
