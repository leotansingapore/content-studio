// Jev's judgment calls in Write other than the sounds-human check
// (humanCheck.ts), from the writing-judge edge function. Each one has a plain
// fallback: when the call fails or Jev has no clear answer, the page simply
// shows no recommendation.

import { callFn } from "@/lib/edgeFn";
import type { ProfileScore } from "../../supabase/functions/writing-judge/logic.ts";

export type { ProfileItemId, ProfileScore } from "../../supabase/functions/writing-judge/logic.ts";

/** The index of the hook Jev recommends for this audience, or null. */
export async function pickHook(hooks: string[], audience: string, topic: string, platform: string): Promise<number | null> {
  try {
    const res = await callFn<{ pick: { index: number } | null }>("writing-judge", { mode: "hooks", hooks, audience, topic, platform });
    const i = res?.pick?.index;
    return typeof i === "number" && Number.isInteger(i) && i >= 0 && i < hooks.length ? i : null;
  } catch {
    return null;
  }
}

/** Generate waits at most this long for the idea check, then writes without it. */
const IDEA_WAIT_MS = 4000;

/** True when Jev reads the brief as thin (ask one question first); null when it can't say in time. */
export async function ideaIsThin(topic: string, notes: string, kind: string): Promise<boolean | null> {
  const call = callFn<{ thin: boolean | null }>("writing-judge", { mode: "idea", topic, notes, kind })
    .then((res) => (typeof res?.thin === "boolean" ? res.thin : null))
    .catch(() => null);
  return Promise.race([call, new Promise<null>((done) => setTimeout(() => done(null), IDEA_WAIT_MS))]);
}


/** Your own profile out of 100 from what the account audit read; throws with the function's own words. */
export async function scoreProfile(input: {
  platform: "instagram" | "tiktok";
  name: string;
  bio: string;
  pinned: string[];
  top: string[];
  link: string | null;
}): Promise<ProfileScore> {
  const res = await callFn<ProfileScore>("writing-judge", { mode: "profile", ...input }, "Couldn't score your profile right now. Try again in a minute.");
  if (typeof res?.score !== "number" || !Array.isArray(res.items)) throw new Error("Couldn't score your profile right now. Try again in a minute.");
  return res;
}

/** True when Jev reads a carousel idea as one point that would work better as a text post; null when it can't say in time. */
export async function textPostBetter(idea: string): Promise<boolean | null> {
  const call = callFn<{ textPostBetter: boolean | null }>("writing-judge", { mode: "carousel", idea })
    .then((res) => (typeof res?.textPostBetter === "boolean" ? res.textPostBetter : null))
    .catch(() => null);
  return Promise.race([call, new Promise<null>((done) => setTimeout(() => done(null), IDEA_WAIT_MS))]);
}
