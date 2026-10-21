// Shared streaming client for the generate-social-content edge function,
// used by BatchPage to fire several single-post generations in parallel
// (one per target platform) from a single shared topic.
//
// GeneratePage.tsx has its own inline copy of this same fetch+SSE pattern
// (it also drives hooks-first mode and multi-variant re-rolls, which batch
// mode doesn't need) - this is the minimal single-post subset, kept
// separate so batch mode doesn't depend on GeneratePage's internal state.

import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/supabase";
import { leoUser } from "@/lib/useLeoOnly";
import { memoryLine } from "@/lib/voiceMemory";

export interface GeneratePostPayload {
  pillar: string;
  pillarDetail: string;
  ideaSource: string;
  ideaContext?: string;
  format: string;
  platform: string;
  ctaType: string;
  styleReference?: string;
  audience: string;
  voiceSummary?: string;
  singlish?: boolean;
}

/**
 * Leo's facts and learnings for posts after the caller's context (brand-voice-memory, decision 13), so Write's short
 * calls, Batch, the carousel topic writer, the video caption writer and the recruit agent all get them. The context
 * already holds the brand rules, which come first. Everyone else's payload goes out as it came in.
 */
async function withMemory(payload: GeneratePostPayload): Promise<GeneratePostPayload> {
  let me: Awaited<ReturnType<typeof leoUser>> = null;
  try {
    me = await leoUser();
  } catch {
    // a session that can't be read is not Leo's
  }
  const memory = me ? memoryLine(me.id, "posts") : "";
  return memory ? { ...payload, ideaContext: [payload.ideaContext, memory].filter(Boolean).join("\n\n") } : payload;
}

export async function streamOnePost(
  payload: GeneratePostPayload,
  handlers: {
    onToken?: (text: string) => void;
    onComplete: (text: string) => void;
    onError: (message: string) => void;
  },
  signal?: AbortSignal,
): Promise<void> {
  const url = `${SUPABASE_URL}/functions/v1/generate-social-content`;
  const session = (await supabase.auth.getSession()).data.session;
  const token = session?.access_token ?? SUPABASE_ANON_KEY;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        apikey: SUPABASE_ANON_KEY,
        Accept: "text/event-stream",
      },
      body: JSON.stringify({ ...(await withMemory(payload)), mode: "post", n: 1, stream: true }),
      signal,
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") return;
    handlers.onError(err instanceof Error ? err.message : "Request failed");
    return;
  }

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    handlers.onError(`Generation failed (${res.status}) ${text}`.trim());
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalText = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split("\n\n");
      buffer = chunks.pop() ?? "";
      for (const chunk of chunks) {
        const line = chunk.trim();
        if (!line.startsWith("data:")) continue;
        const payloadStr = line.slice(5).trim();
        if (!payloadStr) continue;
        try {
          const evt = JSON.parse(payloadStr);
          if (evt.type === "token") {
            finalText += evt.text as string;
            handlers.onToken?.(finalText);
          } else if (evt.type === "variant_complete") {
            finalText = evt.text as string;
            handlers.onToken?.(finalText);
          } else if (evt.type === "error") {
            handlers.onError((evt.message as string) ?? "Stream error");
            return;
          }
        } catch (err) {
          console.error("SSE parse error:", err, payloadStr);
        }
      }
    }
  } catch (err) {
    if ((err as Error).name === "AbortError") return;
    handlers.onError(err instanceof Error ? err.message : "Stream failed");
    return;
  } finally {
    try {
      reader.releaseLock();
    } catch (_) {
      // ignore
    }
  }

  handlers.onComplete(finalText);
}
