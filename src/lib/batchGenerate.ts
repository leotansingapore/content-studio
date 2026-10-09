// Shared streaming client for the generate-social-content edge function,
// used by BatchPage to fire several single-post generations in parallel
// (one per target platform) from a single shared topic.
//
// GeneratePage.tsx has its own inline copy of this same fetch+SSE pattern
// (it also drives hooks-first mode and multi-variant re-rolls, which batch
// mode doesn't need) - this is the minimal single-post subset, kept
// separate so batch mode doesn't depend on GeneratePage's internal state.

import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/supabase";

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
      body: JSON.stringify({ ...payload, mode: "post", n: 1, stream: true }),
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
