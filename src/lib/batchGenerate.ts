// Shared streaming client for the generate-social-content edge function,
// used by BatchPage to fire several single-post generations in parallel
// (one per target platform) from a single shared topic, and by /generate/answer
// for three answers to one question (answer mode).
//
// GeneratePage.tsx has its own inline copy of this same fetch+SSE pattern
// (it also drives hooks-first mode and multi-variant re-rolls, which batch
// mode doesn't need) - this is the minimal single-post subset, kept
// separate so batch mode doesn't depend on GeneratePage's internal state.

import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/supabase";
import { leoUser } from "@/lib/useLeoOnly";
import { memoryLine } from "@/lib/voiceMemory";
import type { AnswerShape, Audience, CtaType, Format, Pillar, Platform } from "../../supabase/functions/generate-social-content/logic.ts";

/** How many answers /generate/answer writes at once, each with its own opening. */
export const ANSWER_COUNT = 3;
/** /generate/vsl writes version A and B of one script, each with its own opening. */
export const VSL_COUNT = 2;

/** The post writer's lists type every field it checks (generate-social-content requestError). */
export interface GeneratePostPayload {
  pillar: Pillar;
  pillarDetail: string;
  ideaSource: string;
  ideaContext?: string;
  format: Format;
  platform: Platform;
  ctaType: CtaType;
  styleReference?: string;
  audience: Audience;
  voiceSummary?: string;
  singlish?: boolean;
  /** The brand's "What do you do?" (professionFor); left out for an adviser. */
  profession?: string;
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

/**
 * POSTs one request to the writer and hands each server-sent event to `onEvent`, which returns false to stop reading.
 * Resolves true when the stream ran to its end. An abort resolves false silently; any other failure is reported through
 * `onError` first.
 */
async function readWriterStream(
  body: Record<string, unknown>,
  onEvent: (evt: Record<string, unknown>) => boolean | void,
  onError: (message: string) => void,
  signal?: AbortSignal,
): Promise<boolean> {
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
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") return false;
    onError(err instanceof Error ? err.message : "Request failed");
    return false;
  }

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    onError(`Generation failed (${res.status}) ${text}`.trim());
    return false;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

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
        let evt: Record<string, unknown>;
        try {
          evt = JSON.parse(payloadStr);
        } catch (err) {
          console.error("SSE parse error:", err, payloadStr);
          continue;
        }
        if (onEvent(evt) === false) return false;
      }
    }
  } catch (err) {
    if ((err as Error).name === "AbortError") return false;
    onError(err instanceof Error ? err.message : "Stream failed");
    return false;
  } finally {
    try {
      reader.releaseLock();
    } catch (_) {
      // ignore
    }
  }
  return true;
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
  let finalText = "";
  const ran = await readWriterStream(
    { ...(await withMemory(payload)), mode: "post", n: 1, stream: true },
    (evt) => {
      if (evt.type === "token") {
        finalText += evt.text as string;
        handlers.onToken?.(finalText);
      } else if (evt.type === "variant_complete") {
        finalText = evt.text as string;
        handlers.onToken?.(finalText);
      } else if (evt.type === "error") {
        handlers.onError((evt.message as string) ?? "Stream error");
        return false;
      }
    },
    handlers.onError,
    signal,
  );
  if (ran) handlers.onComplete(finalText);
}

/** /generate/answer's request: the question goes in ideaContext (generate-social-content answer mode). */
export interface AnswerPayload {
  ideaContext: string;
  community?: string;
  linkRule?: string;
  answerShape: AnswerShape;
  voiceSummary?: string;
  /** The brand's "What do you do?" (professionFor); left out for an adviser. */
  profession?: string;
}

/**
 * Several versions in one request, each with its own opening, streamed side by side. A failed version
 * reports its own index and the others carry on; a failure before any version starts reports index null.
 */
async function streamVariants(
  payload: Record<string, unknown>,
  handlers: {
    onToken: (index: number, text: string) => void;
    onComplete: (index: number, text: string) => void;
    onError: (index: number | null, message: string) => void;
  },
  signal?: AbortSignal,
): Promise<void> {
  const texts: string[] = [];
  await readWriterStream(
    { ...payload, stream: true },
    (evt) => {
      const i = typeof evt.variantIndex === "number" ? evt.variantIndex : null;
      if (evt.type === "token" && i !== null) {
        texts[i] = (texts[i] ?? "") + (evt.text as string);
        handlers.onToken(i, texts[i]);
      } else if (evt.type === "variant_complete" && i !== null) {
        // the finished text wins over the tokens, as in streamOnePost
        texts[i] = evt.text as string;
        handlers.onToken(i, texts[i]);
        handlers.onComplete(i, texts[i]);
      } else if (evt.type === "error") {
        handlers.onError(i, (evt.message as string) ?? "Stream error");
        if (i === null) return false;
      }
    },
    (message) => handlers.onError(null, message),
    signal,
  );
}

type VariantHandlers = Parameters<typeof streamVariants>[1];

/** Three answers to one question (/generate/answer). */
export const streamAnswers = (payload: AnswerPayload, handlers: VariantHandlers, signal?: AbortSignal) =>
  streamVariants({ ...payload, mode: "answer", n: ANSWER_COUNT }, handlers, signal);

/** /generate/vsl's request: the intake answers as vslBrief() in ideaContext (generate-social-content vsl mode). */
export interface VslPayload {
  ideaContext: string;
  voiceSummary?: string;
  /** The brand's "What do you do?" (professionFor); left out for an adviser. */
  profession?: string;
}

/** Version A and B of one VSL script (/generate/vsl). */
export const streamVsl = (payload: VslPayload, handlers: VariantHandlers, signal?: AbortSignal) =>
  streamVariants({ ...payload, mode: "vsl", n: VSL_COUNT }, handlers, signal);
