// Sign-in by email link (Leo, 2026-10-16: "make it like a magic link login"). Supabase sends the email
// from the academy project's Resend SMTP; it carries both a link and a code, so a link opened on another
// device can still be finished here by typing the code.

import { supabase } from "@/lib/supabase";

// demo.com is a real domain nobody here owns: never email it (memory: demo logins are a real domain)
const NO_MAIL = /@demo\.com$/i;

export async function sendSignInLink(email: string, redirectTo: string, createAccount: boolean): Promise<string | null> {
  const e = email.trim();
  if (NO_MAIL.test(e)) return "Demo accounts sign in with their password.";
  const { error } = await supabase.auth.signInWithOtp({ email: e, options: { emailRedirectTo: redirectTo, shouldCreateUser: createAccount } });
  if (!error) return null;
  if (/signups? not allowed|not found/i.test(error.message)) return "No account uses that email yet. Ask Leo for an invite link.";
  if (error.status === 429 || /rate limit|security purposes/i.test(error.message)) return "Too many emails just now. Wait a minute, then try again.";
  return error.message;
}

export async function verifySignInCode(email: string, code: string): Promise<string | null> {
  const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.replace(/\s/g, ""), type: "email" });
  return error ? "That code didn't work. Check it, or ask for a new email." : null;
}
