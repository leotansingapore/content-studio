// video-assist mode "watch" ("Watch it like a viewer", after an export in /edit): Gemini watches the
// exported file itself, picture and sound, and lists the moments a viewer would trip on, with the
// seconds. Frames and rules can't see pacing, text leaving too fast, or a picture that doesn't match
// what is said; a video model can. Idea from SeeCut (github.com/YeJe-cpu/SeeCut, PolyForm
// Noncommercial, so none of its code or prompts are here): one watch misses things, so it watches
// twice and keeps both lists, and an answer whose length is wrong is thrown away as not watched.
// Gemini decides what is a finding because Jev reads text only; the list stays in time order.
// Measured 2026-10-12 on a 38 s reel: 3,457 video tokens, about 7,800 thinking, 60 s and US$0.033
// a watch on high thinking; low thinking found a face covered that wasn't (5 s, US$0.003). A 152 s
// video took 119 s and 15,358 thinking tokens for one watch, so longer videos don't fit the time.
// Pure apart from the injected fetch, so vitest covers it (watch.test.ts).

export const WATCH_MODEL = "gemini-3.8-flash";
export const WATCH_RUNS = 2;
/** A 90 s export at the editor's top 8 Mbps is about 95 MB. */
export const MAX_WATCH_BYTES = 120_000_000;
export const MAX_WATCH_SECONDS = 90;
/** Answer before Supabase's 150 s request limit, upload included. */
export const WATCH_BUDGET_MS = 140_000;
/** Once one watch is back, the other gets this long. Live 10-12: a watch came back after 61 s and the other was not done 30 s later. */
export const WATCH_GRACE_MS = 45_000;

export const WATCH_KINDS = ["slow_start", "dead_air", "hard_to_read", "covered", "missing_visual", "mismatch", "jumpy", "sound"] as const;
export type WatchKind = (typeof WATCH_KINDS)[number];

export interface WatchFinding {
  kind: WatchKind;
  start: number;
  end: number;
  /** What is on screen and said then. */
  what: string;
  fix: string;
}

export const WATCH_PROMPT = `You are watching a short vertical video (a reel) the way a viewer scrolling Instagram or TikTok would, sound on.
List every moment a viewer would trip on. Only these kinds:
- slow_start: the first 3 seconds give no reason to keep watching (nothing moves, nothing on screen says what this is about)
- dead_air: 2 seconds or more where the picture barely changes and nothing new is shown or said
- hard_to_read: on-screen text leaves before it can be read, is too small, or clashes with what is behind it
- covered: text, a face or a key detail is covered by another element, cut off by the frame edge, or something from the previous moment is still on screen
- missing_visual: the speaker names something specific (a product, app, website, number, place or document) and nothing on screen shows it
- mismatch: what is on screen has nothing to do with what is being said at that moment
- jumpy: the speaker's framing or position jumps for no reason, or a cut lands mid-word
- sound: a word is cut off, music or effects drown the voice, or the sound drops out
For each, give the start and end in seconds from the start of the video, what is on screen and said at that moment, and the one change that would fix it. Be specific to this video; do not list a kind that does not happen.
Also copy three pieces of on-screen text exactly as written, and say how long the video runs in seconds.
Answer from watching. Do not run any separate transcription or OCR step.`;

export const WATCH_SCHEMA = {
  type: "object",
  required: ["duration_sec", "screen_text", "findings"],
  properties: {
    duration_sec: { type: "number" },
    screen_text: { type: "array", items: { type: "string" } },
    findings: {
      type: "array",
      items: {
        type: "object",
        required: ["kind", "start", "end", "seen", "fix"],
        properties: {
          kind: { type: "string", enum: [...WATCH_KINDS] },
          start: { type: "number" },
          end: { type: "number" },
          seen: { type: "string" },
          fix: { type: "string" },
        },
      },
    },
  },
};

const TYPES = ["video/mp4", "video/webm", "video/quicktime"];

/** The file's type without codec parameters, when Gemini takes it. */
export function watchType(header: string | null): string | null {
  const t = (header ?? "").split(";")[0].trim().toLowerCase();
  return TYPES.includes(t) ? t : null;
}

/** The edit's length from the query, when it is one Watch it takes. */
export function watchSeconds(param: string | null): number | null {
  const s = Number(param);
  return Number.isFinite(s) && s >= 1 && s <= MAX_WATCH_SECONDS ? s : null;
}

const clip = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, 300);

/**
 * One watch's findings, or null when it can't be trusted: not JSON, or a length off by more than
 * 3 s or 5% (the model answered without watching this file).
 */
export function readWatchReply(text: string, seconds: number): WatchFinding[] | null {
  let r: Record<string, unknown>;
  try {
    r = JSON.parse(text);
  } catch {
    return null;
  }
  const d = Number(r?.duration_sec);
  if (!Number.isFinite(d) || Math.abs(d - seconds) > Math.max(3, seconds * 0.05)) return null;
  const list = Array.isArray(r.findings) ? r.findings : [];
  return list.flatMap((x): WatchFinding[] => {
    const f = x && typeof x === "object" ? (x as Record<string, unknown>) : {};
    const kind = f.kind as WatchKind;
    const start = Math.max(0, Math.min(seconds, Number(f.start)));
    const end = Math.max(start, Math.min(seconds, Number(f.end)));
    const what = clip(f.seen);
    if (!WATCH_KINDS.includes(kind) || !Number.isFinite(start) || !Number.isFinite(end) || !what) return [];
    return [{ kind, start: Math.round(start * 10) / 10, end: Math.round(end * 10) / 10, what, fix: clip(f.fix) }];
  });
}

/** Both watches' findings in time order, one per kind and moment; null when no watch could be read. */
export function mergeWatches(runs: (WatchFinding[] | null)[]): WatchFinding[] | null {
  const read = runs.filter((r): r is WatchFinding[] => r !== null);
  if (!read.length) return null;
  const out: WatchFinding[] = [];
  for (const f of read.flat()) {
    // the same moment seen twice: same kind, times within half a second of overlapping
    if (!out.some((o) => o.kind === f.kind && f.start <= o.end + 0.5 && o.start <= f.end + 0.5)) out.push(f);
  }
  return out.sort((a, b) => a.start - b.start || a.end - b.end);
}

const API = "https://generativelanguage.googleapis.com";

/** Gemini's own measure of the file ("37.9s"), or null when it gave none. */
export function fileSeconds(meta: { videoDuration?: unknown } | undefined): number | null {
  const s = parseFloat(String(meta?.videoDuration ?? ""));
  return Number.isFinite(s) && s > 0 ? s : null;
}

/**
 * Uploads the file to Gemini (streamed through, never held in memory), watches it WATCH_RUNS times
 * at once and deletes it. "too-long" when Gemini measures it over MAX_WATCH_SECONDS (the length in
 * the request is the browser's word, so it is checked before anything is paid for); null when no
 * watch could be read in the time left.
 */
export async function watchVideo(
  body: BodyInit,
  bytes: number,
  type: string,
  seconds: number,
  key: string,
  deps: { fetch?: typeof fetch; now?: () => number; sleep?: (ms: number) => Promise<void>; graceMs?: number } = {},
): Promise<WatchFinding[] | "too-long" | null> {
  const f = deps.fetch ?? fetch;
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const t0 = now();
  const until = t0 + WATCH_BUDGET_MS;
  const took: string[] = [];
  const mark = (what: string) => took.push(`${what} ${Math.round((now() - t0) / 1000)}s`);
  const auth = { "x-goog-api-key": key };
  const start = await f(`${API}/upload/v1beta/files`, {
    method: "POST",
    headers: { ...auth, "X-Goog-Upload-Protocol": "resumable", "X-Goog-Upload-Command": "start", "X-Goog-Upload-Header-Content-Length": String(bytes), "X-Goog-Upload-Header-Content-Type": type, "Content-Type": "application/json" },
    body: JSON.stringify({ file: { display_name: "cs-watch" } }),
  });
  const url = start.headers.get("x-goog-upload-url");
  if (!start.ok || !url) throw new Error(`gemini upload start ${start.status}`);
  const up = await f(url, { method: "POST", headers: { "X-Goog-Upload-Offset": "0", "X-Goog-Upload-Command": "upload, finalize" }, body, ...({ duplex: "half" } as object) });
  type GeminiFile = { name?: string; uri?: string; state?: string; videoMetadata?: { videoDuration?: unknown } };
  let file = ((await up.json().catch(() => null)) as { file?: GeminiFile } | null)?.file;
  if (!up.ok || !file?.name || !file.uri) throw new Error(`gemini upload ${up.status}`);
  const name = file.name;
  const uri = file.uri;
  mark("uploaded");
  try {
    // a video is watchable once Gemini has processed it, a few seconds for a reel
    while (file?.state !== "ACTIVE") {
      if (file?.state === "FAILED" || now() > until - 20_000) return null;
      await sleep(1000);
      file = (await (await f(`${API}/v1beta/${name}`, { headers: auth })).json().catch(() => null)) as GeminiFile | undefined;
    }
    mark("ready");
    const measured = fileSeconds(file.videoMetadata);
    if (measured !== null && measured > MAX_WATCH_SECONDS + 1) return "too-long";
    const length = measured ?? seconds;
    const stops = Array.from({ length: WATCH_RUNS }, () => new AbortController());
    let grace: ReturnType<typeof setTimeout> | undefined;
    const ask = (stop: AbortController) =>
      f(`${API}/v1beta/models/${WATCH_MODEL}:generateContent`, {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify({
          // end_offset: never more than MAX_WATCH_SECONDS is watched, whatever was measured
          contents: [{ parts: [{ file_data: { mime_type: type, file_uri: uri }, video_metadata: { end_offset: `${MAX_WATCH_SECONDS}s` } }, { text: WATCH_PROMPT }] }],
          // thinking stays on (off loops on structured output), capped so a runaway stops
          generationConfig: { responseMimeType: "application/json", responseSchema: WATCH_SCHEMA, maxOutputTokens: 24_000, thinkingConfig: { thinkingLevel: "high" } },
        }),
        signal: AbortSignal.any([stop.signal, AbortSignal.timeout(Math.max(5_000, until - now()))]),
      })
        .then(async (r) => {
          const j = (await r.json().catch(() => null)) as { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[] } | null;
          if (!r.ok) console.error("video-assist watch", r.status, JSON.stringify(j).slice(0, 300));
          const text = (j?.candidates?.[0]?.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? "").join("");
          const read = r.ok ? readWatchReply(text, length) : null;
          mark(read ? "watched" : "unread");
          if (read && !grace) grace = setTimeout(() => stops.forEach((c) => c.abort()), deps.graceMs ?? WATCH_GRACE_MS);
          return read;
        })
        .catch((e) => {
          console.error("video-assist watch", e instanceof Error ? e.message : e);
          return null;
        });
    const runs = await Promise.all(stops.map(ask));
    clearTimeout(grace);
    return mergeWatches(runs);
  } finally {
    // Gemini would keep it 48 hours otherwise
    await f(`${API}/v1beta/${name}`, { method: "DELETE", headers: auth }).catch(() => null);
    console.log(`video-assist watch ${bytes} bytes: ${took.join(", ")}`);
  }
}
