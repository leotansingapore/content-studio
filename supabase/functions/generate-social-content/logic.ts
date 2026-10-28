// The post writer's prompts (Write, Batch, Your voice), moved out of index.ts unchanged so vitest covers them.
// No Deno or npm imports.

export type Pillar = "interest" | "identity" | "topic" | "market";
export type Format = "carousel" | "short-video" | "text-post" | "story";
export type Platform = "linkedin" | "instagram" | "facebook" | "tiktok";
export type CtaType = "dm-keyword" | "comment-keyword" | "save-share" | "book-call" | "open-question";
export type Audience = "young-adult" | "working-adult" | "parent" | "pre-retiree" | "general";
export type Mode = "hooks" | "body" | "post" | "voice-summary" | "hashtags" | "image-prompt";

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
  const nudge = VARIANT_NUDGES[variantIndex % VARIANT_NUDGES.length];
  lines.push("", `## ${nudge}`, "", "Now produce the draft.");
  return lines.filter(Boolean).join("\n");
}

export function hooksSystemPrompt(body: RequestBody, variantIndex: number): string {
  const lines = basePromptLines(body);
  const nudge = HOOK_NUDGES[variantIndex % HOOK_NUDGES.length];
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
  const nudge = VARIANT_NUDGES[variantIndex % VARIANT_NUDGES.length];
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
  if (mode === "hooks") {
    return `Produce one ${body.platform} hook for a ${body.format}, following the system instructions.`;
  }
  return `Draft my ${body.platform} ${body.format} now, following the system instructions.`;
}

export function voiceSummarySystemPrompt(body: RequestBody): string {
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
  return `Here are the consultant's past posts. Distil their voice.\n\n${numbered}`;
}

export function hashtagsSystemPrompt(body: RequestBody): string {
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

export function imagePromptSystemPrompt(_body: RequestBody): string {
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

export function buildSystemForVariant(
  body: RequestBody,
  mode: Mode,
  variantIndex: number,
): string {
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

/** The most each text field may hold, in characters: about twice what the app sends at its largest (a long rewrite carries the draft, brand rules and memory). */
export const MAX_CHARS: Partial<Record<keyof RequestBody, number>> = {
  ideaContext: 20_000,
  styleReference: 8_000,
  voiceSummary: 6_000,
  draft: 10_000,
  pillarDetail: 1_000,
  chosenHook: 1_000,
  ideaSource: 1_000,
};
export const MAX_POSTS = 10;
export const MAX_POST_CHARS = 5_000;
const TOO_LONG = "That's too long to write from. Shorten it and try again.";

/** Why the request can't be written from (400), or null. Checked before the user's daily count, so a refusal costs nothing. */
export function requestError(raw: RequestBody): string | null {
  for (const [field, max] of Object.entries(MAX_CHARS)) {
    const v = raw[field as keyof RequestBody];
    if (typeof v === "string" && v.length > max!) return TOO_LONG;
  }
  if (Array.isArray(raw.posts)) {
    if (raw.posts.length > MAX_POSTS) return `Send at most ${MAX_POSTS} past posts.`;
    if (raw.posts.some((p) => typeof p === "string" && p.length > MAX_POST_CHARS)) return TOO_LONG;
  }
  const mode: Mode = raw.mode ?? "post";
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
