// Voice profile storage.
//
// One profile per authenticated user, persisted to localStorage:
//   key: content-studio-voice-${userId}
//
// Once the SUPABASE handoff lands (content_studio_voice_profiles table),
// this module can swap to Supabase reads/writes without touching callers.

export interface VoiceProfile {
  posts: string[];
  voiceSummary?: string;
  updatedAt: string;
}

const KEY_PREFIX = "content-studio-voice-";
const SESSION_DISMISS_KEY = "content-studio-voice-nudge-dismissed";
export const VOICE_MIN_CHARS = 100;
export const VOICE_MIN_FILLED = 3;
export const VOICE_MAX_SLOTS = 5;

function safeStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch (_) {
    return null;
  }
}

export function loadVoiceProfile(userId: string | null | undefined): VoiceProfile | null {
  if (!userId) return null;
  const storage = safeStorage();
  if (!storage) return null;
  const raw = storage.getItem(`${KEY_PREFIX}${userId}`);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as VoiceProfile;
    if (!parsed || !Array.isArray(parsed.posts)) return null;
    return parsed;
  } catch (_) {
    return null;
  }
}

export function saveVoiceProfile(
  userId: string,
  profile: VoiceProfile,
): void {
  const storage = safeStorage();
  if (!storage) return;
  storage.setItem(
    `${KEY_PREFIX}${userId}`,
    JSON.stringify({ ...profile, updatedAt: new Date().toISOString() }),
  );
}

export function clearVoiceProfile(userId: string): void {
  const storage = safeStorage();
  if (!storage) return;
  storage.removeItem(`${KEY_PREFIX}${userId}`);
}

export function isVoiceProfileUsable(profile: VoiceProfile | null): boolean {
  if (!profile) return false;
  const filled = profile.posts.filter((p) => p && p.trim().length >= VOICE_MIN_CHARS);
  return filled.length >= VOICE_MIN_FILLED;
}

export function dismissNudgeForSession(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(SESSION_DISMISS_KEY, "1");
  } catch (_) {
    // ignore
  }
}

export function isNudgeDismissed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(SESSION_DISMISS_KEY) === "1";
  } catch (_) {
    return false;
  }
}
