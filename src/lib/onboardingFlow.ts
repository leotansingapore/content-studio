// First-run set-up at /welcome (Holo's shape: one question per screen). The step machine only: every function takes a
// flow and returns the next one, so resume, back, skip and a failed read are plain data. The page (OnboardingFlow)
// owns the site read and the savers; the logo a read finds goes straight to the brand kit (a data URL, too big to
// rewrite on every keystroke here). The whole flow is one synced key, content-studio-onboarding-<uid>, written on
// every change, so the step and each typed value come back after a reload or on another device.

import { blankDna, parseTopics, type BrandDna } from "@/lib/addBrand";
import type { GoalKind, PlanAudience, PlanPlatform } from "@/lib/positioning";

export const flowKey = (userId: string) => `content-studio-onboarding-${userId}`;

export const STEPS = ["website", "nosite", "networks", "reading", "review", "connect", "done"] as const;
export type Step = (typeof STEPS)[number];
export const SECTIONS = ["brand", "look", "voice"] as const;
export type Section = (typeof SECTIONS)[number];
export const SECTION_NAMES: Record<Section, string> = { brand: "Brand", look: "Look", voice: "Voice" };
/** The six networks an account can connect (socialConnect's SOCIAL_PLATFORMS), in the order they are offered. Never X. */
export const NETWORK_KEYS = ["instagram", "facebook", "tiktok", "linkedin", "youtube", "threads"] as const;
export type Network = (typeof NETWORK_KEYS)[number];
const PLAN_PLATFORMS: readonly string[] = ["instagram", "facebook", "tiktok", "linkedin"];
const GOALS: readonly string[] = ["clients", "audience", "trust", "recruit", "time"];
const AUDIENCES: readonly string[] = ["young-adult", "working-adult", "parent", "pre-retiree", "general"];

export interface Draft {
  name: string;
  profession: string;
  oneLiner: string;
  audience: PlanAudience;
  audienceDetail: string;
  colour: string;
  voice: string;
  /** As typed, comma separated. */
  topics: string;
  handles: Partial<Record<string, string>>;
}

export interface Flow {
  v: 1;
  step: Step;
  /** The website box as typed. */
  typed: string;
  /** The address last sent to be read; empty on the no-website path. */
  address: string;
  read: "none" | "running" | "ok" | "failed";
  /** The plain line shown when the read failed. */
  readError: string;
  /** When the running read started, for the ticking steps. */
  readAt: number;
  networks: Network[];
  draft: Draft;
  confirmed: Section[];
  goalKind: GoalKind | "";
  cadence: number;
}

export const EMPTY_DRAFT: Draft = { name: "", profession: "", oneLiner: "", audience: "general", audienceDetail: "", colour: "", voice: "", topics: "", handles: {} };
export const newFlow = (): Flow => ({ v: 1, step: "website", typed: "", address: "", read: "none", readError: "", readAt: 0, networks: [], draft: EMPTY_DRAFT, confirmed: [], goalKind: "", cadence: 0 });

/** The kept flow read back as text, or null when there is none or it is not one of ours. */
export function parseFlow(raw: string | null): Flow | null {
  try {
    const f = JSON.parse(raw ?? "null");
    if (!f || typeof f !== "object" || f.v !== 1 || !STEPS.includes(f.step)) return null;
    const str = (v: unknown) => (typeof v === "string" ? v : "");
    const d = f.draft && typeof f.draft === "object" ? f.draft : {};
    const handles = d.handles && typeof d.handles === "object" ? d.handles : {};
    return {
      v: 1,
      step: f.step,
      typed: str(f.typed),
      address: str(f.address),
      read: ["running", "ok", "failed"].includes(f.read) ? f.read : "none",
      readError: str(f.readError),
      readAt: typeof f.readAt === "number" ? f.readAt : 0,
      networks: NETWORK_KEYS.filter((n) => Array.isArray(f.networks) && f.networks.includes(n)),
      draft: {
        name: str(d.name), profession: str(d.profession), oneLiner: str(d.oneLiner),
        audience: (AUDIENCES.includes(d.audience) ? d.audience : "general") as PlanAudience,
        audienceDetail: str(d.audienceDetail), colour: str(d.colour), voice: str(d.voice), topics: str(d.topics),
        handles: Object.fromEntries(Object.entries(handles).filter((e): e is [string, string] => typeof e[1] === "string")),
      },
      confirmed: SECTIONS.filter((s) => Array.isArray(f.confirmed) && f.confirmed.includes(s)),
      goalKind: (GOALS.includes(f.goalKind) ? f.goalKind : "") as GoalKind | "",
      cadence: typeof f.cadence === "number" && f.cadence > 0 ? f.cadence : 0,
    };
  } catch {
    return null;
  }
}

/**
 * Who gets the flow: an account not yet onboarded that is either part way through it or has no "What do you do?"
 * answer. Onboarded accounts, and brands that already answered, keep the page they had.
 */
export const shouldRun = (onboarded: boolean, hasProfession: boolean, kept: Flow | null): boolean => !onboarded && (!!kept || !hasProfession);

export const patchDraft = (f: Flow, p: Partial<Draft>): Flow => ({ ...f, draft: { ...f.draft, ...p } });

/**
 * "Read my website": on to the networks while the read runs. The same address already read is not read again, and
 * only values another site gave are cleared: what the person typed, or a failed read left empty, stays.
 */
export function submitSite(f: Flow, now: number): Flow {
  const address = f.typed.trim();
  if (!address) return f;
  if (address === f.address && (f.read === "ok" || f.read === "running")) return { ...f, step: "networks" };
  const other = f.read === "ok";
  return {
    ...f, address, step: "networks", read: "running", readError: "", readAt: now,
    confirmed: other ? [] : f.confirmed,
    draft: other ? { ...EMPTY_DRAFT, profession: f.draft.profession } : f.draft,
  };
}

/** "I don't have a website": name and what you do instead. Nothing typed so far is dropped. */
export const noSite = (f: Flow): Flow => ({ ...f, step: "nosite" });
export const noSiteReady = (f: Flow) => !!f.draft.name.trim() && !!f.draft.profession.trim();
/** From the name screen: no read, so the review opens with the other fields empty. */
export const submitNoSite = (f: Flow): Flow => (noSiteReady(f) ? { ...f, step: "networks", address: "", read: "none", readError: "" } : f);

export const toggleNetwork = (f: Flow, n: Network): Flow => ({ ...f, networks: NETWORK_KEYS.filter((k) => (k === n ? !f.networks.includes(n) : f.networks.includes(k))) });

/** Past the networks: the wait while the read still runs, else straight to the review. */
export const afterNetworks = (f: Flow): Flow => ({ ...f, step: f.read === "running" ? "reading" : "review" });

/** The read came back: it fills only what is still empty, ticks the networks it found, and ends the wait. */
export function readDone(f: Flow, dna: BrandDna): Flow {
  if (f.read !== "running") return f;
  const d = f.draft;
  const found = NETWORK_KEYS.filter((n) => dna.handles[n as keyof BrandDna["handles"]]?.trim());
  return {
    ...f,
    read: "ok",
    step: f.step === "reading" ? "review" : f.step,
    networks: NETWORK_KEYS.filter((n) => f.networks.includes(n) || found.includes(n)),
    draft: {
      ...d,
      name: d.name.trim() ? d.name : dna.name.slice(0, 40),
      oneLiner: d.oneLiner.trim() ? d.oneLiner : dna.oneLiner,
      audience: d.audience !== "general" ? d.audience : dna.audience,
      audienceDetail: d.audienceDetail.trim() ? d.audienceDetail : dna.audienceDetail,
      colour: d.colour || (dna.colour ?? ""),
      voice: d.voice.trim() ? d.voice : dna.voice,
      topics: d.topics.trim() ? d.topics : dna.topics.join(", "),
      handles: { ...dna.handles, ...d.handles },
    },
  };
}

/** The read failed: say so, name the brand from the address, and carry on to the review by hand. */
export function readFailed(f: Flow, line: string): Flow {
  if (f.read !== "running") return f;
  return { ...f, read: "failed", readError: line, step: f.step === "reading" ? "review" : f.step, draft: { ...f.draft, name: f.draft.name.trim() ? f.draft.name : blankDna(f.address).name } };
}

/** The wait's own way out: on to the review now. A read that lands later still fills what is empty. */
export const stopWaiting = (f: Flow): Flow => (f.step === "reading" ? { ...f, step: "review" } : f);

/** The section open in the review: the first one not confirmed yet. */
export const openSection = (f: Flow): Section | null => SECTIONS.find((s) => !f.confirmed.includes(s)) ?? null;

/** Brand needs a name and what the person does: unanswered, every writer writes as a financial adviser. */
export const canConfirm = (f: Flow, s: Section): boolean => s !== "brand" || noSiteReady(f);

export function confirmSection(f: Flow, s: Section, canConnect: boolean): Flow {
  if (!canConfirm(f, s)) return f;
  const confirmed = SECTIONS.filter((x) => x === s || f.confirmed.includes(x));
  return { ...f, confirmed, step: confirmed.length === SECTIONS.length ? (canConnect ? "connect" : "done") : "review" };
}

export const reopenSection = (f: Flow, s: Section): Flow => ({ ...f, confirmed: f.confirmed.filter((x) => x !== s) });

export const afterConnect = (f: Flow): Flow => ({ ...f, step: "done" });

/** Where the back arrow goes, or null where there is nothing behind (the first screen, and the finish). */
export function backStep(f: Flow): Step | null {
  switch (f.step) {
    case "nosite":
      return "website";
    case "networks":
      return f.address ? "website" : "nosite";
    case "reading":
    case "review":
      return "networks";
    case "connect":
      return "review";
    default:
      return null;
  }
}
/** Back changes the screen only: every typed value and every confirmed section stays. */
export const back = (f: Flow): Flow => {
  const step = backStep(f);
  return step ? { ...f, step } : f;
};

/** The bar at the top: which of the screens this account will see it is on. */
export function progress(f: Flow, canConnect: boolean): { at: number; of: number } {
  const path: Step[] = ["website", "networks", "review", ...(canConnect || f.step === "connect" ? (["connect"] as const) : []), "done"];
  const here = f.step === "nosite" ? "website" : f.step === "reading" ? "networks" : f.step;
  return { at: path.indexOf(here) + 1, of: path.length };
}

/** The review's score and the gain it names: "33% set up. Confirm Look to reach 67%." */
export function reviewLine(f: Flow): { pct: number; line: string } {
  const pct = Math.round((f.confirmed.length / SECTIONS.length) * 100);
  const next = openSection(f);
  const gain = Math.round(((f.confirmed.length + 1) / SECTIONS.length) * 100);
  return { pct, line: next ? `${pct}% set up. Confirm ${SECTION_NAMES[next]} to reach ${gain}%.` : "100% set up." };
}

/** The network the plan and the weekly goal are kept under: the first one picked that a plan can be for. */
export const mainPlatform = (f: Flow, fallback: PlanPlatform): PlanPlatform => (f.networks.find((n) => PLAN_PLATFORMS.includes(n)) as PlanPlatform | undefined) ?? fallback;

/** The first post's topic: the brand's first topic, or none. */
export const firstTopic = (f: Flow): string => parseTopics(f.draft.topics)[0] ?? "";
