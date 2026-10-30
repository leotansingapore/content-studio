// marketingNorthStar - the app marketing plan, rendered at /marketing-north-star (Leo's sign-ins only). Leo,
// 2026-10-26: "I really want to make this app marketing work". Built from four videos he sent (Superwall x
// Kenyon of Sideshift, Hector Serrano on Wispr Flow's ads, Oren John's marketing course, Angus Sewell's creator
// stack) and an inventory of every app, channel and job we run. The full plan is
// ~/Documents/App Growth Playbook/03-strategy-and-workflow.md on Leo's Mac.
//
// This file ships in a public JS chunk and the repo is public: outcomes and sources only. Amounts owed, account
// ids, customer counts and compliance status live in ~/Documents/App Growth Playbook/private-notes.md.
//
// Keep it current: when a card's work is done, flip its `status` and `ours` line in the same commit. Ids are URL
// anchors (/marketing-north-star#<id>) and spec names (docs/marketing-north-star/items/<id>.md); never rename one.

export type MkStatus = "done" | "started" | "todo";

export type MkArea = "leaks" | "loop" | "position" | "faces" | "creators" | "scale";

export type MkApp = "all" | "finternship" | "at" | "sb" | "cmfas";

export type MkOwner = "Leo" | "Claude" | "Leo + Claude" | "VA";

export interface MkItem {
  id: string;
  area: MkArea;
  title: string;
  status: MkStatus;
  /** Build order, see MK_PHASES. */
  phase: number;
  app: MkApp;
  owner: MkOwner;
  /** Why: who in the videos says it, with the second it is said. */
  why: string;
  /** What we have today, and where it lives. */
  ours: string;
  /** What to do, specific enough to start without asking. */
  build: string;
  /** The one call only Leo can make for this card, if any. */
  question?: string;
}

export interface MkAsk {
  id: string;
  date: string;
  /** Leo's words. */
  text: string;
  short: string;
  items: string[];
}

export const MK_STATUS_ORDER: MkStatus[] = ["todo", "started", "done"];

export const MK_AREA_ORDER: MkArea[] = ["leaks", "loop", "position", "faces", "creators", "scale"];

export const MK_AREAS: Record<MkArea, { label: string; hint: string }> = {
  leaks: { label: "Stop the leaks", hint: "Things that would waste money on any app until they are fixed." },
  loop: { label: "The weekly loop", hint: "Seeing what won last week, so the next week copies it." },
  position: { label: "Positioning", hint: "One sentence per app that every ad, post and page comes back to." },
  faces: { label: "Leo on camera", hint: "The founder as the face across the adviser apps." },
  creators: { label: "Creators", hint: "Real people who post for an app that has no page of its own yet." },
  scale: { label: "Scale what won", hint: "More creators and less of Leo's time, once the pilot works." },
};

export const MK_APPS: Record<MkApp, string> = {
  all: "All apps",
  finternship: "FINternship",
  at: "ActivityTracker",
  sb: "SearchBlueprint",
  cmfas: "CMFAS Prep",
};

/** Each app's own marketing north star, in its own repo (Leo, 26 Oct: "for each repo we will use /marketing-north-star").
 *  Flip `live` once the page is deployed. */
export const MK_APP_PAGES: { app: Exclude<MkApp, "all">; label: string; url: string; live: boolean; note: string }[] = [
  { app: "finternship", label: "FINternship and MoneyBees", url: "https://themoneybees.co/marketing-north-star", live: true, note: "The 30-day creator pilot and the career funnel." },
  { app: "at", label: "ActivityTracker", url: "https://activity-tracker.io/marketing-north-star", live: true, note: "Customer stories, a pack to forward to leaders, customer creators, ads once the account is back." },
  { app: "sb", label: "SearchBlueprint", url: "https://searchblueprint.io/marketing-north-star", live: true, note: "Trials into paid first, then creators abroad and newsletters." },
];

export const MK_THESIS: string[] = [
  "This is the hub. Each app's own marketing lives on its own /marketing-north-star: FINternship and MoneyBees (where the 30-day creator pilot runs), ActivityTracker and SearchBlueprint. What sits here is shared by all of them: the leaks that waste money anywhere, the weekly loop that sees what won, Leo on camera, and creator operations once the pilot pays.",
  "We publish a lot without anyone touching it: about forty scheduled jobs write, post and report. All four videos Leo sent, and the StartStory teardown, say reach now comes from real people on camera plus a weekly loop that turns organic winners into ads. Today we have neither.",
  "So the order is: stop the leaks, make the loop able to see, put Leo on camera, run the FINternship pilot on its own page, then scale what won here.",
];

export const MK_PRINCIPLES: string[] = [
  "Real faces before AI faces. AI avatar videos stay out of the ad sets that test creators.",
  "A few coached creators beat many. Start with five, grow 5 to 10 to 20 to 40.",
  "Briefs give hooks and reference videos. A new creator gets a draft built from their own best posts; an experienced one gets no script.",
  "Every creator video is approved before it posts, with a compliance line for advisers.",
  "Jev decides (which post won, which comment shows intent, which creator fits); a language model writes the words.",
  "Pay creators on time, every time. A program that pays late loses every creator after it.",
  "Nothing sends a cold DM by automation, and nobody gets chased more than once.",
];

export const MK_PHASES: { n: number; title: string; goal: string }[] = [
  { n: 1, title: "Stop the leaks", goal: "Week 1: nothing we spend later is wasted on an unlicensed voice, an account we cannot promote or mail that bounces." },
  { n: 2, title: "The loop can see", goal: "Every Monday we know which posts won, why, and which creator or link brought the call." },
  { n: 3, title: "Leo on camera", goal: "Three founder reels a week, measured against each other every month." },
  { n: 4, title: "CMFAS Prep", goal: "Organic pass stories that feed CMFAS Prep and FINternship; nothing paid until the price works." },
  { n: 5, title: "Scale what won", goal: "More creators and less of Leo's time, once the FINternship pilot pays." },
];

export const MK_ITEMS: MkItem[] = [
  // Order inside each phase: Jev's score on 'more booked calls or paying customers within 60 days', with
  // dependencies first where a fact overrides the score (docs/marketing-north-star/README.md).
  {
    id: "leaks-voice-licence",
    area: "leaks",
    title: "Every AI voice in an ad is licensed for commercial use",
    status: "todo",
    phase: 1,
    app: "all",
    owner: "Leo",
    why: "Paid ads are commercial use. A free voice plan carries no commercial licence.",
    ours: "Voiced reels go out through Higgsfield text-to-speech, whose terms are unchecked. Content Studio's editor voiceovers use the studio ElevenLabs account, which was on its free plan on 10 Oct.",
    build: "Move the voice account to a plan with commercial rights before any AI voiceover runs as a paid ad, or keep paid ads to real voices.",
    question: "Pay for the voice plan, or keep ads to real voices?",
  },
  {
    id: "leaks-leo-ig-linked",
    area: "leaks",
    title: "Leo's Instagram can be scheduled and promoted as ads",
    status: "todo",
    phase: 1,
    app: "all",
    owner: "Leo",
    why: "Oren (1:41:47): whitelisting runs a person's post as an ad from their own handle; some brands run 30 to 50% of spend that way.",
    ours: "@leotan_js is not linked to Business Manager, so it cannot be scheduled through Zernio or promoted.",
    build: "Leo switches the account to professional if needed, links it to Business Manager, and connects it in Zernio.",
  },
  {
    id: "leaks-cmfas-mail",
    area: "leaks",
    title: "Mail to CMFAS Prep support reaches someone",
    status: "todo",
    phase: 1,
    app: "cmfas",
    owner: "Leo + Claude",
    why: "Oren (1:50:05): speed to touch decides close rates, and a lead whose mail bounces is never touched.",
    ours: "Neither the CMFAS Prep domain nor its mail subdomain has MX records, so replies to every buyer email bounce, Pass Guarantee claims included.",
    build: "Add MX records for the domain's mail host, set buyer emails' reply-to to the support address, send a test from an outside address, and confirm it arrives.",
  },
  {
    id: "leaks-funnel-teardown",
    area: "leaks",
    title: "Each app's funnel is set beside three to five competitors' public funnels, and its weakest stage fixed",
    status: "todo",
    phase: 1,
    app: "all",
    owner: "Claude",
    why: "Angus Sewell (reel Deh4GM9tIO-, 0:05 to 0:40): start from a programme's testimonials, find each person's socials and their ads in the Meta Ad Library, have research agents walk every public funnel step, then rework the funnel from the best parts; most of the ones he walked were quiz funnels.",
    ours: "Leo's 27 Oct reel note proposed a read-only teardown for FINternship: /apply ends on 'we respond within four weeks' and /masterclass is a bare register form. The competitor-intel skill already pulls landing pages, socials and Meta Ad Library ads. postmosis.com/vault/funnel-hacking (30 Oct) writes up the read-only method. No teardown has been run.",
    build: "Per app, FINternship first: pick three to five competing programmes, read their active Meta ads, walk each public step on a phone (ad, landing page, free training or quiz, application, the screen after submit), stop at every form, and set each stage beside ours in one table. Name our weakest stage and propose one fix with its copy. Never submit a form or message anyone as a prospect.",
  },
  {
    id: "loop-monday-readback",
    area: "loop",
    title: "Every Monday, last week's winners arrive on Telegram",
    status: "done",
    phase: 2,
    app: "all",
    owner: "Claude",
    why: "Kenyon (50:05): promote a video when it gets 5 to 10x the creator's usual views, 8 to 10% engagement or more, and comments asking about the product. Oren (1:24:16): creative strategy, buy, read results, repeat every week.",
    ours: "Live since 27 Oct 2026: ~/.local/bin/marketing-readback, run by launchd com.leo.marketing-readback on Mondays at 08:00 SGT. It reads every post of the last 7 days on @the_moneybees, @finternshipofficial and @activity_tracker_io from the Graph API, compares its views with the account's median over its previous 30 posts, has Jev (jev-1.13.0, a keyword list when Jev is down) judge each comment for career, intake or product intent, and reads cost per lead per campaign the way moneybees-ads-report does. Code applies the rules: promote at 5x median views, or 8% engagement with an intent comment; test next is the best post's format; kill is for paid campaigns only. One message, action first, goes to the ads report's Telegram chat with the days left to the 16 Nov close. Not yet: cost per lead by ad set, booked calls by creator link (loop-creator-links) and the shared post store (loop-pattern-db).",
    build: "A launchd job, Mondays 08:00: pull last week's posts per account (Zernio analytics or Apify), compare each with the account's median, have Jev score each post's comments for buying or career intent, join cost per lead by ad set and booked calls by creator link, and post a promote, kill and test-next card to Telegram.",
  },
  {
    id: "loop-brief-template",
    area: "loop",
    title: "A one-page creator brief anyone can fill in",
    status: "todo",
    phase: 2,
    app: "all",
    owner: "Claude",
    why: "Oren (1:37:15): the modular brief. Kenyon (15:08): reference videos, hook ideas and where the CTA goes, never a word-for-word script.",
    ours: "No brief template exists.",
    build: "A template with: the two messages that matter, who it is for, the content type, three hooks picked by hook-check, two reference videos, a rough outline, an organic ending and an ad ending, and the compliance line.",
  },
  {
    id: "loop-creator-links",
    area: "loop",
    title: "Every booked call shows which creator or post it came from",
    status: "todo",
    phase: 2,
    app: "all",
    owner: "Claude",
    why: "Kenyon (38:41): attribution is what organic creator programs lack. Oren (1:43:17): measurable marketing is the marketing that gets budget.",
    ours: "Content Studio tracked links count taps per link, and contact_submissions has UTM columns nothing fills. The WhatsApp agents book calls but do not store the link a lead arrived from.",
    build: "One UTM link per creator per channel, with the post in utm_campaign. The booking agent fills the existing UTM columns on the lead, and the Monday read-back counts booked calls per creator. A new column would be a schema change for Leo.",
  },
  {
    id: "loop-monthly-review",
    area: "loop",
    title: "Each month the weakest format is swapped out",
    status: "todo",
    phase: 2,
    app: "all",
    owner: "Leo + Claude",
    why: "Oren (58:26): three to five formats as pillars, compared monthly; swap one after two bad months.",
    ours: "ig_week.py compares MoneyBees post types week by week; nothing compares formats month on month.",
    build: "On the first Monday of each month, the read-back adds a format table per account (views, saves, shares, new followers) and flags any format that lost two months running.",
  },
  {
    id: "position-statements",
    area: "position",
    title: "Every app's brief opens with one positioning sentence",
    status: "todo",
    phase: 2,
    app: "all",
    owner: "Leo + Claude",
    why: "Oren (25:45): one statement, 'For [target] who [need], [brand] is the [category] that [benefit]. Unlike [alternative], we [differentiator].'",
    ours: "Product-marketing briefs exist for ActivityTracker, SearchBlueprint, Advisor OS, CMFAS Prep, MoneyBees and Catalyst, and none opens with this sentence. FINternship and Content Studio have no brief.",
    build: "Write the sentence for each app through the copy pipeline (competitors first, hook-check, aicheck), add it at the top of each brief, and get Leo's yes.",
  },
  {
    id: "loop-pattern-db",
    area: "loop",
    title: "Every post we or our creators made is searchable by hook, concept and structure",
    status: "todo",
    phase: 2,
    app: "all",
    owner: "Claude",
    why: "Angus Sewell (0:29): scrape and transcribe every post, store the hook, first three lines, concept, structure and numbers, and write from what worked.",
    ours: "Content Studio's topPosts.json stores breakdowns of peer advisers' top posts, and whisper-cli transcribes locally. Nothing stores ours or our creators' posts with transcripts.",
    build: "One store, shared with the Monday read-back: per post the hook, first three lines, concept, structure, views and engagement, plus retention when a creator shares their Insights.",
  },
  {
    id: "loop-roster",
    area: "loop",
    title: "One base holds every creator, their posts, pay and status",
    status: "todo",
    phase: 2,
    app: "all",
    owner: "Claude",
    why: "Angus Sewell (0:16): track every creator in one base. Kenyon (3:47): creator ops is the first thing to hand to a manager.",
    ours: "No creator roster exists.",
    build: "A Lark Base with creators (handle, niche, status, smart-retainer floor, link), submissions (video, review state, feedback, posted URL) and payouts (month, floor, bonuses, paid date).",
  },
  {
    id: "loop-friday-summary",
    area: "loop",
    title: "Every Friday, one message: wins, next week, blockers, numbers",
    status: "todo",
    phase: 2,
    app: "all",
    owner: "Claude",
    why: "Oren (2:42:35): a weekly note up of wins, priorities, blockers, then the numbers.",
    ours: "Weekly reports exist per app but none pulls the marketing loop together, and the read-back and roster it would read do not exist yet.",
    build: "A Friday Telegram message built from the read-back, the roster and this page's status counts.",
  },
  {
    id: "loop-tiktok-retention",
    area: "loop",
    title: "Each TikTok clip's retention curve is read at 48 hours, and the next cut starts where viewers left",
    status: "todo",
    phase: 2,
    app: "all",
    owner: "Claude",
    why: "Angus Sewell (reel DdB8LT-xC0Y, Leo's 25 Oct note): post ten clips from one recording, wait 48 hours, pull each post's retention curve from TikTok Studio, and re-edit the next batch from the seconds where viewers drop. TikTok, because Instagram shows no retention curve.",
    ours: "TikTok posting runs through Zernio for the ActivityTracker account and ig_week.py reads Instagram reach and saves, but nothing reads a per-second retention curve. The podcast-clips skill cuts clips from one recording. Leo queued a read-only test on 30 Oct (tools/tt_retention.py in moneybees-reels).",
    build: "Build the read-only test first: check whether Zernio's API returns per-post TikTok retention, else one paced Browser Use run with a Profile per week; store dated snapshots for posts over 48 hours old; join each curve to the clip's transcript; report 3-second retention, saves per view and the line spoken at each sharp drop. Leo reads the first table before it goes on a schedule.",
  },
  {
    id: "loop-format-scout",
    area: "loop",
    title: "Each month, the accounts already winning a slideshow format in each app's niche are found and saved",
    status: "todo",
    phase: 2,
    app: "all",
    owner: "Claude",
    why: "Salim (x.com/rsalimx/status/2087180278930313392, 11 Aug 2026, step 2): don't save an account for one hit; save the ones with a wall of hits on one format, and an account with millions of views and nothing to sell is a distribution channel nobody has claimed yet.",
    ours: "On 30 Oct ten accounts from his article were listed with yt-dlp, their top slideshows fetched through tikwm's post API, and each format written up with what Postmosis's slideshow maker covers and misses (~/Documents/Postmosis/copy/_vault/originals/x-salim/account-teardowns.txt). Postmosis's Following page tracks up to 5 accounts. Nothing runs monthly.",
    build: "A monthly scout per niche (money and careers for MoneyBees and FINternship, productivity for ActivityTracker, small-business search for SearchBlueprint, solo professionals for Postmosis): search, keep accounts whose last 30 posts show steady hits on one format and sell nothing, save their top slideshows and a teardown into the pattern store (loop-pattern-db). Jev decides which accounts pass.",
  },
  {
    id: "loop-format-library",
    area: "loop",
    title: "Every short video and slideshow starts from a named format, and the read-back tags which one",
    status: "todo",
    phase: 2,
    app: "all",
    owner: "Claude",
    why: "The 100-format book Leo downloaded on 30 Oct (relatable, opinion, advice, easy to film, storytelling), and Salim (step 1): originality is a trap at the start; build on a format that already works and mix patterns later.",
    ours: "Postmosis's /make lists 12 formats. postmosis.com/vault/tiktok-video-ideas writes the 100 formats up in our own words. On 30 Oct Leo picked a format library for the app. The Monday read-back does not record a post's format yet.",
    build: "Add the formats, in our words, to Postmosis's format library as a 'pick a format' step for scripts and slideshows. Each post the read-back reads gets its format as a Jev tag, so the monthly review (loop-monthly-review) swaps the weakest format with evidence.",
  },
  {
    id: "faces-leo-formats",
    area: "faces",
    title: "Three founder formats tested against each other each month",
    status: "todo",
    phase: 3,
    app: "all",
    owner: "Leo + Claude",
    why: "Oren (58:26): pick three to five formats, make three or four of each a month, compare, swap the loser.",
    ours: "generate-weekly-content.sh rotates five pillars the model picks freely; none is one of these three formats, and nothing measures posts by format.",
    build: "Start with what top advisers do differently (aggregated ActivityTracker numbers, no names), building adviser tools with AI, and agency and career life. Four of each a month.",
  },
  {
    id: "position-one-face",
    area: "position",
    title: "One face across the adviser apps",
    status: "todo",
    phase: 3,
    app: "all",
    owner: "Leo",
    why: "Oren (52:22): the people around a brand reach more than its own handle.",
    ours: "ActivityTracker and Advisor OS speak to the same advisers from two brands, and Leo appears on neither.",
    build: "Leo's Instagram bio and pinned posts point to one page listing the adviser apps, and his reels name whichever app the topic belongs to.",
    question: "Is Leo comfortable being the public face of ActivityTracker and Advisor OS together?",
  },
  {
    id: "faces-leo-weekly",
    area: "faces",
    title: "Leo films three reels every Tuesday",
    status: "started",
    phase: 3,
    app: "all",
    owner: "Leo",
    why: "Oren (44:01): an expert on camera is the first strategy for most brands, at three posts a week minimum.",
    ours: "generate-weekly-content.sh writes three reel scripts and a carousel every Sunday at 12:00 (dated Mon, Wed, Fri) into a JSON file and an Obsidian note nobody is told about. @leotan_js has no auto-post route.",
    build: "Scripts land Sunday and Leo gets told on Telegram. Leo films all three in one 45-minute sitting on Tuesday, talking-head-reel cuts them, and Zernio posts them Wednesday, Friday and Sunday.",
  },
  {
    id: "faces-leo-crosspost",
    area: "faces",
    title: "Every founder reel also goes to LinkedIn and YouTube Shorts",
    status: "todo",
    phase: 3,
    app: "all",
    owner: "Leo + Claude",
    why: "Oren (1:01:26): cross-posting takes minutes and compounds even when it starts slow.",
    ours: "Zernio posts nothing for Leo; its two accounts are ActivityTracker's TikTok and Radiant's Instagram. Content Studio /accounts can already connect LinkedIn and YouTube.",
    build: "Connect LinkedIn and YouTube in Zernio and add both to the founder reel schedule.",
    question: "Two more Zernio seats at about US$6 a month each?",
  },
  {
    id: "faces-leo-linkedin-system",
    area: "faces",
    title: "Leo's LinkedIn runs on one strategy file, a bank of idea cards and a check before each post",
    status: "todo",
    phase: 3,
    app: "all",
    owner: "Leo + Claude",
    why: "Christian Di Bratto (reel DfFFGpzxcEe, 0:03 to 0:12): a Claude repo interviews you, builds your content strategy and gives your first 20 post ideas; his reel De9PijYAX9J lists what makes a LinkedIn post take off, from 'makes the reader look good for sharing it' to 'written for a cold audience'.",
    ours: "Founder reels go to LinkedIn through faces-leo-crosspost. His MIT repo hattip-linkedin-os is saved at ~/Documents/Postmosis/copy/_vault/originals/hattip. Leo picked a LinkedIn post check and a strategy interview for Postmosis on 30 Oct (not built). postmosis.com/vault has his method in linkedin-post-ideas, linkedin-ghostwriting and linkedin-post-best-practices.",
    build: "Run the interview once for Leo as the founder behind Postmosis, ActivityTracker and FINternship; keep the strategy file; write 20 idea cards from it; every post passes the post check (Jev scores each factor, a Ship or Revise verdict with the one fix) before it goes out, three a week. Measure LinkedIn posts in the Monday read-back.",
    question: "Which brand leads Leo's LinkedIn: Postmosis, ActivityTracker or FINternship?",
  },
  {
    id: "cmfas-pass-stories",
    area: "creators",
    title: "People who passed CMFAS post how they did it",
    status: "todo",
    phase: 4,
    app: "cmfas",
    owner: "Leo + Claude",
    why: "Kenyon (21:58): narrow niches convert better and their formats last longer.",
    ours: "CMFAS Prep sells exam passes but records nobody who passed the real exam. Every user has a /referral link (10% off for a friend, 10% credit back). FINternship interns sit the exams.",
    build: "Ask pass holders and interns for a short 'how I passed' video with their own link; organic only, pointing at the starter bundle.",
  },
  {
    id: "scale-va-ops",
    area: "scale",
    title: "A Catalyst VA runs creator ops",
    status: "todo",
    phase: 5,
    app: "all",
    owner: "VA",
    why: "Kenyon (3:47): the first hire is a manager who buys back the founder's time on reviews, chasing and updates.",
    ours: "Catalyst Outsourcing places VAs.",
    build: "From week 2 of the pilot, a VA sends recruiting DMs, books calls, chases late videos and runs payouts. Leo keeps taste and the final review.",
    question: "Start the VA in week 2 of the pilot, or after day 30?",
  },
  {
    id: "scale-rotation",
    area: "scale",
    title: "Creators who stop performing are rotated out",
    status: "todo",
    phase: 5,
    app: "all",
    owner: "Leo + Claude",
    why: "Kenyon (44:46): cut creators averaging under 300 views a post. Hector (Wispr Flow): grow 5 to 10 to 20 to 40, then add only standouts.",
    ours: "None.",
    build: "In the monthly review, flag creators under 300 average views or with two months of no booked calls, pay them out, and replace them.",
  },
  {
    id: "scale-referral-bonus",
    area: "scale",
    title: "Creators earn a bonus for bringing in creators at their level",
    status: "todo",
    phase: 5,
    app: "all",
    owner: "Leo + Claude",
    why: "Hector (Wispr Flow): US$100 for bringing in someone at or above your level. It helps most from 10 to 20 creators and was one of the main ways Wispr grew from 5 to 50.",
    ours: "None.",
    build: "A referral bonus in the roster, paid once the new creator's first video is approved.",
  },
  {
    id: "scale-review-in-studio",
    area: "scale",
    title: "Creator videos are reviewed inside Content Studio",
    status: "todo",
    phase: 5,
    app: "all",
    owner: "Claude",
    why: "Kenyon (37:09): Sideshift rebuilt itself to track, manage and pay creators and run their winners as ads, all in one tool.",
    ours: "Content Studio has team review (submit, approve, an audit trail, posting locked until approved, /review links), but submissions are text only.",
    build: "Once five creators post, move submissions and review from the Lark roster into Content Studio: the creator uploads a video, Leo approves with notes, the creator posts from their own account and pastes the link. Behind leoOnly until Leo says on for everyone.",
  },
  {
    id: "scale-creator-db",
    area: "scale",
    title: "A creator database once the roster passes 20",
    status: "todo",
    phase: 5,
    app: "all",
    owner: "Leo",
    why: "Angus Sewell (0:12): Modash or HypeAuditor finds creators by niche at scale.",
    ours: "Instagram keyword search, which is free and enough for five.",
    build: "Trial Modash for 14 days once the roster passes 20, and keep it only if it finds creators keyword search missed.",
    question: "Modash at about $199 to $299 a month, when the roster passes 20?",
  },
  {
    id: "scale-slideshow-network",
    area: "scale",
    title: "One proven slideshow format posts daily on a few accounts each app owns",
    status: "todo",
    phase: 5,
    app: "all",
    owner: "Leo + Claude",
    why: "Salim (x.com/rsalimx/status/2087180278930313392, section 3): one proven format, posted every day, is the engine; the apps he names put the product on one slide as something the narrator uses, and @sydneysynced reuses one winning cover while the slides inside change.",
    ours: "Postmosis's slideshow maker (/make/slideshow, Leo only today; Leo picked opening it to everyone on 30 Oct) makes 9:16 photo slides with Pexels photos and Jev-picked pictures. The 30 Oct teardowns list what it lacks for these formats: collage layouts, pictures in one generated style, stickers, saved templates, keeping a cover while swapping the slides.",
    build: "Per app, once the scout (loop-format-scout) finds a format: build its template in Postmosis, post one slideshow a day on one to three genuine accounts the app owns, the product named once on slide 3 or 4, and read the results weekly. No device farms, rented or bought accounts, or spoofed locations: TikTok's rules on fake engagement and inauthentic behaviour ban them.",
    question: "Which app runs the first slideshow account?",
  },
];

export const MK_ASKS: MkAsk[] = [
  {
    id: "milk-the-videos",
    date: "26 Oct 2026",
    short: "milk the videos",
    text: "list down the youtube videos that were mentioned in this reel ... then please watch those videos, milk them dry. Then ideate the strategy and workflow, whatever, and invecntory what we have to market our apps fully",
    items: ["loop-monday-readback", "loop-brief-template", "position-statements", "faces-leo-weekly", "faces-leo-formats"],
  },
  {
    id: "angus-workflow",
    date: "26 Oct 2026",
    short: "this workflow too",
    text: "what about this workflow too: https://www.instagram.com/reels/DZpveoMRy0b/",
    items: ["loop-pattern-db", "loop-roster", "scale-creator-db"],
  },
  {
    id: "make-it-work",
    date: "26 Oct 2026",
    short: "make app marketing work",
    text: "can you create this /north-star plan or something, then place it on https://consultant-content-studio.vercel.app/north-star (so that I can see the progress) ... I really want to make this app marketing work",
    items: ["leaks-voice-licence", "loop-friday-summary", "loop-creator-links", "scale-va-ops"],
  },
  {
    id: "startstory",
    date: "26 Oct 2026",
    short: "StartStory apps",
    text: "check the apps mentioned in the video, reverse engineer their market strategy and milk it",
    items: ["loop-creator-links", "cmfas-pass-stories"],
  },
  {
    id: "per-repo",
    date: "26 Oct 2026",
    short: "one page per repo",
    text: "maybe for each repo we will use /marketing-north-star instead . then its more dedicated and comprehensive for each repo",
    items: [],
  },
  {
    id: "strategies-1030",
    date: "30 Oct 2026",
    short: "add strategies",
    text: "add strategies into the /marketing-north-star",
    items: ["leaks-funnel-teardown", "loop-tiktok-retention", "loop-format-scout", "loop-format-library", "faces-leo-linkedin-system", "scale-slideshow-network"],
  },
];


/** Leo's calls. Once he answers, put his words in `decided` and leave the recommendation as it was. */
export const MK_DECISIONS: { id: string; question: string; recommendation: string; decided?: string; items: string[] }[] = [
  {
    id: "voice-plan",
    question: "Pay for a commercial voice licence?",
    recommendation: "Yes, before any AI voiceover runs as a paid ad.",
    items: ["leaks-voice-licence"],
  },
  {
    id: "crosspost-seats",
    question: "Add LinkedIn and YouTube to Zernio?",
    recommendation: "Yes, after four Tuesdays of filming, so the seats pay for reels that exist.",
    items: ["faces-leo-crosspost"],
  },
  {
    id: "creator-db",
    question: "Buy a creator database?",
    recommendation: "Not until the roster passes 20; keyword search finds five for free.",
    items: ["scale-creator-db"],
  },
];

export const MK_SKIP: { what: string; why: string }[] = [
  { what: "Automated cold DMs (Unipile, Composio)", why: "Meta's Instagram API cannot open a cold DM, and unofficial automation gets the sending account banned." },
  { what: "Chasing a non-replier more than once", why: "Our standing rule: agents never double-text someone who has not replied." },
  { what: "Signing hundreds of creators at once", why: "Hector: mercenary creators make look-alike videos that Meta groups and suppresses." },
  { what: "AI avatar videos in creator ad sets", why: "They look alike, so they compete with the creator tests instead of adding to them." },
  { what: "App Store listings for now", why: "Every funnel we run converts on the web; a store listing adds review work and no buyer we can name." },
  { what: "A TikTok army of accounts", why: "Oren: it needs someone who knows TikTok well; we cross-post from Instagram instead." },
  { what: "Press coverage", why: "Oren: low value for the money now; crisis planning is the only part worth keeping." },
];

export const MK_SOURCES: { label: string; url: string }[] = [
  { label: "Daniel Margusov's reel listing the three videos", url: "https://www.instagram.com/reels/DesYI9aMVXz/" },
  { label: "Superwall podcast: Kenyon (Sideshift) on creator programs, 54 min", url: "https://www.youtube.com/watch?v=SuUJgmbQrVc" },
  { label: "Hector Serrano: Wispr Flow's paid ads program, 15 min", url: "https://x.com/hectorserrranoo/status/2108260769603486100" },
  { label: "Oren John: The Most Valuable Marketing Training You'll Ever Watch, 2h47", url: "https://www.youtube.com/watch?v=daCB1kVOtMA" },
  { label: "Angus Sewell: the creator outreach and scripting stack", url: "https://www.instagram.com/reels/DZpveoMRy0b/" },
  { label: "Laura Roeder on whether Wispr's ads are profitable", url: "https://x.com/lkr/status/2109242841968849171" },
];

export function rollupMk(items: MkItem[]): Record<MkStatus, number> {
  const r: Record<MkStatus, number> = { done: 0, started: 0, todo: 0 };
  for (const i of items) r[i.status] += 1;
  return r;
}

export const mkSpecUrl = (id: string) => `https://github.com/leotansingapore/content-studio/blob/main/docs/marketing-north-star/items/${id}.md`;

/** What a Claude session needs to do one card, pasted as its first message. */
export const mkBuildPrompt = (i: MkItem) =>
  [
    `Do app-marketing card "${i.title}" (${i.id}).`,
    `1. Read docs/marketing-north-star/README.md and docs/marketing-north-star/items/${i.id}.md in content-studio (github.com/leotansingapore/content-studio), then ~/Documents/App Growth Playbook/03-strategy-and-workflow.md and private-notes.md on Leo's Mac.`,
    "2. The work may sit outside this repo (another app, a launchd job, Meta, a Lark Base). Check \"What we have today\" against the real thing before changing anything.",
    "3. Stop and ask Leo before spending money, posting publicly, messaging anyone, a schema change or an auth change.",
    "4. Meet every line under \"Done when\".",
    `5. Then set the card's status and ours line in src/data/marketingNorthStar.ts in content-studio, git pull --rebase origin main, and push.`,
  ].join("\n");
