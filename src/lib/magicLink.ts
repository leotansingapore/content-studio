// Sign-in by email link (Leo, 2026-10-16: "make it like a magic link login"). Supabase sends the email
// from the academy project's Resend SMTP; it carries both a link and a code. The client uses PKCE, so the
// link only finishes in the browser that asked; on another device the person types the code here.

import { supabase } from "@/lib/supabase";

// demo.com is a real domain nobody here owns: never email it (memory: demo logins are a real domain)
const NO_MAIL = /@demo\.com$/i;

export async function sendSignInLink(email: string, redirectTo: string, createAccount: boolean): Promise<string | null> {
  const e = email.trim();
  if (NO_MAIL.test(e)) return "Demo accounts sign in with their password.";
  const { error } = await supabase.auth.signInWithOtp({ email: e, options: { emailRedirectTo: redirectTo, shouldCreateUser: createAccount } });
  if (!error) return null;
  // the same answer whether or not an account uses the email, so the form can't be used to look people up
  if (/signups? not allowed|not found/i.test(error.message)) return null;
  if (error.status === 429 || /rate limit|security purposes/i.test(error.message)) return "Too many emails just now. Wait a minute, then try again.";
  return error.message;
}

export async function verifySignInCode(email: string, code: string): Promise<string | null> {
  const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.replace(/\s/g, ""), type: "email" });
  return error ? "That code didn't work. Check it, or ask for a new email." : null;
}

/** /auth?email=..&checkout=done, where /start/done sends a new customer (docs/postmosis-billing.md): the address to
 * email a sign-in link, and the URL to leave in the bar so a reload sends nothing more. Null for any other arrival. */
export function checkoutArrival(search: string): { email: string; cleaned: string } | null {
  const q = new URLSearchParams(search);
  const email = (q.get("email") ?? "").trim();
  return q.get("checkout") === "done" && email ? { email, cleaned: `/auth?email=${encodeURIComponent(email)}` } : null;
}

/** One sign-in email a minute from this page (Supabase holds its own limit behind it): seconds until the next. */
export const RESEND_MS = 60_000;
export const resendWait = (sentAt: number, now: number): number => (sentAt ? Math.max(0, Math.ceil((sentAt + RESEND_MS - now) / 1000)) : 0);

export const LINK_FAILED = "That sign-in link didn't work. It may have expired or been used, or it opened in a different browser from the one that asked. Type the code from the email, or send a new link.";

const LINK_PARAMS = ["code", "error", "error_code", "error_description"];

export const linkFailed = (search: string, hash: string): boolean => {
  const q = new URLSearchParams(search);
  return q.has("code") || q.has("error") || new URLSearchParams(hash.replace(/^#/, "")).has("error");
};

export const returnTo = (pathname: string, search: string, hash: string): { from: string; linkFailed: boolean } => {
  if (!linkFailed(search, hash)) return { from: pathname + search + hash, linkFailed: false };
  const q = new URLSearchParams(search);
  LINK_PARAMS.forEach((k) => q.delete(k));
  const rest = q.toString();
  return { from: pathname + (rest ? `?${rest}` : ""), linkFailed: true };
};
