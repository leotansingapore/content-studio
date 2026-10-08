// "Voiceover from text" in the video editor: the text-voice edge function turns
// a script into an MP3 with ElevenLabs. The voice list and limits are shared with it.

import { supabase, SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase";
export { MAX_SCRIPT, VOICES, VOICE_IDS, type VoiceId } from "../../supabase/functions/text-voice/logic.ts";
import type { VoiceId } from "../../supabase/functions/text-voice/logic.ts";

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
