// The Coach's memory of an advisor — the qualitative "about you" that turns
// generic content into content only they could post. Where the Diagnosis
// (src/lib/diagnosis.ts) scores WHAT to work on, this captures the raw material
// the Coach needs to actually help: their origin story, what's going on in
// their life that's fair game to share, who they're for, what's worked, and —
// learned over time — what they like and don't like.
//
// Persisted per user under the content-studio- prefix so cloudSync mirrors it
// across devices. loadCoachProfile / coachContext are pure and exported so the
// build into a Write brief is unit-testable.

export interface CoachProfile {
  /** How they got started / their "why". */
  origin: string;
  /** Recent struggles (work, life, family) they're OK sharing online. */
  struggles: string;
  /** Life/family/personal topics they're happy to post about. */
  personalTopics: string;
  /** Topics that are off-limits — the Coach must never suggest these. */
  offLimits: string;
  /** Who their content is actually for. */
  audience: string;
  /** Posts/videos that have worked / brought leads before. */
  whatWorked: string;
  /** Tone / voice they like (and dislike). */
  toneNotes: string;
  /** Learned over time from feedback: lean into these. */
  likes: string[];
  /** Learned over time: steer away from these. */
  dislikes: string[];
  updatedAt?: string;
}

/** The free-text fields of the profile (everything except the learned lists). */
export type CoachTextKey =
  | "origin"
  | "struggles"
  | "personalTopics"
  | "offLimits"
  | "audience"
  | "whatWorked"
  | "toneNotes";

export interface CoachField {
  key: CoachTextKey;
  label: string;
  question: string;
  placeholder: string;
}

// The open questions the Coach asks. Kept out of the Diagnosis on purpose: the
// Diagnosis handles the scored self-assessment (camera, consistency, hooks,
// audience-clarity, conversion, compliance); these are the things a score can't
// capture — the story and the boundaries that make content personal and safe.
export const COACH_FIELDS: CoachField[] = [
  {
    key: "origin",
    label: "Your story",
    question: "How did you get started, and why do you do this work?",
    placeholder:
      "e.g. I got into insurance after my dad was underinsured when he fell ill…",
  },
  {
    key: "struggles",
    label: "Recent struggles",
    question:
      "What have you been wrestling with lately (work or life) that you'd be OK sharing?",
    placeholder:
      "e.g. balancing prospecting with two young kids; imposter syndrome on camera…",
  },
  {
    key: "personalTopics",
    label: "Life you'll share",
    question:
      "What personal or family topics are fair game to bring into your content?",
    placeholder: "e.g. weekend hikes, my kids, my own money mistakes in my 20s…",
  },
  {
    key: "offLimits",
    label: "Off-limits",
    question: "What should the Coach never suggest you post about?",
    placeholder: "e.g. my spouse's job, politics, specific client details…",
  },
  {
    key: "audience",
    label: "Who you're for",
    question: "Who are you really trying to reach?",
    placeholder:
      "e.g. young Singaporean parents, 28–40, just had their first child…",
  },
  {
    key: "whatWorked",
    label: "What's worked",
    question: "Which of your posts or videos got the most attention or leads?",
    placeholder:
      "e.g. a story about a claim I helped settle; my CPF explainer reel…",
  },
  {
    key: "toneNotes",
    label: "Your tone",
    question: "How do you want to come across — and how do you not?",
    placeholder: "e.g. warm and plain-spoken, a bit funny; not salesy or preachy…",
  },
];

const TEXT_KEYS: CoachTextKey[] = COACH_FIELDS.map((f) => f.key);

export function emptyProfile(): CoachProfile {
  return {
    origin: "",
    struggles: "",
    personalTopics: "",
    offLimits: "",
    audience: "",
    whatWorked: "",
    toneNotes: "",
    likes: [],
    dislikes: [],
  };
}

const KEY_PREFIX = "content-studio-coachprofile-";

function safeStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function cleanStrList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((s) => typeof s === "string" && s.trim().length > 0).map((s) =>
    (s as string).trim(),
  );
}

export function loadCoachProfile(
  userId: string | null | undefined,
): CoachProfile {
  const base = emptyProfile();
  if (!userId) return base;
  const storage = safeStorage();
  if (!storage) return base;
  const raw = storage.getItem(`${KEY_PREFIX}${userId}`);
  if (!raw) return base;
  try {
    const parsed = JSON.parse(raw) as Partial<CoachProfile>;
    const out = { ...base };
    for (const k of TEXT_KEYS) {
      const v = parsed[k];
      if (typeof v === "string") (out[k] as string) = v;
    }
    out.likes = cleanStrList(parsed.likes);
    out.dislikes = cleanStrList(parsed.dislikes);
    out.updatedAt = typeof parsed.updatedAt === "string" ? parsed.updatedAt : undefined;
    return out;
  } catch {
    return base;
  }
}

export function saveCoachProfile(userId: string, profile: CoachProfile): CoachProfile {
  const storage = safeStorage();
  const next = { ...profile, updatedAt: new Date().toISOString() };
  if (storage) storage.setItem(`${KEY_PREFIX}${userId}`, JSON.stringify(next));
  return next;
}

export function updateCoachProfile(
  userId: string,
  patch: Partial<CoachProfile>,
): CoachProfile {
  return saveCoachProfile(userId, { ...loadCoachProfile(userId), ...patch });
}

/** Add a learned preference. Deduped (case-insensitive), newest first, capped. */
export function recordPreference(
  userId: string,
  kind: "like" | "dislike",
  note: string,
): CoachProfile {
  const trimmed = note.trim().slice(0, 140);
  const profile = loadCoachProfile(userId);
  if (!trimmed) return profile;
  const listKey = kind === "like" ? "likes" : "dislikes";
  const existing = profile[listKey];
  const deduped = [trimmed, ...existing.filter((x) => x.toLowerCase() !== trimmed.toLowerCase())].slice(
    0,
    12,
  );
  return saveCoachProfile(userId, { ...profile, [listKey]: deduped });
}

export function removePreference(
  userId: string,
  kind: "like" | "dislike",
  note: string,
): CoachProfile {
  const profile = loadCoachProfile(userId);
  const listKey = kind === "like" ? "likes" : "dislikes";
  return saveCoachProfile(userId, {
    ...profile,
    [listKey]: profile[listKey].filter((x) => x !== note),
  });
}

/** How much of the profile is filled in (text fields only). */
export function profileCompleteness(profile: CoachProfile): {
  filled: number;
  total: number;
  pct: number;
} {
  const total = TEXT_KEYS.length;
  const filled = TEXT_KEYS.filter((k) => (profile[k] as string).trim().length > 0)
    .length;
  return { filled, total, pct: Math.round((filled / total) * 100) };
}

export function hasAnyProfile(profile: CoachProfile): boolean {
  return (
    TEXT_KEYS.some((k) => (profile[k] as string).trim().length > 0) ||
    profile.likes.length > 0 ||
    profile.dislikes.length > 0
  );
}

// Field label lookup, for rendering learned prefs / summaries elsewhere.
const FIELD_LABEL: Record<string, string> = Object.fromEntries(
  COACH_FIELDS.map((f) => [f.key, f.label]),
);

/**
 * Build a brief the AI can use to make content sound like this person and pull
 * from their real life. Fed into Write's `ctx` deep-link so everything the
 * Coach knows actually improves the draft. Only includes what's filled in.
 */
export function coachContext(profile: CoachProfile): string {
  const lines: string[] = [];
  const add = (key: keyof CoachProfile, prefix: string) => {
    const v = profile[key];
    if (typeof v === "string" && v.trim()) lines.push(`- ${prefix}: ${v.trim()}`);
  };
  add("origin", "My story");
  add("struggles", "What I'm OK sharing right now");
  add("personalTopics", "Personal/life topics I'll post about");
  add("audience", "Who I'm for");
  add("whatWorked", "What's worked before");
  add("toneNotes", "Tone I want");
  if (profile.likes.length) lines.push(`- Lean into: ${profile.likes.join("; ")}`);
  if (profile.dislikes.length)
    lines.push(`- Avoid: ${profile.dislikes.join("; ")}`);
  if (profile.offLimits.trim())
    lines.push(`- NEVER post about: ${profile.offLimits.trim()}`);

  if (lines.length === 0) return "";
  return `About me (write in my voice and draw on my real life; keep it compliant for a licensed SG financial advisor):\n${lines.join(
    "\n",
  )}`;
}

export { FIELD_LABEL };
