// The post writer: Write, Batch and Your voice here, and the academy hub's Content Studio page (both signed in).
// Every request is size-checked (logic.ts requestError, 400), then counts once against the signed-in user's
// "write-post" day (401 with no user, 429 over the cap); a request OpenAI fails on is given back.
// Secrets: OPENAI_API_KEY. Logic: ./logic.ts (tested). Caps: ../_shared/usageCaps.ts.
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { openaiFetch } from "../_shared/openaiChat.ts";
import { consumeUsage, refundUsage, usageRefusal } from "../_shared/usageCaps.ts";
import { buildSystemForVariant, hashtagsSystemPrompt, hashtagsUserPrompt, imagePromptSystemPrompt, imagePromptUserPrompt, MAX_BODY_CHARS, requestError, TOO_LONG, userPrompt, voiceSummarySystemPrompt, voiceSummaryUserPrompt, type Mode, type RequestBody } from "./logic.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, accept",
};

function tryParseJson<T = unknown>(raw: string): T | null {
  if (!raw) return null;
  let cleaned = raw.trim();
  // Strip markdown fences if the model added them.
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch (_) {
    // Fall through.
  }
  // Best-effort: find first { and last }.
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) {
    try {
      return JSON.parse(cleaned.slice(first, last + 1)) as T;
    } catch (_) {
      return null;
    }
  }
  return null;
}

interface ResolvedRequest {
  body: RequestBody;
  mode: Mode;
  n: number;
  wantStream: boolean;
}

function resolveRequest(req: Request, raw: RequestBody): ResolvedRequest {
  const mode: Mode = raw.mode ?? "post";
  let n = typeof raw.n === "number" && raw.n > 0 ? Math.floor(raw.n) : 1;
  if (n > 5) n = 5;
  const url = new URL(req.url);
  const accept = req.headers.get("accept") ?? "";
  const wantStream =
    raw.stream === true ||
    accept.includes("text/event-stream") ||
    url.searchParams.get("stream") === "1";
  return { body: raw, mode, n, wantStream };
}


async function callOpenAINonStream(
  apiKey: string,
  systemContent: string,
  userContent: string,
): Promise<string> {
  const response = await openaiFetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4.1-2025-04-14",
      messages: [
        { role: "system", content: systemContent },
        { role: "user", content: userContent },
      ],
      temperature: 0.85,
      max_tokens: 1400,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    console.error("OpenAI error:", response.status, text);
    throw new Error(`OpenAI request failed (${response.status})`);
  }
  const data = await response.json();
  return data?.choices?.[0]?.message?.content ?? "";
}

async function callOpenAIStreamToController(
  apiKey: string,
  systemContent: string,
  userContent: string,
  variantIndex: number,
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  signal: AbortSignal,
  onSent: () => void,
): Promise<string> {
  const response = await openaiFetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4.1-2025-04-14",
      messages: [
        { role: "system", content: systemContent },
        { role: "user", content: userContent },
      ],
      temperature: 0.85,
      max_tokens: 1400,
      stream: true,
    }),
    signal,
  });

  if (!response.ok || !response.body) {
    const text = response.body ? await response.text() : "";
    console.error("OpenAI stream error:", response.status, text);
    throw new Error(`OpenAI stream failed (${response.status})`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let assembled = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const parsed = JSON.parse(payload);
          const delta = parsed?.choices?.[0]?.delta?.content;
          if (typeof delta === "string" && delta.length > 0) {
            assembled += delta;
            const event = `data: ${JSON.stringify({
              type: "token",
              variantIndex,
              text: delta,
            })}\n\n`;
            onSent();
            controller.enqueue(encoder.encode(event));
          }
        } catch (err) {
          console.error("OpenAI stream chunk parse error:", err);
        }
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch (_) {
      // ignore
    }
  }

  return assembled;
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function handleNonStream(
  apiKey: string,
  body: RequestBody,
  mode: Mode,
  n: number,
  giveBack: () => Promise<unknown>,
): Promise<Response> {
  const userContent = userPrompt(body, mode);
  try {
    const calls = Array.from({ length: n }, (_, i) =>
      callOpenAINonStream(apiKey, buildSystemForVariant(body, mode, i), userContent),
    );
    const results = await Promise.all(calls);
    if (n === 1 && mode === "post") {
      // legacy shape for old callers
      return jsonResponse({ draft: results[0] });
    }
    if (mode === "hooks") {
      return jsonResponse({ mode, hooks: results });
    }
    return jsonResponse({ mode, drafts: results });
  } catch (err) {
    console.error("non-stream error:", err);
    await giveBack();
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Unknown error" },
      500,
    );
  }
}

function handleStream(
  apiKey: string,
  body: RequestBody,
  mode: Mode,
  n: number,
  giveBack: () => Promise<unknown>,
): Response {
  const encoder = new TextEncoder();
  // the use comes back only when OpenAI failed before any token reached the client, and the client is still there
  let failed = 0;
  let sent = false;
  let cancelled = false;
  const abortController = new AbortController();
  const userContent = userPrompt(body, mode);

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const sendEvent = (obj: unknown) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
        } catch (err) {
          console.error("sendEvent failed:", err);
        }
      };

      sendEvent({ type: "start", totalVariants: n, mode });

      const tasks = Array.from({ length: n }, async (_, i) => {
        try {
          const systemContent = buildSystemForVariant(body, mode, i);
          const text = await callOpenAIStreamToController(
            apiKey,
            systemContent,
            userContent,
            i,
            controller,
            encoder,
            abortController.signal,
            () => (sent = true),
          );
          sendEvent({ type: "variant_complete", variantIndex: i, text });
        } catch (err) {
          console.error(`variant ${i} stream error:`, err);
          failed++;
          sendEvent({
            type: "error",
            variantIndex: i,
            message: err instanceof Error ? err.message : "Variant failed",
          });
        }
      });

      Promise.all(tasks)
        .catch((err) => {
          console.error("stream tasks error:", err);
          sendEvent({
            type: "error",
            message: err instanceof Error ? err.message : "Stream failed",
          });
        })
        .finally(async () => {
          // the use comes back only when no variant was written
          if (failed > 0 && !sent && !cancelled) await giveBack();
          sendEvent({ type: "done" });
          try {
            controller.close();
          } catch (_) {
            // ignore double-close
          }
        });
    },
    cancel() {
      cancelled = true;
      abortController.abort();
    },
  });

  return new Response(stream, {
    headers: {
      ...corsHeaders,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

async function handleVoiceSummary(apiKey: string, body: RequestBody, giveBack: () => Promise<unknown>): Promise<Response> {
  const posts = (body.posts ?? []).filter(
    (p) => typeof p === "string" && p.trim().length >= 1,
  );
  try {
    const text = await callOpenAINonStream(
      apiKey,
      voiceSummarySystemPrompt(body),
      voiceSummaryUserPrompt({ ...body, posts }),
    );
    return jsonResponse({ voiceSummary: text.trim() });
  } catch (err) {
    console.error("voice-summary error:", err);
    await giveBack();
    return jsonResponse(
      { error: err instanceof Error ? err.message : "voice summary failed" },
      500,
    );
  }
}

async function handleHashtags(apiKey: string, body: RequestBody, giveBack: () => Promise<unknown>): Promise<Response> {
  try {
    const text = await callOpenAINonStream(
      apiKey,
      hashtagsSystemPrompt(body),
      hashtagsUserPrompt(body),
    );
    const parsed = tryParseJson<{ hashtags?: unknown }>(text);
    let hashtags: string[] = [];
    if (parsed && Array.isArray(parsed.hashtags)) {
      hashtags = (parsed.hashtags as unknown[])
        .filter((x): x is string => typeof x === "string")
        .map((x) => x.replace(/^#+/, "").trim())
        .filter((x) => x.length > 0)
        .slice(0, 8);
    }
    return jsonResponse({ hashtags });
  } catch (err) {
    console.error("hashtags error:", err);
    await giveBack();
    return jsonResponse(
      { error: err instanceof Error ? err.message : "hashtags failed" },
      500,
    );
  }
}

async function handleImagePrompt(apiKey: string, body: RequestBody, giveBack: () => Promise<unknown>): Promise<Response> {
  try {
    const text = await callOpenAINonStream(
      apiKey,
      imagePromptSystemPrompt(body),
      imagePromptUserPrompt(body),
    );
    const parsed = tryParseJson<{ prompt?: unknown }>(text);
    let prompt = "";
    if (parsed && typeof parsed.prompt === "string") {
      prompt = parsed.prompt.trim();
    } else {
      prompt = text.trim();
    }
    return jsonResponse({ prompt });
  } catch (err) {
    console.error("image-prompt error:", err);
    await giveBack();
    return jsonResponse(
      { error: err instanceof Error ? err.message : "image-prompt failed" },
      500,
    );
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const text = await req.text();
  if (text.length > MAX_BODY_CHARS) return jsonResponse({ error: TOO_LONG }, 400);
  let raw: RequestBody;
  try {
    raw = JSON.parse(text) as RequestBody;
  } catch (_err) {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return jsonResponse({ error: "Invalid JSON body" }, 400);
  const bad = requestError(raw);
  if (bad) return jsonResponse({ error: bad }, 400);

  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    return jsonResponse({ error: "OpenAI API key not configured" }, 500);
  }

  // Every request counts once against the signed-in user's day, as the other writers do; a failed one is given back.
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: userData } = await admin.auth.getUser(jwt);
  const uid = userData?.user?.id;
  if (!uid) return jsonResponse({ error: "Sign in to write a post." }, 401);
  const day = new Date().toISOString().slice(0, 10); // the counter's day (UTC), read before it moves
  const charged = await consumeUsage(admin, uid, "write-post");
  if (!charged.allowed) {
    const refusal = usageRefusal(charged);
    return jsonResponse(refusal.body, refusal.status);
  }
  const giveBack = () => refundUsage(admin, uid, "write-post", day);

  const requestedMode: Mode = (raw.mode as Mode) ?? "post";
  if (requestedMode === "voice-summary") return handleVoiceSummary(apiKey, raw, giveBack);
  if (requestedMode === "hashtags") return handleHashtags(apiKey, raw, giveBack);
  if (requestedMode === "image-prompt") return handleImagePrompt(apiKey, raw, giveBack);

  const { body, mode, n, wantStream } = resolveRequest(req, raw);
  if (wantStream) {
    return handleStream(apiKey, body, mode, n, giveBack);
  }
  return handleNonStream(apiKey, body, mode, n, giveBack);
});
