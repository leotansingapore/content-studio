// Recruitment Brand Brain: one document per user (per profile once profiles
// land), persisted under the content-studio- prefix so cloudSync mirrors it.
//   key: content-studio-recruit-${userId}
//
// Everything the AI writes from is built here from the user's own words: the
// Context Document is assembled, not generated, so it can never invent a fact.

import {
  AGENT_METHOD,
  FORMULAS,
  INTERVIEW,
  PATHWAYS,
  RECRUIT_FORMATS,
  RHYTHM_SAMPLE,
  STAGES,
  STARL,
  type FormulaId,
  type PathwayId,
  type RecruitFormat,
  type RecruitStage,
  type StarlKey,
} from "@/data/recruitKit";
import { scanCompliance, type ComplianceFlag } from "@/lib/compliance";

export interface TrifectaRow {
  name: string;
  production: number;
  affinity: number;
  transformation: number;
}

export interface ConversationRow {
  name: string;
  sent: boolean;
  replied: boolean;
  booked: boolean;
  words: string;
}

export interface WeekNumbers {
  /** Monday of the week, YYYY-MM-DD. */
  week: string;
  posts: number;
  conversations: number;
  inProgress: number;
}

export interface RecruitBrain {
  trifecta: TrifectaRow[];
  icp: string;
  pathway: PathwayId | "";
  promise: string;
  promiseLive: { linkedin: boolean; instagram: boolean };
  voiceWords: string;
  phrases: string;
  proof: string;
  story: Record<StarlKey, string>;
  fixesDone: boolean[];
  conversations: ConversationRow[];
  interview: Record<string, string>;
  sprint: Record<string, boolean>;
  partner: string;
  weeks: WeekNumbers[];
  /** Self-check scores 1-5, morning and re-rate. */
  selfCheck: Record<string, number>;
  updatedAt: string;
}

const KEY_PREFIX = "content-studio-recruit-";

export function emptyBrain(): RecruitBrain {
  return {
    trifecta: Array.from({ length: 3 }, () => ({ name: "", production: 0, affinity: 0, transformation: 0 })),
    icp: "",
    pathway: "",
    promise: "",
    promiseLive: { linkedin: false, instagram: false },
    voiceWords: "",
    phrases: "",
    proof: "",
    story: { hook: "", s: "", t: "", a: "", r: "", l: "" },
    fixesDone: [false, false, false, false],
    conversations: Array.from({ length: 10 }, () => ({ name: "", sent: false, replied: false, booked: false, words: "" })),
    interview: {},
    sprint: {},
    partner: "",
    weeks: [],
    selfCheck: {},
    updatedAt: "",
  };
}

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadBrain(userId: string | null | undefined): RecruitBrain {
  const s = storage();
  if (!s || !userId) return emptyBrain();
  try {
    const parsed = JSON.parse(s.getItem(KEY_PREFIX + userId) ?? "null");
    // Merge over the empty shape so a doc saved by an older version still has every field.
    return parsed && typeof parsed === "object" ? { ...emptyBrain(), ...parsed } : emptyBrain();
  } catch {
    return emptyBrain();
  }
}

export function saveBrain(userId: string, brain: RecruitBrain): RecruitBrain {
  const next = { ...brain, updatedAt: new Date().toISOString() };
  storage()?.setItem(KEY_PREFIX + userId, JSON.stringify(next));
  return next;
}

/** The Trifecta row that sits in the centre: best total, ties to the weakest-link score. */
export function centreCandidate(rows: TrifectaRow[]): TrifectaRow | null {
  const scored = rows.filter((r) => r.name.trim() && r.production + r.affinity + r.transformation > 0);
  if (!scored.length) return null;
  const total = (r: TrifectaRow) => r.production + r.affinity + r.transformation;
  const floor = (r: TrifectaRow) => Math.min(r.production, r.affinity, r.transformation);
  return [...scored].sort((a, b) => total(b) - total(a) || floor(b) - floor(a))[0];
}

export function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

export function storyText(story: Record<StarlKey, string>): string {
  return STARL.map((p) => story[p.key].trim()).filter(Boolean).join("\n\n");
}

/** The five parts of the day, each done when its exercise has real content. */
export function partsDone(b: RecruitBrain) {
  return {
    candidate: b.icp.trim().length > 15,
    promise: b.promise.trim().length > 10,
    conversations: b.conversations.filter((c) => c.sent).length >= 10,
    story: wordCount(storyText(b.story)) >= 60,
    system: b.weeks.length > 0 || Object.values(b.sprint).some(Boolean),
  };
}

export function personalisedScript(script: string, icp: string): string {
  const who = icp.trim().replace(/^i help\s+/i, "").split(/\s+who\s+|,|\./i)[0]?.trim();
  return who ? script.replace("[your ONE candidate]", who) : script;
}

export function interviewAnswered(b: RecruitBrain): number {
  return INTERVIEW.filter((q) => (b.interview[q.id] ?? "").trim().length > 0).length;
}

const lines = (text: string) =>
  text
    .split(/\n+/)
    .map((l) => l.replace(/^[-*\d.)\s]+/, "").trim())
    .filter(Boolean);

/** Prompt 1's five headings, filled from the Brand Brain and the interview answers. */
export function buildContextDocument(b: RecruitBrain): string {
  const a = (id: string) => (b.interview[id] ?? "").trim();
  const pathway = PATHWAYS.find((p) => p.id === b.pathway);
  const out: string[] = ["MY CONTEXT DOCUMENT", ""];
  out.push("1. BRAND DNA");
  if (a("q10")) out.push(`Who I am: ${a("q10")}`);
  if (a("q3")) out.push(`Why I am the most relevant leader: ${a("q3")}`);
  if (b.promise.trim()) out.push(`My promise: ${b.promise.trim()}${pathway ? ` (pathway: ${pathway.label})` : ""}`);
  if (b.voiceWords.trim()) out.push(`My voice: ${b.voiceWords.trim()}`);
  if (b.phrases.trim()) out.push(`Phrases I actually say: ${b.phrases.trim()}`);
  out.push("", "2. MY ONE CANDIDATE");
  if (b.icp.trim()) out.push(`ICP: ${b.icp.trim()}`);
  const centre = centreCandidate(b.trifecta);
  if (centre) out.push(`The real person in the centre of my Trifecta: ${centre.name.trim()}`);
  if (a("q1")) out.push(`Their life now, and what they are quietly unhappy about: ${a("q1")}`);
  if (a("q2")) out.push(`Who I enjoy building with: ${a("q2")}`);
  if (a("q4")) out.push(`What they believe that is wrong: ${a("q4")}`);
  if (a("q6")) out.push(`What they ask and what they are afraid of: ${a("q6")}`);
  const words = b.conversations.map((c) => c.words.trim()).filter(Boolean);
  if (words.length) out.push(`Their own words, from my Ten Conversations: ${words.map((w) => `"${w}"`).join(" ")}`);
  out.push("", "3. PROOF BANK (no income figures)");
  for (const p of lines(b.proof)) out.push(`- ${p}`);
  if (a("q7")) out.push(`- A recruit who made it: ${a("q7")}`);
  if (a("q8")) out.push(`- The first 90 days I run: ${a("q8")}`);
  out.push("", "4. STORY BANK (STARL)");
  for (const p of STARL) if (b.story[p.key].trim()) out.push(`${p.label}: ${b.story[p.key].trim()}`);
  if (a("q9")) out.push(`The hardest part I tell people upfront: ${a("q9")}`);
  if (a("q5")) out.push(`Why now, in Singapore: ${a("q5")}`);
  out.push("", "5. RAW ANSWERS (my words, do not tidy)");
  for (const q of INTERVIEW) if (a(q.id)) out.push(`Q: ${q.q}\nA: ${a(q.id)}`);
  return out.join("\n");
}

/** Context Document + Prompts 2 and 3, ready to paste into a ChatGPT or Claude project. */
export function buildAgentPack(b: RecruitBrain): string {
  const formulas = FORMULAS.map((f) => `${f.n}. ${f.label.toUpperCase()}: ${f.how}`).join("\n");
  const stages = STAGES.map(
    (s) => `${s.id.toUpperCase()}, ${s.share}%, ${s.label.toLowerCase()}: ${s.job} Goal: ${s.goal}. ${s.formulas} ${s.ask}`,
  ).join("\n");
  return [
    buildContextDocument(b),
    "",
    "From now on, you are my recruitment content agent. My Context Document above is your source of truth. Follow the #TopofMind method (Benjamin Loh, CSP) below every time.",
    "",
    AGENT_METHOD,
    "",
    "FUNNEL, MIX 50/30/20",
    stages,
    "",
    "FORMATS",
    RECRUIT_FORMATS.map((f) => f.rule).join("\n"),
    "",
    "THE 7 FORMULAS",
    formulas,
    "",
    "THE RHYTHM TO AIM FOR (Formula 2, a sample). Write with that rhythm, in my voice and with my facts. Never borrow this sample's facts.",
    RHYTHM_SAMPLE,
  ].join("\n");
}

export interface Angle {
  id: string;
  formula: FormulaId;
  stage: RecruitStage;
  text: string;
}

// Each interview answer already contains a post. The pairing follows the kit:
// a wrong belief is a Myth Bust, a fear is a Hard Truth, and so on.
const ANGLE_MAP: { q: string; formula: FormulaId; stage: RecruitStage; label: string }[] = [
  { q: "q4", formula: "myth", stage: "tofu", label: "The career myth my candidate still believes" },
  { q: "q1", formula: "authority", stage: "tofu", label: "What my ONE candidate is quietly unhappy about" },
  { q: "q10", formula: "personal", stage: "tofu", label: "Where I was, what changed, where I am now" },
  { q: "q5", formula: "authority", stage: "tofu", label: "Why now is the moment, in Singapore" },
  { q: "q6", formula: "hard-truth", stage: "mofu", label: "The fear behind the questions people ask me" },
  { q: "q9", formula: "hard-truth", stage: "mofu", label: "The hardest part of this career, said upfront" },
  { q: "q8", formula: "framework", stage: "mofu", label: "What the first 90 days with me look like" },
  { q: "q2", formula: "room", stage: "mofu", label: "The kind of person I love building with" },
  { q: "q7", formula: "career-change", stage: "bofu", label: "A recruit who made it, and what surprised them" },
  { q: "q3", formula: "authority", stage: "bofu", label: "Why I'm the right leader for this person" },
];

export function anglesFrom(b: RecruitBrain): Angle[] {
  return ANGLE_MAP.filter((m) => (b.interview[m.q] ?? "").trim()).map((m) => ({
    id: m.q,
    formula: m.formula,
    stage: m.stage,
    text: `${m.label}: ${(b.interview[m.q] ?? "").trim().slice(0, 220)}`,
  }));
}

/** The directive folded into ideaContext for generate-social-content. */
export function buildRecruitBrief(
  b: RecruitBrain,
  opts: { format: RecruitFormat; formula: FormulaId | null; stage: RecruitStage; topic: string },
): string {
  const fmt = RECRUIT_FORMATS.find((f) => f.id === opts.format)!;
  const stage = STAGES.find((s) => s.id === opts.stage)!;
  const formula = opts.formula ? FORMULAS.find((f) => f.id === opts.formula) : null;
  return [
    "THIS IS A RECRUITMENT POST, NOT CLIENT CONTENT. It is written to attract one future team member (my ONE candidate) to a career as a financial adviser on my team. It must not sell or explain any insurance or investment product. These instructions override any client-content guidance.",
    "",
    `THE POST: ${opts.topic.trim()}`,
    `FUNNEL STAGE: ${stage.id.toUpperCase()} (${stage.label}). ${stage.job} Goal: ${stage.goal}. ${stage.ask}`,
    formula
      ? `FORMULA ${formula.n}, ${formula.label.toUpperCase()}: ${formula.how}`
      : "FORMULA: pick the one of the 7 formulas that fits best.",
    fmt.rule,
    "Every piece contains at least one of these: a specific insight from real experience, a real team or recruiting story (anonymised), a number or a concrete example, or a moment from a career talk.",
    "",
    AGENT_METHOD,
    "",
    "THE RHYTHM TO AIM FOR (never borrow its facts):",
    RHYTHM_SAMPLE,
    "",
    buildContextDocument(b),
  ].join("\n");
}

// The kit's red lines as checks on top of the MAS wording rules. Warnings, not
// blocks: a person reads the chip and decides.
const RECRUIT_RULES: { id: string; pattern: RegExp; severity: "warn" | "error"; message: string }[] = [
  {
    id: "income-figure",
    pattern: /(\$\s?\d[\d,.]*\s?k?\b|\b\d[\d,.]*\s?k\s*(a|per|\/)\s*(month|year|mth|yr)\b|\b(six|five|seven)[- ]figure)/i,
    severity: "error",
    message: "No income figures, ranges or projections in recruitment content.",
  },
  {
    id: "income-promise",
    pattern: /\b(earn|income|make)\s+(more|up to|over|at least)\b|\bfinancial freedom\b|\bget rich\b|\bovernight success\b|\bpassive income\b/i,
    severity: "error",
    message: "Never promise income or imply guaranteed success.",
  },
  {
    id: "hard-recruit",
    pattern: /\b(dm|message|pm)\s+me\s+to\s+join\b|\bjoin\s+my\s+team\b|\bwe(?:'re| are)\s+hiring\b/i,
    severity: "error",
    message: "Soft asks only. Invite a chat; never \"DM me to join my team\".",
  },
  {
    id: "other-firm",
    pattern: /\b(prudential|great eastern|manulife|singlife|hsbc life|tokio marine|fwd|income insurance|etiqa|china life|axa|aviva|raffles health)\b/i,
    severity: "warn",
    message: "Never name or criticise another firm.",
  },
  {
    id: "ai-words",
    pattern: /\b(journey|unlock|unleash|elevate|seamless(ly)?|leverage|delve|dive into|navigate|tailored|robust|testament|game[- ]changer)\b/i,
    severity: "warn",
    message: "AI-sounding word. Say it the way you would at a career talk.",
  },
  {
    id: "em-dash",
    pattern: /—/,
    severity: "warn",
    message: "No em dashes. Use a full stop or a comma.",
  },
];

export function scanRecruitCompliance(text: string): ComplianceFlag[] {
  const flags = scanCompliance(text);
  for (const rule of RECRUIT_RULES) {
    const m = text.match(rule.pattern);
    if (m) {
      flags.push({ id: `${rule.id}::${m[0].toLowerCase()}`, ruleId: rule.id, severity: rule.severity, message: rule.message, match: m[0] });
    }
  }
  return flags;
}

/** Monday of the week containing `d`, as YYYY-MM-DD in local time. */
export function weekOf(d: Date): string {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

export function upsertWeek(weeks: WeekNumbers[], row: WeekNumbers): WeekNumbers[] {
  return [row, ...weeks.filter((w) => w.week !== row.week)].sort((a, b) => b.week.localeCompare(a.week));
}
