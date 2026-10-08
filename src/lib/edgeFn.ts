// Calls one of our edge functions with the signed-in session and turns a refusal
// into an Error carrying the function's own plain-words message (daily limit,
// not switched on, try again). Used by the stock search, AI image, AI voiceover
// and post score.

import { supabase } from "@/lib/supabase";

export class EdgeError extends Error {
  status: number;
  code: string;
  constructor(message: string, status: number, code = "") {
    super(message);
    this.name = "EdgeError";
    this.status = status;
    this.code = code;
  }
}

export async function callFn<T>(name: string, body: unknown, fallback = "That didn't go through. Try again in a minute."): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    // FunctionsHttpError hides the status and JSON body behind error.context.
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      const payload = (await ctx.json().catch(() => null)) as { error?: string; code?: string } | null;
      throw new EdgeError(payload?.error || fallback, ctx.status, payload?.code ?? "");
    }
    throw new EdgeError("Couldn't reach the server. Check your connection and try again.", 0);
  }
  return data as T;
}
