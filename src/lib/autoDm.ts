// Auto-DM (Recruit > Auto-DM, /recruit/auto-dm): someone comments a keyword on the adviser's post and
// Zernio sends them a DM (Instagram, Facebook) or posts a public reply (TikTok, Threads, LinkedIn,
// YouTube). The `social` function checks every id and runs the same field checks as the form
// (supabase/functions/social/automations.ts); this file holds the calls and the form's helpers.

import { callFn } from "@/lib/edgeFn";
import { scanCompliance, type ComplianceFlag } from "@/lib/compliance";
import {
  DM_PLATFORMS,
  LIMITS,
  checkInput,
  platformProblem,
  type AccountOption,
  type AutomationInput,
  type AutomationView,
  type LinkButton,
  type LogView,
  type PostOption,
  type Trigger,
} from "../../supabase/functions/social/automations.ts";

export { DM_PLATFORMS, LIMITS, type AccountOption, type AutomationView, type LinkButton, type LogView, type PostOption, type Trigger };

export const hasDm = (platform: string) => DM_PLATFORMS.includes(platform);

// ---- calls ----

export const listAutoDms = (profileId: string) =>
  callFn<{ accounts: AccountOption[]; automations: AutomationView[] }>("social", { action: "automations", profileId }, "Couldn't load your auto-DMs. Try again in a minute.");

export const accountPosts = (profileId: string, accountId: string) =>
  callFn<{ posts: PostOption[] }>("social", { action: "account-posts", profileId, accountId }, "Couldn't load your posts. Try again in a minute.");

export const saveAutoDm = (profileId: string, form: AutoDmForm, platform: string) =>
  form.id
    ? callFn<{ id: string }>("social", { action: "automation-update", profileId, automationId: form.id, automation: toInput(form, platform) }, "Couldn't save it. Try again in a minute.")
    : callFn<{ id: string | null }>("social", { action: "automation-create", profileId, accountId: form.accountId, automation: toInput(form, platform) }, "Couldn't save it. Try again in a minute.");

export const setAutoDmActive = (profileId: string, automationId: string, active: boolean) =>
  callFn<{ active: boolean }>("social", { action: "automation-update", profileId, automationId, active }, "Couldn't change it. Try again in a minute.");

export const deleteAutoDm = (profileId: string, automationId: string) =>
  callFn<{ deleted: true }>("social", { action: "automation-delete", profileId, automationId }, "Couldn't delete it. Try again in a minute.");

export const autoDmLogs = (profileId: string, automationId: string, skip = 0) =>
  callFn<{ logs: LogView[]; hasMore: boolean; total: number }>("social", { action: "automation-logs", profileId, automationId, skip }, "Couldn't load who got it. Try again in a minute.");

// ---- the form ----

export interface AutoDmForm {
  /** null for a new one */
  id: string | null;
  accountId: string;
  trigger: Trigger;
  platformPostId: string | null;
  /** As typed: keywords separated by commas. */
  keywordsText: string;
  everyComment: boolean;
  dm: string;
  dmVariations: string[];
  buttons: LinkButton[];
  reply: string;
  replyVariations: string[];
  alsoMatchInDms: boolean;
  followGate: boolean;
}

export const splitKeywords = (text: string) => text.split(",").map((k) => k.trim()).filter(Boolean);

export const emptyForm = (accountId = "", keyword = ""): AutoDmForm => ({
  id: null,
  accountId,
  trigger: "comment",
  platformPostId: null,
  keywordsText: keyword,
  everyComment: false,
  dm: "",
  dmVariations: [],
  buttons: [],
  reply: "",
  replyVariations: [],
  alsoMatchInDms: false,
  followGate: false,
});

export const formFromView = (a: AutomationView): AutoDmForm => ({
  id: a.id,
  accountId: a.accountId,
  trigger: a.trigger,
  platformPostId: a.platformPostId,
  keywordsText: a.keywords.join(", "),
  everyComment: a.everyComment,
  dm: a.dm,
  dmVariations: a.dmVariations,
  buttons: a.buttons,
  reply: a.reply,
  replyVariations: a.replyVariations,
  alsoMatchInDms: a.alsoMatchInDms,
  followGate: a.followGate,
});

/** What the form sends: what it shows for this platform. Empty extra wordings and blank buttons are dropped by the shared check. */
export function toInput(f: AutoDmForm, platform: string): AutomationInput {
  const story = f.trigger !== "comment";
  const dm = hasDm(platform);
  return {
    trigger: f.trigger,
    platformPostId: story ? null : f.platformPostId,
    keywords: f.trigger === "story_mention" || (f.everyComment && !story) ? [] : splitKeywords(f.keywordsText),
    everyComment: !story && f.everyComment,
    dm: dm ? f.dm : "",
    dmVariations: dm ? f.dmVariations : [],
    buttons: dm ? f.buttons : [],
    reply: story ? "" : f.reply,
    replyVariations: story ? [] : f.replyVariations,
    alsoMatchInDms: dm && f.trigger === "comment" && !f.everyComment && f.alsoMatchInDms,
    followGate: platform === "instagram" && f.followGate,
  };
}

/** Why the form can't be saved yet, in the server's own words, or null. */
export function formProblem(f: AutoDmForm, platform: string): string | null {
  if (!f.accountId) return "Pick the account first.";
  const r = checkInput(toInput(f, platform));
  return "error" in r ? r.error : platformProblem(r.value, platform);
}

/** Compliance flags over every line someone will read: the DM, its wordings, the buttons and the public replies. */
export function formFlags(f: AutoDmForm, platform: string): ComplianceFlag[] {
  const input = toInput(f, platform);
  const lines = [input.dm, ...input.dmVariations, ...input.buttons.map((b) => b.title), input.reply, ...input.replyVariations];
  const seen = new Set<string>();
  return lines.flatMap(scanCompliance).filter((x) => !seen.has(x.id) && seen.add(x.id));
}

/** Zernio fills these from the commenter; the preview uses a sample name. */
export const fillName = (text: string, first = "Sarah", username = "sarah.tan") =>
  text.replace(/\{\{\s*first_name\s*\}\}/g, first).replace(/\{\{\s*name\s*\}\}/g, `${first} Tan`).replace(/\{\{\s*username\s*\}\}/g, username);

// ---- starting points ----

export interface Starter {
  id: string;
  label: string;
  keyword: string;
  dm: string;
  button: string;
  reply: string;
  replyVariations: string[];
}

// Plain and compliant for Singapore financial consultants: no income or return figures, and the
// link button stays empty until the adviser types their own link.
export const STARTERS: Starter[] = [
  {
    id: "guide",
    label: "A free guide",
    keyword: "GUIDE",
    dm: "Hi {{first_name}}, thanks for asking! Here's the guide I mentioned. Have a read, and message me here if anything is unclear.",
    button: "Get the guide",
    reply: "Sent it to your DMs, {{first_name}}!",
    replyVariations: ["Check your DMs!", "Just sent it over."],
  },
  {
    id: "webinar",
    label: "A webinar seat",
    keyword: "SEAT",
    dm: "Hi {{first_name}}, here's where to save your seat for the webinar. It's free, and there's time for your questions at the end.",
    button: "Save my seat",
    reply: "Sent you the details in DM, {{first_name}}!",
    replyVariations: ["Check your DMs for the link.", "The details are in your DMs."],
  },
  {
    id: "chat",
    label: "A 15-minute chat",
    keyword: "CHAT",
    dm: "Hi {{first_name}}, happy to chat! Pick a 15-minute slot that suits you. No obligation, just your questions answered.",
    button: "Pick a time",
    reply: "Sent you a DM, {{first_name}}!",
    replyVariations: ["Check your DMs.", "Just messaged you."],
  },
];

/** Fills the words from a starting point; a keyword the adviser brought from Write stays. */
export function applyStarter(f: AutoDmForm, s: Starter, platform: string, keepKeyword = ""): AutoDmForm {
  const dm = hasDm(platform);
  return {
    ...f,
    trigger: "comment",
    keywordsText: keepKeyword || s.keyword,
    everyComment: false,
    dm: dm ? s.dm : "",
    dmVariations: [],
    buttons: dm ? [{ title: s.button, url: "" }] : [],
    reply: s.reply,
    replyVariations: s.replyVariations,
    alsoMatchInDms: dm,
    followGate: false,
  };
}

// ---- words on the page ----

/** The keyword a post asks people to comment or DM ("Comment INFO", "DM me GUIDE"), or "". The last one wins: CTAs close a post. */
export function ctaKeyword(text: string): string {
  const re = /\b(?:comment|dm|message|reply|type|send)(?:\s+(?:me|us|with|the\s+word))*\s+["'“‘]?([A-Za-z][A-Za-z0-9]{1,49})\b/gi;
  let found = "";
  for (const m of text.matchAll(re)) {
    const word = m[1];
    if (word === word.toUpperCase() && /[A-Z]/.test(word) && !["ME", "US"].includes(word)) found = word;
  }
  return found;
}

export const accountLabel = (a: Pick<AccountOption, "username" | "name">) => (a.username ? `@${a.username.replace(/^@/, "")}` : a.name || "Your account");

/** What happened for one commenter. Reply-only platforms answer with the public reply. */
export function logLine(l: LogView, platform: string): { text: string; ok: boolean } {
  const why = (s: string) => (s ? `: ${s}` : "");
  if (!hasDm(platform)) {
    if (l.reply === "sent") return { text: "Replied", ok: true };
    if (l.reply === "failed") return { text: `Reply failed${why(l.replyReason)}`, ok: false };
    if (l.reply === "pending") return { text: "Waiting to reply", ok: true };
    return { text: `Skipped${why(l.replyReason || l.reason)}`, ok: false };
  }
  if (l.status === "sent") return { text: l.clicked ? "Sent, clicked" : "Sent", ok: true };
  if (l.status === "failed") return { text: `Failed${why(l.reason)}`, ok: false };
  if (l.status === "pending") return { text: "Waiting to send", ok: true };
  if (l.status === "gated") return { text: "Asked to confirm they follow", ok: true };
  return { text: `Skipped${why(l.reason)}`, ok: false };
}

/** The automation's name on the page and in the delete question. */
export const autoDmName = (a: Pick<AutomationView, "keywords" | "trigger">) =>
  a.keywords.length ? a.keywords.join(", ") : a.trigger === "story_mention" ? "story mentions" : a.trigger === "story_reply" ? "story replies" : "every comment";
