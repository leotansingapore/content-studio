// Content Diagnosis — the spine of the coaching layer.
//
// A short self-assessment scores an advisor across the things that actually
// stop people posting (ideas, storytelling, camera confidence, consistency,
// strategy, conversion, and — the one no US tool has — staying compliant as a
// licensed FA in Singapore). From that score we derive the SINGLE most
// important next action, so the app can always answer "what do I do now?"
// instead of being another portal people forget.
//
// Persisted per user to localStorage under the content-studio- prefix so
// cloudSync mirrors it across devices (see src/lib/cloudSync.ts).
//
// scoreDiagnosis / scoreArea / nextAction are pure and exported so the scoring
// is unit-testable without a browser (see diagnosis.test.ts).

export type AreaId =
  | "ideas"
  | "storytelling"
  | "camera"
  | "consistency"
  | "strategy"
  | "conversion"
  | "compliance";

export interface Area {
  id: AreaId;
  label: string;
  /** One-line description of what a high score in this area means. */
  blurb: string;
}

// Canonical order — used everywhere the areas are listed.
export const AREAS: Area[] = [
  { id: "ideas", label: "Ideas", blurb: "You always know what to post." },
  {
    id: "storytelling",
    label: "Storytelling",
    blurb: "You turn real moments into content people feel.",
  },
  {
    id: "camera",
    label: "Camera confidence",
    blurb: "You can talk to the lens without freezing.",
  },
  {
    id: "consistency",
    label: "Consistency",
    blurb: "You post on a rhythm, not by mood.",
  },
  {
    id: "strategy",
    label: "Content strategy",
    blurb: "You know who you're for and what your themes are.",
  },
  {
    id: "conversion",
    label: "Turning views into leads",
    blurb: "Your content actually starts conversations.",
  },
  {
    id: "compliance",
    label: "Compliance confidence",
    blurb: "You post without second-guessing MAS/AIA rules.",
  },
];

export const AREA_LABEL: Record<AreaId, string> = Object.fromEntries(
  AREAS.map((a) => [a.id, a.label]),
) as Record<AreaId, string>;

export interface DiagOption {
  label: string;
  /** Contribution to the area score, 0 (weakest) .. 1 (strongest). */
  value: number;
}

export interface DiagQuestion {
  id: string;
  /** null = a profiling question that personalises but does not score. */
  area: AreaId | null;
  prompt: string;
  help?: string;
  options: DiagOption[];
}

// ~14 scored questions (2 per area) plus one profiling question. Options are
// written so the FIRST option is always the strongest — scoring reads the
// stored option index, so reordering options here would change scores.
export const QUESTIONS: DiagQuestion[] = [
  {
    id: "role",
    area: null,
    prompt: "Which best describes you?",
    help: "So the coaching speaks to your situation.",
    options: [
      { label: "Financial advisor / consultant", value: 0 },
      { label: "Team leader / manager", value: 0 },
      { label: "Business owner", value: 0 },
      { label: "Something else", value: 0 },
    ],
  },
  {
    id: "ideas-ready",
    area: "ideas",
    prompt: "When you sit down to post, do you know what to say?",
    options: [
      { label: "I usually have ideas ready to go", value: 1 },
      { label: "Sometimes, but I run out fast", value: 0.55 },
      { label: "I mostly stare at a blank screen", value: 0.15 },
    ],
  },
  {
    id: "ideas-bank",
    area: "ideas",
    prompt: "How many post ideas could you list right now, off the top of your head?",
    options: [
      { label: "Ten or more", value: 1 },
      { label: "A handful", value: 0.5 },
      { label: "Barely any", value: 0.15 },
    ],
  },
  {
    id: "story-personal",
    area: "storytelling",
    prompt: "Are you comfortable sharing personal or client stories?",
    options: [
      { label: "Yes — I share them often", value: 1 },
      { label: "Occasionally", value: 0.5 },
      { label: "I stick to facts and tips", value: 0.2 },
    ],
  },
  {
    id: "story-clicks",
    area: "storytelling",
    prompt: "When you explain something, do people say it finally 'clicked'?",
    options: [
      { label: "Often — I lean on examples and stories", value: 1 },
      { label: "Sometimes", value: 0.5 },
      { label: "I tend to sound like a textbook", value: 0.2 },
    ],
  },
  {
    id: "camera-feel",
    area: "camera",
    prompt: "How does talking to camera feel?",
    options: [
      { label: "Natural — I barely think about it", value: 1 },
      { label: "A bit stiff, but I manage", value: 0.5 },
      { label: "I freeze, or I hate how I come across", value: 0.15 },
    ],
  },
  {
    id: "camera-cringe",
    area: "camera",
    prompt: "Does the fear of looking cringe stop you posting?",
    options: [
      { label: "Not really", value: 1 },
      { label: "A little", value: 0.5 },
      { label: "A lot — it holds me back", value: 0.15 },
    ],
  },
  {
    id: "consistency-cadence",
    area: "consistency",
    prompt: "How often do you post right now?",
    options: [
      { label: "Several times a week", value: 1 },
      { label: "About once a week", value: 0.55 },
      { label: "Rarely, or whenever I remember", value: 0.15 },
    ],
  },
  {
    id: "consistency-routine",
    area: "consistency",
    prompt: "Do you have a routine for creating content?",
    options: [
      { label: "Yes — I batch and/or schedule it", value: 1 },
      { label: "Loosely", value: 0.5 },
      { label: "No routine at all", value: 0.15 },
    ],
  },
  {
    id: "strategy-audience",
    area: "strategy",
    prompt: "Do you know exactly who your content is for?",
    options: [
      { label: "Yes — a specific audience", value: 1 },
      { label: "Roughly", value: 0.5 },
      { label: "Not really — I post for everyone", value: 0.2 },
    ],
  },
  {
    id: "strategy-pillars",
    area: "strategy",
    prompt: "Do you have clear content themes or pillars you stick to?",
    options: [
      { label: "Yes — a few I return to", value: 1 },
      { label: "Sort of", value: 0.5 },
      { label: "I post whatever comes to mind", value: 0.2 },
    ],
  },
  {
    id: "conversion-track",
    area: "conversion",
    prompt: "Do you know which of your posts actually generate leads or DMs?",
    options: [
      { label: "Yes — I track what converts", value: 1 },
      { label: "I have a rough idea", value: 0.5 },
      { label: "No idea", value: 0.15 },
    ],
  },
  {
    id: "conversion-cta",
    area: "conversion",
    prompt: "Do your posts end with a clear call to action?",
    options: [
      { label: "Almost always", value: 1 },
      { label: "Sometimes", value: 0.5 },
      { label: "Rarely", value: 0.2 },
    ],
  },
  {
    id: "compliance-confident",
    area: "compliance",
    prompt: "Are you confident your posts stay inside MAS/AIA compliance rules?",
    options: [
      { label: "Yes — I know where the lines are", value: 1 },
      { label: "Mostly, but I second-guess myself", value: 0.5 },
      { label: "Honestly, I'm not sure", value: 0.2 },
    ],
  },
  {
    id: "compliance-avoid",
    area: "compliance",
    prompt: "Do you ever avoid posting because you're unsure what's allowed?",
    options: [
      { label: "Never — I know what's safe", value: 1 },
      { label: "Occasionally", value: 0.55 },
      { label: "Often — it stops me posting", value: 0.2 },
    ],
  },
];

export const SCORED_QUESTIONS = QUESTIONS.filter((q) => q.area !== null);

// answers maps a question id to the index of the option the user picked.
export interface DiagnosisRecord {
  answers: Record<string, number>;
  completedAt: string;
  /** From the profiling question, e.g. "Financial advisor / consultant". */
  role?: string;
}

export interface AreaScore {
  id: AreaId;
  label: string;
  score: number; // 0..100
}

export interface DiagnosisResult {
  overall: number; // 0..100
  levelLabel: string;
  areas: AreaScore[]; // canonical order, scored areas only
  weaknesses: AreaScore[]; // ascending (lowest first)
  strengths: AreaScore[]; // descending (highest first)
}

/** Average of the answered questions in one area, 0..100, or null if none. */
export function scoreArea(
  area: AreaId,
  answers: Record<string, number>,
): number | null {
  const qs = SCORED_QUESTIONS.filter((q) => q.area === area);
  const vals: number[] = [];
  for (const q of qs) {
    const idx = answers[q.id];
    if (typeof idx === "number" && q.options[idx]) {
      vals.push(q.options[idx].value);
    }
  }
  if (vals.length === 0) return null;
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100);
}

export function levelFor(overall: number): string {
  if (overall < 40) return "Getting started";
  if (overall < 60) return "Finding your feet";
  if (overall < 80) return "Building momentum";
  return "In flow";
}

export function scoreDiagnosis(answers: Record<string, number>): DiagnosisResult {
  const areas: AreaScore[] = [];
  for (const a of AREAS) {
    const s = scoreArea(a.id, answers);
    if (s !== null) areas.push({ id: a.id, label: a.label, score: s });
  }
  const overall = areas.length
    ? Math.round(areas.reduce((s, a) => s + a.score, 0) / areas.length)
    : 0;
  return {
    overall,
    levelLabel: levelFor(overall),
    areas,
    weaknesses: [...areas].sort((a, b) => a.score - b.score),
    strengths: [...areas].sort((a, b) => b.score - a.score),
  };
}

/** True once every scored question has an answer. */
export function isComplete(answers: Record<string, number>): boolean {
  return SCORED_QUESTIONS.every((q) => typeof answers[q.id] === "number");
}

// ---------------------------------------------------------------------------
// Missions — each area maps to the single concrete next action, pointed at the
// surface in the app that already does the work. This is what the homepage
// leads with so there is never a "what now?" moment.

export interface Mission {
  area: AreaId;
  title: string;
  objective: string;
  effortMins: number;
  cta: string;
  to: string;
}

export const MISSIONS: Record<AreaId, Mission> = {
  ideas: {
    area: "ideas",
    title: "Never run out of ideas",
    objective: "Bank five post ideas you could film this week.",
    effortMins: 10,
    cta: "Find ideas",
    to: "/inspiration",
  },
  storytelling: {
    area: "storytelling",
    title: "Tell your first story",
    objective: "Turn one real client moment into a 45-second story.",
    effortMins: 15,
    cta: "Start a story",
    to: "/generate?pillar=identity",
  },
  camera: {
    area: "camera",
    title: "Get comfortable on camera",
    objective: "Film one 30-second take talking to the lens — no script, just talk.",
    effortMins: 5,
    cta: "Open Learn",
    to: "/academy",
  },
  consistency: {
    area: "consistency",
    title: "Build your posting rhythm",
    objective: "Batch a week of posts in one sitting so you never scramble.",
    effortMins: 20,
    cta: "Start a weekly batch",
    to: "/generate/batch",
  },
  strategy: {
    area: "strategy",
    title: "Sharpen who you're for",
    objective: "Lock in your audience and three content pillars.",
    effortMins: 10,
    cta: "Open My Playbook",
    to: "/playbook",
  },
  conversion: {
    area: "conversion",
    title: "Turn views into leads",
    objective: "Track what actually converts and add a clear CTA to your next post.",
    effortMins: 10,
    cta: "See Performance",
    to: "/analytics",
  },
  compliance: {
    area: "compliance",
    title: "Post without the compliance worry",
    objective: "Run your latest draft through the compliance check.",
    effortMins: 5,
    cta: "Check my content",
    to: "/coach",
  },
};

export interface NextAction {
  kind: "diagnose" | "mission" | "maintain";
  headline: string;
  detail: string;
  mission?: Mission;
  area?: AreaScore;
}

// A score at or above this is "handled" — not the thing to work on next.
export const STRONG_SCORE = 75;

/** The single most important thing to do next, given a diagnosis (or none). */
export function nextAction(result: DiagnosisResult | null): NextAction {
  if (!result || result.areas.length === 0) {
    return {
      kind: "diagnose",
      headline: "Find out what to work on first",
      detail:
        "Answer 14 quick questions and get your Content Score — then we'll tell you the single thing to fix next.",
    };
  }
  const weakest = result.weaknesses[0];
  if (weakest.score >= STRONG_SCORE) {
    return {
      kind: "maintain",
      headline: "You're in flow — keep the streak",
      detail:
        "No weak spots left to shore up. The best move now is simply to keep posting on your rhythm.",
      area: weakest,
    };
  }
  return {
    kind: "mission",
    headline: `Your biggest focus: ${weakest.label}`,
    detail: `Scoring ${weakest.score}% here. Fix this before anything else — it's what's holding the rest back.`,
    mission: MISSIONS[weakest.id],
    area: weakest,
  };
}

// ---------------------------------------------------------------------------
// Persistence (localStorage, content-studio- prefix so cloudSync mirrors it).

const KEY_PREFIX = "content-studio-diagnosis-";

function safeStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadDiagnosis(
  userId: string | null | undefined,
): DiagnosisRecord | null {
  if (!userId) return null;
  const storage = safeStorage();
  if (!storage) return null;
  const raw = storage.getItem(`${KEY_PREFIX}${userId}`);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<DiagnosisRecord>;
    if (!parsed || typeof parsed.answers !== "object" || !parsed.answers) {
      return null;
    }
    return {
      answers: parsed.answers as Record<string, number>,
      completedAt: parsed.completedAt ?? "",
      role: typeof parsed.role === "string" ? parsed.role : undefined,
    };
  } catch {
    return null;
  }
}

export function saveDiagnosis(userId: string, record: DiagnosisRecord): void {
  const storage = safeStorage();
  if (storage) storage.setItem(`${KEY_PREFIX}${userId}`, JSON.stringify(record));
}

export function clearDiagnosis(userId: string): void {
  const storage = safeStorage();
  if (storage) storage.removeItem(`${KEY_PREFIX}${userId}`);
}

/** Convenience: the scored result for a stored diagnosis, or null. */
export function loadResult(
  userId: string | null | undefined,
): DiagnosisResult | null {
  const rec = loadDiagnosis(userId);
  if (!rec) return null;
  const result = scoreDiagnosis(rec.answers);
  return result.areas.length > 0 ? result : null;
}
