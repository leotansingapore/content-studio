// "From Chasing to Chosen": the #TopofMind social recruitment method for AIA FA
// leaders (Benjamin Loh, CSP, workshop of 6 Oct 2026). Source files: the deck
// (v4), the Recruitment Brand Brain (v3) and the 3-prompt Master Prompt, from
// the AIA FA resource folder Leo shared. Wording kept close to the source.

export const CANDIDATE_TYPES: { name: string; line: string }[] = [
  { name: "The retrenched professional", line: "The company restructured. The mortgage didn't." },
  { name: "The ex-banker or RM", line: "Sells the same products. Keeps a fraction of the value." },
  { name: "The property agent", line: "Great at closing. Tired of starting from zero every deal." },
  { name: "The airline or hospitality pro", line: "Served the world. Wants to serve one client properly." },
  { name: "The teacher or civil servant", line: "Trusted by everyone. Paid on a fixed scale." },
  { name: "The new graduate", line: "Degree in hand. Network from zero." },
  { name: "The SME owner", line: "Built a business. Wants one without the overheads." },
  { name: "The advisor from another firm", line: "Already in the industry. Not being led." },
];

export const TRIFECTA = [
  { key: "production", label: "Production", ask: "Will they build?" },
  { key: "affinity", label: "Affinity", ask: "Fun to build with?" },
  { key: "transformation", label: "Transformation", ask: "Whose life changes?" },
] as const;

export type PathwayId = "serve" | "enemy" | "guide";

export const PATHWAYS: { id: PathwayId; label: string; line: string; formula: string }[] = [
  {
    id: "serve",
    label: "Serve who you once were",
    line: "The road you walked is your qualification. Recruit the person you used to be.",
    formula: "I help [the person I used to be] go from [before] to [after].",
  },
  {
    id: "enemy",
    label: "Name the enemy",
    line: "Stand against a system that fails people. Never a person, never a firm.",
    formula: "The leader against [enemy], for [candidate].",
  },
  {
    id: "guide",
    label: "Be the guide",
    line: "The candidate is the hero. You show them the way from where they are to where they want to be.",
    formula: "I guide [candidate] from [before] to [after].",
  },
];

export const SEND_TEN_SCRIPT =
  "Hi [name]! I'm working on a content series about career crossroads for [your ONE candidate], speaking to 10 people with real stories. I've always found yours interesting. Could I borrow 20 minutes, purely to hear your story, no business talk? This week or next?";

export const WHO_TO_ASK: { group: string; why: string }[] = [
  { group: "Your Trifecta names", why: "The people you scored first" },
  { group: "Newest team joiners", why: "They know people just like them" },
  { group: "Clients who fit", why: "They already trust you" },
  { group: "Former colleagues", why: "They've seen how you work" },
  { group: "Community and alumni", why: "Shared ground, easy to open" },
  { group: "Warm followers", why: "People who already engage with you" },
];
export const WHO_NOT = "Not: other leaders, family, polite-only friends.";

export const FIVE_QUESTIONS = [
  "Where are you in your career now, and where did you expect to be by now?",
  "What's the ceiling you can feel but haven't been able to name?",
  "What have you already tried to break through it?",
  "What would have to be true for you to make a real change this year?",
  "Who else is quietly feeling the same, that I should be talking to?",
];
export const REFERRAL_ASK =
  "Today helped me a lot, thank you. Know 2 to 3 people in a similar spot open to a chat like this? Introduce me?";

export const STORY_STARTERS = [
  { q: "The recruit I'll never forget", hint: "Who were they, and what did they become?" },
  { q: "The moment I almost quit", hint: "What happened, and why didn't I?" },
  { q: "Why I chose this career", hint: "The moment it became personal." },
];

export type StarlKey = "hook" | "s" | "t" | "a" | "r" | "l";
export const STARL: { key: StarlKey; label: string; time: string; say: string }[] = [
  { key: "hook", label: "Hook", time: "0-3s", say: "Their pain, in your candidate's words. A question or a bold line." },
  { key: "s", label: "S - Situation", time: "3-12s", say: "Where you were: the job, a detail they'll recognise." },
  { key: "t", label: "T - Challenge", time: "12-20s", say: "The moment it got real, and how it felt. This is where the pull is." },
  { key: "a", label: "A - Actions", time: "20-30s", say: "The decision, and the hard first months." },
  { key: "r", label: "R - Results", time: "30-38s", say: "Where you are now: time, team, meaning. No income figures." },
  { key: "l", label: "L - Lesson + ask", time: "38-45s", say: "One line to carry, then: \"Where are you in your career right now? Tell me below.\"" },
];
/** 45 seconds of speech is about 110 words. */
export const STORY_TARGET_WORDS = 110;

export const FOUR_FIXES = [
  "Pain first: never open with \"Hi, I'm X from AIA FA.\"",
  "Eyes on the lens, energy up 20%.",
  "One idea only. Save the second point for video #2.",
  "Land the ask, then stop. Pause. Smile. End the video.",
];

export const CAPCUT_STEPS = [
  "Film vertical, eye level, face lit",
  "Import into CapCut (free)",
  "Auto-captions on, big and readable",
  "Text hook in the first 3 seconds",
  "Export 9:16, then post",
];

export const COMPLIANCE_RULES = [
  "No income figures, ranges or projections. Not in posts, not in writing.",
  "No guarantees about success, promotion or qualification.",
  "No product names, no returns.",
  "Never name or criticise another firm or person. Never share client details.",
  "Soft asks only. Invite a chat; never \"DM me to join my team\".",
  "Follow AIA FA's own social media guidelines. If in doubt, leave it out.",
];

export const REPLY_ANSWERS: { q: string; a: string }[] = [
  {
    q: "Is this sales?",
    a: "Part of it is. Most of it is advising people and building a team. Can I show you what a normal week looks like?",
  },
  {
    q: "What if I can't make it?",
    a: "Fair question. Let me walk you through the first 90 days and the support you'd get. Then you decide.",
  },
  {
    q: "How much can I earn?",
    a: "It depends on what you build, so I won't promise a number. Let's go through how it works, face to face.",
  },
];

export const DM_RULES: { rule: string; example: string }[] = [
  { rule: "Keep it short", example: "A few quick lines, not one big block." },
  { rule: "Show you're listening", example: "\"That ceiling you mentioned, tell me more...\"" },
  { rule: "Name a real person, if true", example: "\"Someone on my team sat where you are.\"" },
  { rule: "Be honestly unsure", example: "\"Not sure yet if this fits you. A few questions?\"" },
  { rule: "Match their energy", example: "Long reply = invested; one word = not." },
  { rule: "Ask before the invite", example: "Offer two times for coffee, then confirm." },
];

export const SPRINT: { id: string; when: string; task: string }[] = [
  { id: "d1", when: "Day 1", task: "Publish your first scheduled post" },
  { id: "d2", when: "Day 2-3", task: "Finish your 10 conversations, ask for referrals" },
  { id: "d4", when: "Day 4-5", task: "Follow up every reply, book the coffees" },
  { id: "d6", when: "Day 6-7", task: "Film video #2, then log your 3 numbers" },
];

export const SELF_CHECK = [
  { id: "candidate", line: "I have ONE crystal-clear ideal candidate", not: "not \"anyone who wants a career change\"" },
  { id: "story", line: "My story makes them think \"that's me\"", not: "not just my titles and awards" },
  { id: "conversations", line: "My content starts career conversations", not: "replies and DMs, not just likes" },
];

// Prompt 1: the interview. Each question also seeds post angles (see recruit.ts).
export const INTERVIEW: { id: string; q: string }[] = [
  { id: "q1", q: "Describe the person you most want in your team. What does their life look like right now, and what are they quietly unhappy about?" },
  { id: "q2", q: "Set aside who would produce well. Who do you actually enjoy building with, day in and day out?" },
  { id: "q3", q: "Why are you the most relevant leader for that person? Not the nicest, not the most experienced. The most relevant." },
  { id: "q4", q: "What do they believe about this career that is wrong or out of date?" },
  { id: "q5", q: "What is happening in Singapore right now that makes this the moment for the right person to take this seriously?" },
  { id: "q6", q: "When someone considers joining you, what do they ask you, and what are they actually afraid of?" },
  { id: "q7", q: "For someone who joined and made it work: what surprised them, and what did they say afterwards?" },
  { id: "q8", q: "Someone joins you on Monday. What do you put them through in their first 90 days?" },
  { id: "q9", q: "What is the hardest part of this career, the part you tell people upfront?" },
  { id: "q10", q: "What is your own story: where were you, what changed, and where are you now? Then give 3 facts you are proud of: team milestones, people you have grown. No income figures." },
];

export type FormulaId =
  | "authority"
  | "myth"
  | "career-change"
  | "framework"
  | "room"
  | "hard-truth"
  | "personal";

export const FORMULAS: { id: FormulaId; n: number; label: string; how: string }[] = [
  { id: "authority", n: 1, label: "Authority Share", how: "Say what I know from experience, break it down, close on why it matters now." },
  { id: "myth", n: 2, label: "Myth Bust", how: "State the common belief, show the truth, back it with my experience, give them a new way to see it." },
  { id: "career-change", n: 3, label: "Career Change Story", how: "Introduce the person (anonymised), what they faced, what changed, where they are now, what it means for the reader." },
  { id: "framework", n: 4, label: "Framework Drop", how: "Name the framework, teach it step by step, show why it works with a real example." },
  { id: "room", n: 5, label: "From the Room to the Feed", how: "Describe the moment (a career talk, an event, a conversation), what happened, what the room reacted to, what it means for the reader." },
  { id: "hard-truth", n: 6, label: "The Hard Truth", how: "Name what people are avoiding, show the real cost, back it with what I have seen, give one first step." },
  { id: "personal", n: 7, label: "Personal Story, Universal Lesson", how: "Tell my own story, what it taught me, then hold the mirror up to the reader." },
];

export type RecruitStage = "tofu" | "mofu" | "bofu";

export const STAGES: {
  id: RecruitStage;
  label: string;
  share: number;
  job: string;
  goal: string;
  ask: string;
  formulas: string;
}[] = [
  {
    id: "tofu",
    label: "Get found",
    share: 50,
    job: "Career point of view, useful posts, relatable story hooks.",
    goal: "Reach and follows",
    ask: "No ask, or \"save this\".",
    formulas: "Use the 7 formulas.",
  },
  {
    id: "mofu",
    label: "Build trust",
    share: 30,
    job: "Day in the life, myth-busting the career, recruit stories, team culture.",
    goal: "Trust and DMs",
    ask: "End with a question that invites a reply.",
    formulas:
      "Framework Drop; Myth, Reality, Proof, Reframe; Things I Wish I Knew at [Age]; The Comparison: Two Paths; The Breakdown; Hot Take + Proof + Perspective; Story, Lesson, Mirror.",
  },
  {
    id: "bofu",
    label: "Invite",
    share: 20,
    job: "Soft asks, results and proof.",
    goal: "Conversations",
    ask: "End with a soft invite: an exploratory chat, criteria applies.",
    formulas:
      "The Insider Tip; Before/After Arc (a recruit's path, no income figures); Myth vs. Reality; Framework Reveal; The Hard Truth; Social Proof Stack; The Decision Guide.",
  },
];

export type RecruitFormat = "ig-carousel" | "ig-reel" | "li-text" | "li-document";

export const RECRUIT_FORMATS: {
  id: RecruitFormat;
  label: string;
  platform: "instagram" | "linkedin";
  format: "carousel" | "short-video" | "text-post";
  rule: string;
}[] = [
  {
    id: "ig-carousel",
    label: "Instagram carousel",
    platform: "instagram",
    format: "carousel",
    rule: "CAROUSEL: slide 1 is the hook. One point per slide, 2 short lines maximum. The last slide is the summary or the soft ask.",
  },
  {
    id: "ig-reel",
    label: "Instagram Reel script",
    platform: "instagram",
    format: "short-video",
    rule: "REEL SCRIPT: the hook lands in the first 3 seconds. Short spoken lines, spoken not written. Mark [on-screen text]. End on a line worth replaying.",
  },
  {
    id: "li-text",
    label: "LinkedIn text post",
    platform: "linkedin",
    format: "text-post",
    rule: "TEXT POST: the first 2 lines stop the scroll, no warm-up. Paragraphs of 1 to 2 sentences. End with a question. 3 hashtags maximum.",
  },
  {
    id: "li-document",
    label: "LinkedIn document post",
    platform: "linkedin",
    format: "carousel",
    rule: "LINKEDIN DOCUMENT POST: page 1 is the hook. One point per page, short lines. The last page is the summary or the soft ask.",
  },
];

/** The working knowledge from Prompt 2: how the agent thinks, sounds and stays inside the rules. */
export const AGENT_METHOD = `WHO YOU ARE
You are my personal content and writing agent. You write in my voice, for the people I want to recruit. You represent one person: a team leader at AIA Financial Advisers in Singapore building a recruitment brand on Instagram and LinkedIn.

VOICE
Read my RAW ANSWERS before you write. That is how I actually talk. Do not smooth my language into standard business English. Plain words, short lines, one idea per post. Always write to one person, never to everyone.

WHAT TO WRITE, IN THIS ORDER
1. Authority: show I have done it, not that I talk about it. Every piece should feel earned.
2. Value first: teach something useful about the career, about growth, about choosing work.
3. Perspective shift: challenge what people assume about this industry, about success, about changing paths.
4. Story-driven proof: real examples from my team and my own path.
5. Pull, not push: credible enough that the right person asks how to join. Never recruit directly in a post.

RED LINES (COMPLIANCE), NEVER
- Never promise income or imply guaranteed success. No income figures, ranges or projections. No get-rich-quick or overnight-success language.
- No product names, no returns, no financial advice in public content.
- Never name or criticise another firm or person. Never share client details.
- Soft asks only. Invite a chat. Never write "DM me to join my team".
- Never make a claim without a real story or a real number from my Context Document. If you need a fact you don't have, leave a [bracketed gap] for me to fill. Never invent one.
- Never use fear or guilt. Lead with clarity and empathy.
- Never preach or sound like a motivational poster. Share scars, not open wounds.
- No AI-sounding words: journey, unlock, unleash, elevate, seamless, leverage, delve, dive, discover, navigate, tailored, robust, testament, game-changer. No em dashes.

HOW YOU WORK, EVERY TIME
Get clear on the format, the platform and the purpose. Re-read my Context Document. Match my voice: would I say this at a career talk? Pick one story, one insight or one result. Write the draft. Check it against the red lines. Fit the platform. Authority test: is there a real story, result or insight behind it? Close with a thought, a soft ask, or a question that invites a reply.

PLATFORMS
Instagram: reach and closeness. Real, warm, a little unpolished. Aim for saves, shares and DMs.
LinkedIn: authority and inbound. Professional but human. The first 2 lines do all the work. Aim for comments, profile visits and inbound DMs.
Never paste the same post into both. Same insight, different format and energy.

GOOD OUTPUT
It reads like me talking. It is specific: real examples, real numbers, real moments. Someone stuck in a job they don't enjoy would send it to a friend and say "you need to read this".`;

export const RHYTHM_SAMPLE = `"Most people think this job is about selling insurance.

Here is what I have seen.

The people who last are not the best salespeople.

They are the ones who can sit in a hard conversation and not flinch."`;

/** #TOM batches 3 and 4, AIA Singapore: 27 leaders, weeks ending 14 Aug to 25 Sep 2026. */
export const COHORT_BENCHMARK = {
  leaders: 27,
  posts: 700,
  conversations: 81,
  interviews: 32,
  exams: 24,
  agentCodes: 3,
};
