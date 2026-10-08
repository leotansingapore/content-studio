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
