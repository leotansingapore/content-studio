// Jev's judgment calls in Write other than the sounds-human check
// (humanCheck.ts), from the writing-judge edge function. Each one has a plain
// fallback: when the call fails or Jev has no clear answer, the page simply
// shows no recommendation.

import { callFn } from "@/lib/edgeFn";

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
