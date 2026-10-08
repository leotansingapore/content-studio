// "Voiceover from text" in the video editor: the text-voice edge function turns
// a script into an MP3 with ElevenLabs. The voice list and limits are shared with it.

import { supabase, SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase";
export { DUB_LANGS, MAX_SCRIPT, VOICES, VOICE_IDS, type DubLang, type VoiceId } from "../../supabase/functions/text-voice/logic.ts";
import type { DubLang, VoiceId } from "../../supabase/functions/text-voice/logic.ts";
import { callFn } from "@/lib/edgeFn";

export async function speak(text: string, voice: VoiceId): Promise<Blob> {
  const token = (await supabase.auth.getSession()).data.session?.access_token ?? SUPABASE_ANON_KEY;
  let res: Response;
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/text-voice`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice }),
    });
  } catch {
    throw new Error("Couldn't reach the server. Check your connection and try again.");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error || "Couldn't make the voiceover. Try again in a minute.");
  }
  const blob = await res.blob();
  if (blob.size < 1000) throw new Error("The voiceover came back empty. Try again.");
  return new Blob([blob], { type: "audio/mpeg" });
}

/** Seconds of sound in a file, read without playing it. */
export async function audioSeconds(blob: Blob): Promise<number> {
  const buf = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(await blob.arrayBuffer());
  return buf.duration;
}

/** The video's lines (already translated) spoken in one call, with when each line is said in the audio. */
export async function speakDub(lines: string[], voice: VoiceId, lang: DubLang): Promise<{ audio: Blob; spans: ({ s: number; e: number } | null)[] }> {
  const r = await callFn<{ audio: string; spans: ({ s: number; e: number } | null)[] }>("text-voice", { mode: "dub", lines, voice, lang }, "Couldn't make the dub. Try again in a minute.");
  const bytes = Uint8Array.from(atob(r.audio), (c) => c.charCodeAt(0));
  if (bytes.length < 1000) throw new Error("The dub came back empty. Try again.");
  return { audio: new Blob([bytes], { type: "audio/mpeg" }), spans: r.spans };
}
