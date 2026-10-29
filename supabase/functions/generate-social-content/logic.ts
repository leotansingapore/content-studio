// The post writer's prompts (Write, Batch, Your voice), moved out of index.ts unchanged so vitest covers them.
// No Deno or npm imports.

import { aOrAn, HONEST_LINE, professionOf } from "../_shared/profession.ts";

// The app's own types for these fields (GeneratePage, BatchPage, batchGenerate) are these lists, so every request it
// makes passes requestError.
export const PILLAR_VALUES = ["interest", "identity", "topic", "market"] as const;
export const FORMAT_VALUES = ["carousel", "short-video", "text-post", "story"] as const;
export const PLATFORM_VALUES = ["linkedin", "instagram", "facebook", "tiktok"] as const;
export const CTA_VALUES = ["dm-keyword", "comment-keyword", "save-share", "book-call", "open-question"] as const;
export const AUDIENCE_VALUES = ["young-adult", "working-adult", "parent", "pre-retiree", "general"] as const;
/** Answer mode's two shapes: a reply under someone's question, or a long self-post (Reddit guide). */
export const ANSWER_SHAPES = ["reply", "guide"] as const;
export type Pillar = (typeof PILLAR_VALUES)[number];
export type Format = (typeof FORMAT_VALUES)[number];
export type Platform = (typeof PLATFORM_VALUES)[number];
export type CtaType = (typeof CTA_VALUES)[number];
export type Audience = (typeof AUDIENCE_VALUES)[number];
export type AnswerShape = (typeof ANSWER_SHAPES)[number];
export type Mode = "hooks" | "body" | "post" | "voice-summary" | "hashtags" | "image-prompt" | "answer" | "vsl";

export interface RequestBody {
  pillar?: Pillar;
  pillarDetail?: string;
  ideaSource?: string;
  ideaContext?: string;
  format?: Format;
  platform?: Platform;
  ctaType?: CtaType;
  styleReference?: string;
  audience?: Audience;
  mode?: Mode;
  n?: number;
  chosenHook?: string;
  stream?: boolean;
  voiceSummary?: string;
  singlish?: boolean;
  posts?: string[];
  draft?: string;
  /** The brand's "What do you do?" (../_shared/profession.ts): none, or an adviser's, keeps today's adviser prompts. */
  profession?: string;
  /** Answer mode: where it will be posted ("r/SGExams", "a Facebook group for new agents"). The question is ideaContext. */
  community?: string;
  /** Answer mode: the community's rule on links and self-promotion, in the user's words. */
  linkRule?: string;
  answerShape?: AnswerShape;
}

export const PILLAR_GUIDE: Record<Pillar, string> = {
  interest:
    "Centre on a hobby/passion of the FC (e.g. running, gaming, photography). Open with a personal moment from that interest, then bridge to a financial insight. Humanises the FC; attracts similar-interest prospects.",
  identity:
    "Centre on a life-stage or role the FC and audience share (e.g. mum of two, fresh grad, career-switcher). Speak in a 'us, not them' voice. People engage because the FC 'gets them'.",
  topic:
    "Centre on a specific financial area (CPF, ILPs, critical illness, retirement, estate planning, taxes). The FC becomes known for THIS topic. Be concrete - real numbers, real Singapore rules.",
  market:
    "Centre on a specific client segment (fresh grads, families, single parents, SME owners, teachers). Prospects in that segment self-select. Use language and pain-points that segment recognises instantly.",
};

export const FORMAT_GUIDE: Record<Format, string> = {
  carousel:
    "Output 5-8 slides. One idea per slide. Slide 1 = hook. Slides 2-N = teaching (one micro-point each). Final slide = CTA. Format the response as: 'SLIDE 1', 'SLIDE 2', etc., each with a slide title and 1-3 lines of body copy.",
  "short-video":
    "Output a 30-60 second face-to-camera script. Include: HOOK (first 3 seconds, must stop the scroll), BODY (one tight teaching point with a concrete number/example), CTA (one ask). Add suggested CAPTION for the video post separately. Burned-in caption suggestions optional.",
  "text-post":
    "Output a text post: 100-250 words. Open with a one-line hook (no 'In this post' meta-talk). Use short paragraphs, white space, plain English, mobile-readable. End with a CTA + an open question.",
  story:
    "Output 3-5 story frames suitable for Instagram/Facebook stories. Each frame = one short sentence + one design suggestion (e.g. 'Bold text on dark gradient', 'Selfie with caption overlay'). Last frame = CTA with sticker/poll/DM prompt.",
};

export const PLATFORM_VOICE: Record<Platform, string> = {
  linkedin:
    "Voice: thought leadership / professional. No emojis or 1-2 max. Industry-credible. First-person stories OK. Hashtags: 3-5, relevant.",
  instagram:
    "Voice: warm, personal, magazine-feel. Emojis OK but sparing. Visual-first: assume the photo/graphic does heavy lifting. Hashtags: 8-15, mix of broad + niche SG tags.",
  facebook:
    "Voice: conversational, family-living-room. No emoji-spam. Shareable angle. Local SG references welcome. Hashtags: 0-3.",
  tiktok:
    "Voice: punchy, hook-first, conversational. Native TikTok tone (not corporate). One idea, fast. Captions short. Hashtags: 3-5, trend-aware.",
};

export const CTA_GUIDE: Record<CtaType, string> = {
  "dm-keyword":
    "End with a soft DM-keyword CTA. Example pattern: 'DM me [WORD] for the [resource]'. Pick a single short uppercase keyword.",
  "comment-keyword":
    "End with a comment-keyword CTA. Example pattern: 'Comment [WORD] below and I'll send you the [resource].'",
  "save-share":
    "End with a save/share CTA. Example pattern: 'Save this for when you next look at your CPF statement' or 'Share with a friend who's drowning in this question.'",
  "book-call":
    "End with a soft 15-min call CTA. Example pattern: 'If you'd like a no-pressure 15-min review of your own plan, DM me.' Avoid hard pitches.",
  "open-question":
    "End with an open question that invites comments. Example pattern: 'What's the one CPF question you've never had answered? Drop it below.'",
};

export const AUDIENCE_GUIDE: Record<Audience, string> = {
  "young-adult":
    "Audience: young adults aged 21-27 in Singapore. Fresh grads, early-career, often first job. Pain-points: HDB BTO timing, first insurance buy, CPF SA basics, student loan repayment, lifestyle inflation. Voice: relatable, peer-to-peer, no jargon, no parent-talk.",
  "working-adult":
    "Audience: working adults aged 28-40 in Singapore. Mid-career, dual-income or single, building savings, mortgage holders. Pain-points: ILP regret, term-vs-whole-life, CPF SA top-up timing, MediShield Life integration, salary protection. Voice: peer, practical, specific numbers.",
  parent:
    "Audience: parents in Singapore with kids under 16. Concerns: education endowment vs investment, child CI/hospital plan, family income protection, legacy. Voice: empathetic, family-first, no scare tactics.",
  "pre-retiree":
    "Audience: pre-retirees aged 50-62 in Singapore. Concerns: CPF Life payout timing, retirement income gap, healthcare costs in retirement, legacy/estate, downsizing HDB. Voice: respectful, concrete, longer time horizons.",
  general:
    "Audience: general Singapore adults. Don't over-narrow; speak to a broad working/family audience.",
};

export const VARIANT_NUDGES = [
  "Variant tone: lean toward myth-busting framing - call out a common misconception in the opening, then correct it with the concrete teaching point.",
  "Variant tone: lean toward client-story framing - open with an anonymised real-client moment ('A client asked me last week...'), then teach.",
  "Variant tone: lean toward question-driven framing - open with a sharp question the reader is already asking themselves, then answer it.",
  "Variant tone: lean toward number-led framing - open with a concrete Singapore number/stat that reframes the issue, then unpack it.",
  "Variant tone: lean toward contrarian framing - take the opposite of the popular advice and defend it with one specific reason.",
];

export const HOOK_NUDGES = [
  "Hook style: a sharp question the reader is already asking themselves.",
  "Hook style: a myth-busting one-liner that reverses common belief.",
  "Hook style: a concrete Singapore number/stat that reframes the issue.",
  "Hook style: an anonymised client moment, told in one line.",
  "Hook style: a contrarian take on popular advice.",
];

export function audienceLine(audience?: Audience): string {
  if (!audience || audience === "general") return AUDIENCE_GUIDE.general;
  return AUDIENCE_GUIDE[audience];
}

export function basePromptLines(body: RequestBody): string[] {
  const p = professionOf(body.profession);
  if (p) return generalBaseLines(body, p);
  const lines = [
    "You are a content drafting assistant for an AIA financial consultant in Singapore.",
    "You produce one social-media post draft at a time, using the framework taught in Day 40-42 of their training:",
    "- Every post must hit Authority + Social + a soft CTA. The CTA is mandatory.",
    "- Authority = demonstrate competence. Social = demonstrate humanity. CTA = invite interaction.",
    "- Audience starts as a 'Skeptical Stranger'. The post's job is to move them one step toward 'Curious Follower' or 'Trusted Choice'. No hard pitches.",
    "- Singapore-specific where relevant (CPF, MAS, SGD, local context).",
    "- No political opinions. No religious proselytising. No claims of guaranteed returns. No naming specific competitor products in a disparaging way.",
    "- Concrete > abstract. Use real numbers, real ratios, real situations. Avoid platitudes ('investment is important for your future').",
    "- The FC's voice should sound human, not corporate. Match the platform.",
    "- Output the draft as ready-to-paste copy. No preamble, no 'Here is your post:'. Just the post. If multiple slides/frames, label them clearly.",
    "",
    `## Audience`,
    audienceLine(body.audience),
    "",
    `## Pillar: ${body.pillar ?? "topic"}`,
    PILLAR_GUIDE[body.pillar ?? "topic"],
    body.pillarDetail ? `Specific pillar detail: ${body.pillarDetail}` : "",
    "",
    `## Idea source: ${body.ideaSource ?? ""}`,
    body.ideaContext
      ? `Context from FC: ${body.ideaContext}`
      : "If no context provided, infer a plausible Singapore-specific scenario.",
    "",
    `## Platform: ${body.platform ?? "linkedin"}`,
    PLATFORM_VOICE[body.platform ?? "linkedin"],
    "",
    `## Format: ${body.format ?? "text-post"}`,
    FORMAT_GUIDE[body.format ?? "text-post"],
    "",
    `## CTA style: ${body.ctaType ?? "open-question"}`,
    CTA_GUIDE[body.ctaType ?? "open-question"],
    body.styleReference ? `\n## Style reference (match the structural pattern, don't copy verbatim)\n${body.styleReference}` : "",
  ];
  if (body.voiceSummary && body.voiceSummary.trim().length > 0) {
    lines.push(
      "",
      "## Voice profile (match this consultant's tone/structure)",
      "This consultant's voice profile (match this tone/structure):",
      body.voiceSummary.trim(),
    );
  }
  if (body.singlish === true) {
    lines.push(
      "",
      "## Singlish",
      "Use light Singlish where it lands naturally - 'lah', 'leh', 'can?', 'shiok' - but keep the post readable for non-SG audiences. Don't overdo it; aim for 1-3 Singlish moments per post max.",
    );
  }
  return lines;
}

export function postSystemPrompt(body: RequestBody, variantIndex: number): string {
  const lines = basePromptLines(body);
  const nudges = professionOf(body.profession) ? GENERAL_VARIANT_NUDGES : VARIANT_NUDGES;
  const nudge = nudges[variantIndex % nudges.length];
  lines.push("", `## ${nudge}`, "", "Now produce the draft.");
  return lines.filter(Boolean).join("\n");
}

export function hooksSystemPrompt(body: RequestBody, variantIndex: number): string {
  const lines = basePromptLines(body);
  const nudges = professionOf(body.profession) ? GENERAL_HOOK_NUDGES : HOOK_NUDGES;
  const nudge = nudges[variantIndex % nudges.length];
  lines.push(
    "",
    "## Output mode: HOOK ONLY",
    "Produce ONLY the opening hook for the post. 1-2 lines maximum. No body, no CTA, no slide labels. Just the hook line(s) ready to paste as the first line of a post.",
    `## ${nudge}`,
    "",
    "Now produce the hook.",
  );
  return lines.filter(Boolean).join("\n");
}

export function bodySystemPrompt(body: RequestBody, variantIndex: number, chosenHook: string): string {
  const lines = basePromptLines(body);
  const nudges = professionOf(body.profession) ? GENERAL_VARIANT_NUDGES : VARIANT_NUDGES;
  const nudge = nudges[variantIndex % nudges.length];
  lines.push(
    "",
    "## Required opening",
    `The post MUST open with this exact hook (do not rewrite it):`,
    chosenHook,
    "After the hook, deliver the body and CTA per the platform/format/CTA rules above.",
    `## ${nudge}`,
    "",
    "Now produce the full draft, leading with the required hook above.",
  );
  return lines.filter(Boolean).join("\n");
}

export function userPrompt(body: RequestBody, mode: Mode): string {
  if (mode === "answer") return `Write my ${body.answerShape === "guide" ? "guide post" : "reply"} now, following the system instructions.`;
  if (mode === "vsl") return "Write my video sales letter script now, following the system instructions.";
  if (mode === "hooks") {
    return `Produce one ${body.platform} hook for a ${body.format}, following the system instructions.`;
  }
  return `Draft my ${body.platform} ${body.format} now, following the system instructions.`;
}

export function voiceSummarySystemPrompt(body: RequestBody): string {
  if (professionOf(body.profession)) return generalVoiceSummaryPrompt(body);
  const lines = [
    "You are a writing-voice analyst. You receive several past social-media posts written by one consultant.",
    "Distil the consultant's voice into TWO short paragraphs.",
    "Paragraph 1: tone and voice traits - formality level, warmth, signature words, recurring phrases, level of vulnerability, how they handle authority vs personal.",
    "Paragraph 2: structural patterns - how they open hooks, paragraph length, line-break habits, list usage, typical post length, how they close / CTA, any repeating frameworks.",
    "Be specific and quotable. Reference 1-2 short patterns verbatim if they recur. No bullet points; flowing prose.",
    "Output ONLY the two paragraphs. No preamble. No headers like 'Paragraph 1'. Just the prose.",
  ];
  if (body.singlish === true) {
    lines.push("Note: the consultant has Singlish ON - call out any local SG flavour you notice.");
  }
  return lines.join("\n");
}

export function voiceSummaryUserPrompt(body: RequestBody): string {
  const posts = (body.posts ?? []).filter((p) => typeof p === "string" && p.trim().length > 0);
  const numbered = posts
    .map((p, i) => `--- Past post ${i + 1} ---\n${p.trim()}`)
    .join("\n\n");
  return `Here are ${professionOf(body.profession) ? "their" : "the consultant's"} past posts. Distil their voice.\n\n${numbered}`;
}

export function hashtagsSystemPrompt(body: RequestBody): string {
  const p = professionOf(body.profession);
  if (p) return generalHashtagsPrompt(p);
  const lines = [
    "You generate hashtag suggestions for an AIA financial consultant in Singapore.",
    "Return strict JSON of the form: {\"hashtags\": [\"...\", \"...\"]} with 5-8 entries.",
    "Rules:",
    "- Do NOT include the # prefix; just the word(s).",
    "- Mix 1-2 broad tags + 3-5 niche/SG-relevant tags (e.g. sgfinance, cpfsg, sgwealth, sgmoney).",
    "- Match the platform tone: LinkedIn = professional. Instagram = visual. Facebook = sparse. TikTok = trend-aware.",
    "- No spammy unrelated tags. No competitor brand tags. No #ad #sponsored unless marked.",
    "- Camel-case multi-word tags (financialFreedom).",
    "- Output ONLY the JSON. No markdown fences.",
  ];
  return lines.join("\n");
}

export function hashtagsUserPrompt(body: RequestBody): string {
  return [
    `Platform: ${body.platform ?? "linkedin"}`,
    `Pillar: ${body.pillar ?? "topic"} - ${body.pillarDetail ?? ""}`,
    `Audience: ${body.audience ?? "general"}`,
    "",
    "Draft:",
    body.draft ?? "",
  ].join("\n");
}

export function imagePromptSystemPrompt(body: RequestBody): string {
  if (professionOf(body.profession)) return generalImagePrompt();
  return [
    "You write a 1-2 line image-generation prompt that the consultant can paste into Canva, Midjourney, or kie.ai.",
    "Return strict JSON: {\"prompt\": \"...\"}.",
    "Rules:",
    "- 1-2 lines maximum. No quotes inside the prompt itself.",
    "- Describe a clean, modern, brand-safe SG-relevant scene.",
    "- No real people's faces, no logos, no text overlays unless they are short and obviously fake numbers.",
    "- Lean editorial / lifestyle / minimal-graphic, not stock-cheesy.",
    "- Output ONLY the JSON. No markdown fences.",
  ].join("\n");
}

export function imagePromptUserPrompt(body: RequestBody): string {
  return [
    `Platform: ${body.platform ?? "linkedin"}`,
    `Pillar: ${body.pillar ?? "topic"} - ${body.pillarDetail ?? ""}`,
    "",
    "Draft:",
    body.draft ?? "",
  ].join("\n");
}

// ---- Answer a question in a community (/generate/answer; Starter Story, 28 Oct 2026) ------------------------------
// A reply the user posts themselves on Reddit, in a Facebook or Telegram group, or on Quora. Its own base lines, so
// the post writer's mandatory CTA, hashtags and platform voice never reach it: the whole answer in the text, their work
// named only when the question asks for it. An adviser's body keeps the general-information rule; everyone keeps
// the honesty line.

const ANSWER_OPENINGS = [
  "Open with the direct answer in the first sentence.",
  "Open with the mistake most people make here, then give the answer.",
  "Open with a short, plain example of the situation (never an invented client), then give the answer.",
];

export function answerSystemPrompt(body: RequestBody, variantIndex: number): string {
  const p = professionOf(body.profession);
  const guide = body.answerShape === "guide";
  const rule = body.linkRule?.trim();
  const lines = [
    `You draft ${guide ? "one long guide post" : "one reply"} for ${p ? aOrAn(p) : "a financial consultant in Singapore"} to post themselves in ${body.community?.trim() || "an online community"}.`,
    "Rules:",
    "- The question is below. Answer it fully inside the text, so a reader gets the whole answer without clicking anything.",
    "- Sound like one person helping another: first person, plain words, no marketing voice, no hashtags, no emoji, no call to action.",
    "- Do not pitch. Mention what they do or run only if the question asks for a tool, a service or a person, and then in one plain sentence that says it is theirs.",
    `- Links: ${rule ? `follow the community's rule: ${rule}.` : "include none unless the question asks for one and the text below gives it."} Never more than one link.`,
    `- ${HONEST_LINE}`,
    p ? "" : "- Keep to general information: never recommend a specific product, insurer or fund, never state or promise a return, and say plainly when the answer depends on the person's own situation.",
    "- If a good answer needs a fact you do not have, say what you would need to know instead of guessing.",
    "",
    guide
      ? "## Shape: a long self-post of 500-1,200 words. First line: TITLE: and a plain, specific title. Then short sections with plain headings a reader can skim, the full method inside. Any mention of what they run goes at the very end, in one sentence."
      : "## Shape: a reply of 60-220 words in short paragraphs: the answer, then the why, then one practical next step.",
    "",
    "## The question, and anything they added",
    body.ideaContext?.trim() ?? "",
  ];
  if (body.voiceSummary?.trim()) lines.push("", "## Voice profile (match this person's tone)", body.voiceSummary.trim());
  lines.push("", `## ${ANSWER_OPENINGS[variantIndex % ANSWER_OPENINGS.length]}`, "", "Output only the text, ready to paste. No preamble.");
  return lines.filter(Boolean).join("\n");
}

// ---- A video sales letter (/generate/vsl, 29 Oct 2026) ---------------------------------------------------------
// The owner's answers to the hormozi-vsl skill's intake (~/.claude/skills/hormozi-vsl, section 2) edited into spoken
// lines in its order: promise, pain, proof, the plan, the named method, each objection in four moves, one next step.
// It edits their words and never writes proof they did not give: a gap becomes a [Need: ...] line, not a guess.

export const VSL_QUESTIONS = [
  { key: "offer", label: "What you sell, and who it's for", placeholder: "e.g. a 12-week program for new managers who just got their first team" },
  { key: "promise", label: "What people get when you're done", placeholder: "e.g. they run a weekly 1:1 that their team actually looks forward to" },
  { key: "pain", label: "What they say on the first call", placeholder: "What are they stuck on, worried about or embarrassed by? Their words, not yours." },
  { key: "proof", label: "Three results you'd show first", placeholder: "Real ones only: a client like them, what changed, the number or the review in their words." },
  { key: "method", label: "How you do it, step by step", placeholder: "Walk through what you do, in order. What do you call it?" },
  { key: "objections", label: "What stops people buying", placeholder: "3-5 of them. For each: what they think, why it's wrong, what's actually true, and the result that proves it." },
  { key: "next", label: "The one next step", placeholder: "e.g. book a 20-minute call. What happens after they do?" },
] as const;
export type VslKey = (typeof VSL_QUESTIONS)[number]["key"];

/** The answers as ideaContext: one heading per answered question, in the intake's order. */
export function vslBrief(answers: Partial<Record<VslKey, string>>): string {
  return VSL_QUESTIONS.filter((q) => answers[q.key]?.trim())
    .map((q) => `## ${q.label}\n${answers[q.key]!.trim()}`)
    .join("\n\n");
}

/** Version A and B: the skill's first A/B test is the opening (proof first or promise first both work). */
const VSL_OPENINGS = [
  "Open on the promise: the first line says what the viewer gets, to the person it is for.",
  "Open on proof: the first lines give one result from their answers, from someone just like the viewer, then the promise.",
];

export function vslSystemPrompt(body: RequestBody, variantIndex: number): string {
  const p = professionOf(body.profession);
  const lines = [
    `You edit the spoken script of one video sales letter for ${p ? aOrAn(p) : "a financial consultant in Singapore"}, from their own answers below. They will read it to camera or record it as a voice-over.`,
    "Rules:",
    "- Edit their words, do not rewrite them. Cut filler, keep their phrasing, and use only what their answers say.",
    `- ${HONEST_LINE} Every result, number, review and name comes from their answers.`,
    "- When a part needs something their answers do not give (a result, a review, a step, the proof for an objection), write one line in square brackets saying what is needed, like [Need: one result from a client like this, with the number]. Never fill the gap yourself.",
    "- One idea per line and at most 9 words a line, each on its own line. Short sentences and small words, said the way they would say it on a sales call.",
    "- One big idea for the whole video. Every proof and every answer to a worry backs it up.",
    "- A specific moment beats a category: 'the Sunday night you dread Monday', not 'stress'.",
    "- Say who it is for, and who it is not for, when their answers say.",
    "- One call to action: one thing to do, a reason to do it now only if their answers give a real one, and what happens after. No second offer, no discount, and no price unless their answers give one.",
    "- Spoken lines never name the parts of the video ('framework', 'road map', 'part one', 'objection'). Say it as a person would: 'First, how it works. Then the questions everyone asks.'",
    "- No hashtags, no emoji, no famous names or catchphrases.",
    p ? "" : "- Keep to general information: never recommend a specific product, insurer or fund, never state or promise a return, and use no client testimonials or return figures as proof; use their process, credentials and plain facts instead.",
    "",
    "## Shape, in this order. Each part starts with its heading in capitals on its own line; headings are not spoken.",
    "INTRO: the promise (what they get from watching), the pain (where they are now, in their customers' words), proof (up to three results from their answers: 'this one, and this one'), then one spoken line on how the video goes.",
    "HOW IT WORKS: the method by its name, as their own way, step by step.",
    "OBJECTION 1, OBJECTION 2 and on: each thing that stops people buying, in four moves: what they think ('A lot of people think...'), why that is wrong, what is actually true, and the proof.",
    "NEXT STEP: the one action, the reason to do it now, and what happens after they do it.",
    "P.S.: one closing line: a recap, or who this is not for.",
    "",
    "## Length: 750-1,050 spoken words (5-7 minutes at a calm pace) when their answers hold enough, shorter when they hold less. Never pad.",
    "",
    "## Their answers",
    body.ideaContext?.trim() ?? "",
  ];
  if (body.voiceSummary?.trim()) lines.push("", "## Voice profile (match this person's tone)", body.voiceSummary.trim());
  lines.push("", `## ${VSL_OPENINGS[variantIndex % VSL_OPENINGS.length]}`, "", "Output only the script with its headings. No preamble.");
  return lines.filter(Boolean).join("\n");
}

/** A VSL runs about 1,050 words plus headings; everything else fits the post writer's 1,400. */
export const maxTokensFor = (mode: Mode) => (mode === "vsl" ? 3000 : 1400);

export function buildSystemForVariant(
  body: RequestBody,
  mode: Mode,
  variantIndex: number,
): string {
  if (mode === "answer") return answerSystemPrompt(body, variantIndex);
  if (mode === "vsl") return vslSystemPrompt(body, variantIndex);
  if (mode === "hooks") return hooksSystemPrompt(body, variantIndex);
  if (mode === "body") {
    const hook = body.chosenHook?.trim();
    if (!hook) {
      throw new Error("mode 'body' requires chosenHook");
    }
    return bodySystemPrompt(body, variantIndex, hook);
  }
  return postSystemPrompt(body, variantIndex);
}

/**
 * The most each text field may hold, in characters, with at least a quarter to spare over the app's largest real
 * request: the recruit agent's brief carries the whole Brand Brain, every interview answer twice (59,397 characters
 * with each answer at 2,000, src/lib/recruit.test.ts), and a rewrite carries a long draft (src/pages/GeneratePage.test.ts).
 */
export const MAX_CHARS: Partial<Record<keyof RequestBody, number>> = {
  ideaContext: 100_000,
  styleReference: 8_000,
  voiceSummary: 6_000,
  draft: 20_000,
  pillarDetail: 1_000,
  profession: 200,
  chosenHook: 1_000,
  ideaSource: 1_000,
  community: 200,
  linkRule: 1_000,
};
export const MAX_POSTS = 10;
export const MAX_POST_CHARS = 5_000;
/** The whole body as sent: the largest recruit request (about 67,000) with a quarter to spare, and room for JSON's escapes. */
export const MAX_BODY_CHARS = 128_000;
export const TOO_LONG = "That's too long to write from. Shorten it and try again.";
const UNREADABLE = "Couldn't read that request. Reload the page and try again.";
const ALLOWED: Partial<Record<keyof RequestBody, readonly string[]>> = {
  pillar: PILLAR_VALUES,
  format: FORMAT_VALUES,
  platform: PLATFORM_VALUES,
  ctaType: CTA_VALUES,
  audience: AUDIENCE_VALUES,
  answerShape: ANSWER_SHAPES,
};

/** Why the request can't be written from (400), or null. Checked before the user's daily count, so a refusal costs nothing. */
export function requestError(raw: RequestBody): string | null {
  for (const [field, max] of Object.entries(MAX_CHARS)) {
    const v = raw[field as keyof RequestBody];
    if (v === undefined) continue;
    if (typeof v !== "string") return UNREADABLE;
    if (v.length > max!) return TOO_LONG;
  }
  for (const [field, values] of Object.entries(ALLOWED)) {
    const v = raw[field as keyof RequestBody];
    if (v !== undefined && !values!.includes(v as string)) return UNREADABLE;
  }
  if (raw.posts !== undefined) {
    if (!Array.isArray(raw.posts) || raw.posts.some((p) => typeof p !== "string")) return UNREADABLE;
    if (raw.posts.length > MAX_POSTS) return `Send at most ${MAX_POSTS} past posts.`;
    if (raw.posts.some((p) => p.length > MAX_POST_CHARS)) return TOO_LONG;
  }
  const mode: Mode = raw.mode ?? "post";
  if (mode === "answer") return raw.ideaContext?.trim() ? null : "Paste the question to answer.";
  if (mode === "vsl") return raw.ideaContext?.trim() ? null : "Say what you sell first.";
  if (mode === "voice-summary") {
    return (raw.posts ?? []).some((p) => typeof p === "string" && p.trim().length >= 1) ? null : "voice-summary requires at least 1 past post";
  }
  if (mode === "hashtags" || mode === "image-prompt") return raw.draft?.trim() ? null : `${mode} requires a draft`;
  if (!raw.pillar || !raw.format || !raw.platform || !raw.ideaSource || !raw.ctaType) {
    return "Missing required fields: pillar, format, platform, ideaSource, ctaType";
  }
  if (mode === "body" && !raw.chosenHook?.trim()) return "mode 'body' requires chosenHook";
  return null;
}

// ---- Any other work (the brand's "What do you do?", ../_shared/profession.ts) -------------------------------------
// The same brief, modes and output for any profession, worded without CPF, MAS, insurers or Singapore, with the
// honesty everyone keeps. A body with no profession, or an adviser's, never reaches anything below.

const GENERAL_PILLAR_GUIDE: Record<Pillar, string> = {
  interest:
    "Centre on a hobby or passion of theirs (e.g. running, gaming, photography). Open with a personal moment from that interest, then bridge to a point from their work. Humanises them; attracts people who share the interest.",
  identity:
    "Centre on a life-stage or role they share with their audience (e.g. parent of two, fresh grad, career-switcher). Speak in a 'us, not them' voice. People engage because they 'get them'.",
  topic:
    "Centre on one specific area of their work. They become known for THIS topic. Be concrete: real situations, real steps, plain words.",
  market:
    "Centre on a specific group of clients they serve. Prospects in that group self-select. Use language and pain-points that group recognises instantly.",
};

const GENERAL_AUDIENCE_GUIDE: Record<Audience, string> = {
  "young-adult": "Audience: young adults aged 21-27. Fresh grads, early-career, often in a first job. Voice: relatable, peer-to-peer, no jargon, no parent-talk.",
  "working-adult": "Audience: working adults aged 28-40. Mid-career, busy, building something. Voice: peer, practical, specific.",
  parent: "Audience: parents with kids under 16. Voice: empathetic, family-first, no scare tactics.",
  "pre-retiree": "Audience: adults aged 50-62 planning their next chapter. Voice: respectful, concrete, unhurried.",
  general: "Audience: general adults. Don't over-narrow; speak to a broad working/family audience.",
};

const GENERAL_PLATFORM_VOICE: Record<Platform, string> = {
  ...PLATFORM_VOICE,
  instagram:
    "Voice: warm, personal, magazine-feel. Emojis OK but sparing. Visual-first: assume the photo/graphic does heavy lifting. Hashtags: 8-15, mix of broad + niche tags.",
  facebook: "Voice: conversational, family-living-room. No emoji-spam. Shareable angle. Local references welcome. Hashtags: 0-3.",
};

const GENERAL_FORMAT_GUIDE: Record<Format, string> = {
  ...FORMAT_GUIDE,
  "short-video":
    "Output a 30-60 second face-to-camera script. Include: HOOK (first 3 seconds, must stop the scroll), BODY (one tight teaching point with a concrete example), CTA (one ask). Add suggested CAPTION for the video post separately. Burned-in caption suggestions optional.",
};

const GENERAL_CTA_GUIDE: Record<CtaType, string> = {
  ...CTA_GUIDE,
  "save-share": "End with a save/share CTA. Example pattern: 'Save this for the next time you need it' or 'Share with a friend who's stuck on this.'",
  "book-call": "End with a soft 15-min call CTA. Example pattern: 'If you'd like a no-pressure 15-min chat about your own situation, DM me.' Avoid hard pitches.",
  "open-question": "End with an open question that invites comments. Example pattern: 'What's the one question about this you've never had answered? Drop it below.'",
};

const GENERAL_VARIANT_NUDGES = [
  VARIANT_NUDGES[0],
  "Variant tone: lean toward story framing - open with a real moment from their work that the context gives (never an invented one; with none, a situation the reader will recognise), then teach.",
  VARIANT_NUDGES[2],
  "Variant tone: lean toward detail-led framing - open with one concrete detail from the context that reframes the issue, then unpack it.",
  VARIANT_NUDGES[4],
];

const GENERAL_HOOK_NUDGES = [
  HOOK_NUDGES[0],
  HOOK_NUDGES[1],
  "Hook style: a concrete detail that reframes the issue.",
  "Hook style: a situation the reader recognises, told in one line.",
  HOOK_NUDGES[4],
];

function generalBaseLines(body: RequestBody, p: string): string[] {
  const lines = [
    `You are a content drafting assistant for ${aOrAn(p)}.`,
    "You produce one social-media post draft at a time:",
    "- Every post must hit Authority + Social + a soft CTA. The CTA is mandatory.",
    "- Authority = demonstrate competence. Social = demonstrate humanity. CTA = invite interaction.",
    "- Audience starts as a 'Skeptical Stranger'. The post's job is to move them one step toward 'Curious Follower' or 'Trusted Choice'. No hard pitches.",
    "- No political opinions. No religious proselytising. No naming competitors in a disparaging way.",
    "- Concrete > abstract. Use real situations and plain detail. Avoid platitudes.",
    `- ${HONEST_LINE}`,
    "- Their voice should sound human, not corporate. Match the platform.",
    "- Output the draft as ready-to-paste copy. No preamble, no 'Here is your post:'. Just the post. If multiple slides/frames, label them clearly.",
    "",
    `## Audience`,
    GENERAL_AUDIENCE_GUIDE[body.audience ?? "general"] ?? GENERAL_AUDIENCE_GUIDE.general,
    "",
    `## Pillar: ${body.pillar ?? "topic"}`,
    GENERAL_PILLAR_GUIDE[body.pillar ?? "topic"],
    body.pillarDetail ? `Specific pillar detail: ${body.pillarDetail}` : "",
    "",
    `## Idea source: ${body.ideaSource ?? ""}`,
    body.ideaContext
      ? `Context from them: ${body.ideaContext}`
      : "If no context provided, write about a situation common in their work, without inventing facts about them or their clients.",
    "",
    `## Platform: ${body.platform ?? "linkedin"}`,
    GENERAL_PLATFORM_VOICE[body.platform ?? "linkedin"],
    "",
    `## Format: ${body.format ?? "text-post"}`,
    GENERAL_FORMAT_GUIDE[body.format ?? "text-post"],
    "",
    `## CTA style: ${body.ctaType ?? "open-question"}`,
    GENERAL_CTA_GUIDE[body.ctaType ?? "open-question"],
    body.styleReference ? `\n## Style reference (match the structural pattern, don't copy verbatim)\n${body.styleReference}` : "",
  ];
  if (body.voiceSummary && body.voiceSummary.trim().length > 0) {
    lines.push("", "## Voice profile (match this person's tone/structure)", "Their voice profile (match this tone/structure):", body.voiceSummary.trim());
  }
  if (body.singlish === true) {
    lines.push(
      "",
      "## Singlish",
      "Use light Singlish where it lands naturally - 'lah', 'leh', 'can?', 'shiok' - but keep the post readable for everyone. Don't overdo it; aim for 1-3 Singlish moments per post max.",
    );
  }
  return lines;
}

function generalVoiceSummaryPrompt(body: RequestBody): string {
  const lines = [
    "You are a writing-voice analyst. You receive several past social-media posts written by one person.",
    "Distil their voice into TWO short paragraphs.",
    "Paragraph 1: tone and voice traits - formality level, warmth, signature words, recurring phrases, level of vulnerability, how they handle authority vs personal.",
    "Paragraph 2: structural patterns - how they open hooks, paragraph length, line-break habits, list usage, typical post length, how they close / CTA, any repeating frameworks.",
    "Be specific and quotable. Reference 1-2 short patterns verbatim if they recur. No bullet points; flowing prose.",
    "Output ONLY the two paragraphs. No preamble. No headers like 'Paragraph 1'. Just the prose.",
  ];
  if (body.singlish === true) lines.push("Note: they have Singlish ON - call out any local flavour you notice.");
  return lines.join("\n");
}

function generalHashtagsPrompt(p: string): string {
  return [
    `You generate hashtag suggestions for ${aOrAn(p)}.`,
    'Return strict JSON of the form: {"hashtags": ["...", "..."]} with 5-8 entries.',
    "Rules:",
    "- Do NOT include the # prefix; just the word(s).",
    "- Mix 1-2 broad tags + 3-5 niche tags that fit their work and the draft.",
    "- Match the platform tone: LinkedIn = professional. Instagram = visual. Facebook = sparse. TikTok = trend-aware.",
    "- No spammy unrelated tags. No competitor brand tags. No #ad #sponsored unless marked.",
    "- Camel-case multi-word tags (smallBusiness).",
    "- Output ONLY the JSON. No markdown fences.",
  ].join("\n");
}

function generalImagePrompt(): string {
  return [
    "You write a 1-2 line image-generation prompt that they can paste into Canva, Midjourney, or kie.ai.",
    'Return strict JSON: {"prompt": "..."}.',
    "Rules:",
    "- 1-2 lines maximum. No quotes inside the prompt itself.",
    "- Describe a clean, modern, brand-safe scene that fits the draft.",
    "- No real people's faces, no logos, no text overlays unless they are short and obviously fake numbers.",
    "- Lean editorial / lifestyle / minimal-graphic, not stock-cheesy.",
    "- Output ONLY the JSON. No markdown fences.",
  ].join("\n");
}
