// postmosis.com's marketing north star, rendered at /marketing-north-star/postmosis (Leo's sign-ins only) and
// linked from the hub at /marketing-north-star. Leo, 2026-10-26: "maybe for each repo we will use
// /marketing-north-star instead", then 2026-10-30: "include it for https://postmosis.com/ also, same. marketing and
// seo north-star". Built from a teardown of how eight competitors get customers
// (docs/marketing-north-star/postmosis/research/teardown.md): Taplio, Buffer, Later, Predis.ai, FeedHive,
// Supergrow, AuthoredUp and Typefully. The shared cards (Leo on camera, the Monday read-back, creators) stay on the
// hub; cards here name the hub card they share work with. Its SEO plan is /seo-north-star (src/data/seoNorthStar.ts).
//
// This file ships in a public JS chunk and the repo is public: outcomes, public facts and sources only. No emails,
// ids, customer counts or anything from private notes. src/data/northStarBooks.test.ts fails on those shapes.
//
// Keep it current: when a card's work is done, flip its `status` and `ours` line in the same commit as the work. Ids
// are URL anchors (/marketing-north-star/postmosis#<id>) and spec names
// (docs/marketing-north-star/postmosis/items/<id>.md); never rename one.

import type { MkAsk, MkOwner, MkStatus } from "@/data/marketingNorthStar";

export type PmArea = "position" | "walkthrough" | "proof" | "founder" | "groups" | "loops" | "paid";

export interface PmItem {
  id: string;
  area: PmArea;
  title: string;
  status: MkStatus;
  /** Build order, see PM_PHASES. */
  phase: number;
  owner: MkOwner;
  /** Which competitor does it, with the evidence from the teardown. */
  why: string;
  /** What postmosis.com and the app have today, checked against both repos on 30 Oct 2026. */
  ours: string;
  /** What to do, specific enough to start without asking. */
  build: string;
  /** The one call only Leo can make for this card, if any. */
  question?: string;
}

const REPO_BLOB = "https://github.com/leotansingapore/content-studio/blob/main";
const T = "teardown, 30 Oct 2026";

export const PM_AREAS: Record<PmArea, { label: string; hint: string }> = {
  position: { label: "Positioning", hint: "The one thing postmosis.com says that no rival says." },
  walkthrough: { label: "The walkthrough", hint: "From the first click to an account Leo has set up: the booking, the reminders and the call." },
  proof: { label: "Proof", hint: "Real posts, customer words and the founder's story, all things a visitor can check." },
  founder: { label: "Leo in public", hint: "Leo's own posts and videos, made in Postmosis, the channel the small rivals grew on." },
  groups: { label: "Groups and sessions", hint: "Group walkthroughs, guest sessions, a posting camp and professional communities." },
  loops: { label: "Built-in reach", hint: "What the product and the site hand out that brings the next visitor." },
  paid: { label: "Paid and partners", hint: "Referrals, ads, review sites and launches, once a price or self-serve sign-up exists." },
};

export const PM_AREA_ORDER: PmArea[] = ["position", "walkthrough", "proof", "founder", "groups", "loops", "paid"];

export const PM_PHASES: { n: number; title: string; goal: string }[] = [
  { n: 1, title: "Every booking is held", goal: "Each walkthrough button names Postmosis and carries where it came from, and every booking is reminded, held and ends with an account set up." },
  { n: 2, title: "Proof a professional believes", goal: "A visitor can see real posts made in Postmosis and read what professionals like them got." },
  { n: 3, title: "Reach that compounds", goal: "Leo, groups, communities and the product itself bring professionals to a walkthrough every week without ad spend." },
  { n: 4, title: "Paid and partners", goal: "Referrals, ads, review sites and launches, once a public price or self-serve sign-up exists." },
];

export const PM_THESIS: string[] = [
  "postmosis.com went live on 29 Oct 2026 with one way in: Book a walkthrough, where Leo sets up the account. All eight rivals we took apart let a visitor start alone with a free plan or a trial, and only Predis.ai says it takes a card. None sets up an account with a one-person buyer.",
  "So the walkthrough is the funnel, and phase 1 makes it hold: a booking page that names Postmosis, a source on every booking, reminders, and a call that ends with the account set up and a peer asked for. Proof comes next. The rivals show a wall of posts, quotes with follower counts and ratings, and the site has none yet.",
  "Reach then comes the way the small rivals grew: the founder posting as himself, groups and communities, and the product carrying its own name. Money goes in last, once a price or self-serve sign-up exists. The shared cards, Leo on camera and the Monday read-back, stay on the hub.",
];

export const PM_PRINCIPLES: string[] = [
  "One way in for now: Book a walkthrough, and Leo runs every one.",
  "Claim only what product-truth.md lists as on for every customer. No customer counts, logos or ratings we do not have.",
  "Real faces before AI faces: Leo on camera, never an avatar in his place.",
  "Nothing sends a cold DM by automation, and nobody is chased more than once.",
  "Every booking carries where it came from, so a card is judged on walkthroughs booked, not views.",
  "Jev decides (which page converts, which comment shows intent); a language model writes the words.",
];

export const PM_ITEMS: PmItem[] = [
  // Phase 1: every booking is held (Jev's order, the booking page before the reminders it sends)
  {
    id: "pm-mk-position",
    area: "position",
    title: "postmosis.com says the one thing no rival says",
    status: "done",
    phase: 1,
    owner: "Leo + Claude",
    why: "The eight rivals call themselves a social media tool, workspace or LinkedIn tool, and none edits the video a professional films on a phone or speaks to a profession (" + T + "). Shares work with the hub card position-statements, which puts one positioning sentence atop each app's brief; this card owns the home H1.",
    ours: "The home H1 reads 'The all-in-one content studio for solo professionals.' (live on 30 Oct 2026), the brief in ~/Documents/Postmosis/product-marketing.md names the phone-video gap, and 6 /for pages speak to each profession.",
    build: "Done. Re-read the rivals' headlines each quarter and keep the line only while none of them claims it.",
  },
  {
    id: "pm-mk-walkthrough-script",
    area: "walkthrough",
    title: "Every walkthrough ends with the account set up and a first post made",
    status: "todo",
    phase: 1,
    owner: "Leo + Claude",
    why: "None of the eight sets up an account with a one-person buyer: Supergrow's onboarding call comes only with Enterprise, AuthoredUp's only from 10 profiles, and Later's strategy call is for brands (" + T + ").",
    ours: "Leo runs every walkthrough and sets up the account (his call of 28 Oct 2026). There is no written script or checklist.",
    build: "Write a 20-minute script with Leo: their brand kit, one carousel from a client question, one video from a clip they filmed, their week planned, posting connected if they want it. Keep it as a checklist in docs, with a note after each call of what they made.",
  },
  {
    id: "pm-mk-booking-page",
    area: "walkthrough",
    title: "The booking page names Postmosis and says what the 20 minutes cover",
    status: "todo",
    phase: 1,
    owner: "Leo",
    why: "All eight rivals let a visitor start alone with a free plan or a trial (" + T + "). Postmosis asks for a booking instead, so the booking page is the whole funnel. Shares work with the hub card leaks-funnel-teardown, whose Postmosis run starts from that teardown.",
    ours: "Every button opens Pick a Time's demo-session page, which is titled Activity Tracker Demo with 30-minute slots and never says Postmosis (read 30 Oct 2026). It stays until Leo gives a Postmosis one (his call of 28 Oct 2026).",
    build: "Leo makes a booking type named Postmosis walkthrough with three lines on what the call covers (your account set up, your first carousel and video made, your week planned), two questions (what you do, which networks you post on) and 20-minute slots. Claude swaps BOOK_WALKTHROUGH in the site to it and checks every button.",
  },
  {
    id: "pm-mk-reminders",
    area: "walkthrough",
    title: "Every booking gets a confirmation, a reminder and a prep note from Leo",
    status: "todo",
    phase: 1,
    owner: "Leo + Claude",
    why: "Supergrow's founders sign a 4-email onboarding over 3 days and Taplio sends 5 emails in 7 days (Sequenzy captures, third-party; " + T + ").",
    ours: "Pick a Time sends a confirmation and reminders 24 hours and 1 hour before, in its own words and under its own name. A page's own words reach only the confirmation, through the page description, and other reminder times (48, 3 or 1 hours, no 2) need its Pro plan (calendarios send-booking-email, RemindersCard.tsx). No-shows are not counted.",
    build: "Write three messages in Leo's voice: a confirmation now, a reminder 3 hours before, and a prep note asking them to film 30 seconds on their phone. The prep note can ride in the page description; messages wholly in Leo's words need an email sender. Count no-shows for four weeks before and four after.",
    question: "Send them from the booking tool, or add an email sender?",
  },
  {
    id: "pm-mk-peer-ask",
    area: "walkthrough",
    title: "Every walkthrough ends by asking for one peer by name",
    status: "todo",
    phase: 1,
    owner: "Leo",
    why: "AuthoredUp's affiliate page has a tier for referring friends and readers, and Buffer, Taplio and Supergrow pay on referred customers (" + T + ").",
    ours: "None.",
    build: "The script's last minute asks who else they know who should be posting and isn't. The peer gets a slot the same week through the same link with src=postmosis&ref=peer. Count peers asked and booked each week.",
  },
  {
    id: "pm-mk-booking-source",
    area: "walkthrough",
    title: "Every booked walkthrough shows the page or post it came from",
    status: "todo",
    phase: 1,
    owner: "Claude",
    why: "Shares work with the hub card loop-creator-links. Typefully credits every sign-up from a user's shared thread to its affiliate (" + T + "); without a source, nothing says which of the 113 URLs in the site's sitemap (read 30 Oct 2026) brings bookings.",
    ours: "Every Book a walkthrough button is one component that opens the same address, BOOK_WALKTHROUGH in src/site/config.ts of the site (pick-a-time.app/book/demo-session). Pick a Time saves ?src= and ?ref= on a booking, but only as a pair. The site runs no page counter: no PostHog, Google tag or Vercel Analytics in the site repo.",
    build: "Add src=postmosis&ref=<page path> to every walkthrough link on the site, and ref=<post> to the links in Leo's posts, so Pick a Time keeps the pair on each booking. Check it with one test booking. A weekly count of bookings by ref then goes to Leo with the hub's Monday read-back.",
    question: "Add a cookie-free page counter to postmosis.com, such as Vercel Web Analytics?",
  },

  // Phase 2: proof (what can start now first, then what needs customers)
  {
    id: "pm-mk-made-with",
    area: "proof",
    title: "A Made with Postmosis page shows real posts and videos, Leo's own first",
    status: "todo",
    phase: 2,
    owner: "Claude",
    why: "AuthoredUp keeps a wall of posts written in its editor, opened by its founder's own posts (" + T + ").",
    ours: "postmosis.com shows product screenshots and no customer posts. The brief bars implying customers we do not have (product-marketing.md, Proof points).",
    build: "Build /made-with on the site from Leo's own brands first (carousels, edited videos, a link-in-bio page), each labelled with the feature that made it. Add a customer's post only with their written permission.",
  },
  {
    id: "pm-mk-testimonials",
    area: "proof",
    title: "The first customers' words show with their profession and city",
    status: "todo",
    phase: 2,
    owner: "Leo + Claude",
    why: "Supergrow keeps a wall of love on Senja, Taplio puts a follower count on every quote and AuthoredUp heads its quotes LinkedIn Top Voices (" + T + ").",
    ours: "No testimonials, logos or ratings anywhere on the site.",
    build: "After a customer's fourth week, Leo asks for two sentences and permission. Show them on the home page and the matching /for page with first name, profession and city. Once a profession has three, one becomes a short story page.",
  },
  {
    id: "pm-mk-founding-offer",
    area: "proof",
    title: "The first 20 professionals get Leo's setup and a held price for a review",
    status: "todo",
    phase: 2,
    owner: "Leo",
    why: "AuthoredUp's free beta gathered 30,000 users and 500 conversations in 13 months, and FeedHive's founder gave his first 25 users lifetime free use (Starter Story, third-party; " + T + ").",
    ours: "No prices on the site (Leo, 28 Oct 2026). /plans lists what is included, and pricing comes on the walkthrough.",
    build: "If Leo agrees: one line on /plans and in the walkthrough script naming the offer and the places left, the held price written into the customer's record, and the review asked for at week four.",
    question: "Offer the first 20 a held price in return for a written review?",
  },
  {
    id: "pm-mk-about-story",
    area: "proof",
    title: "The About page tells why Leo built Postmosis",
    status: "done",
    phase: 2,
    owner: "Leo",
    why: "The small rivals sell through their founders: FeedHive's has about 89K LinkedIn followers and AuthoredUp's about 18K (" + T + ").",
    ours: "/about names Leo with his story, which he read before it shipped (28 Oct 2026), and every guide carries By Leo with Article markup naming him.",
    build: "Done. Update it when the story changes.",
  },

  // Phase 3: reach that compounds, ordered by Jev's score
  {
    id: "pm-mk-posting-camp",
    area: "groups",
    title: "A 30-day posting camp sends a prompt a day for each profession",
    status: "todo",
    phase: 3,
    owner: "Leo + Claude",
    why: "Buffer's Creator Camp runs 30 days of daily prompts in Discord, with shorter sprints between camps (" + T + ").",
    ours: "The /for pages carry example weeks and the vault has idea pages. There is no camp.",
    build: "A free 30-day camp in a group chat: one prompt a day per profession from the /for example weeks, a Friday share thread, and the walkthrough invite on day 30. Run it once with 20 people and count walkthroughs booked.",
    question: "Run the camp in a free WhatsApp or Telegram group?",
  },
  {
    id: "pm-mk-youtube",
    area: "founder",
    title: "A YouTube how-to for filming and editing a talking head, one per profession",
    status: "todo",
    phase: 3,
    owner: "Leo + Claude",
    why: "Later has 57.1K YouTube subscribers and 752 videos, the most of the eight, and none of them edits phone video (" + T + "). Shares work with the hub card faces-leo-crosspost (reels to YouTube Shorts).",
    ours: "/guides/talking-head-video covers it in writing. There are no long videos.",
    build: "Six 5-minute videos, one per /for audience, filmed by Leo and edited in Postmosis. Embed each in its guide with VideoObject markup and link it from the /for page.",
  },
  {
    id: "pm-mk-comment-word",
    area: "founder",
    title: "Talking-head videos end with comment WALKTHROUGH, each answered by hand once",
    status: "todo",
    phase: 3,
    owner: "Leo",
    why: "8 of the 22 Predis.ai Meta ads that loaded, all 4 from creators' pages among them, end with a comment-a-word ask (Meta Ad Library; " + T + "). Shares work with the hub card faces-leo-weekly, which writes the reel scripts.",
    ours: "None.",
    build: "Two of Leo's weekly reels end with the ask. Leo replies by hand with the link, once per person. Never an automated DM and never a second chase.",
  },
  {
    id: "pm-mk-downloads",
    area: "loops",
    title: "Each audience page offers a printable checklist, with an optional email box",
    status: "todo",
    phase: 3,
    owner: "Claude",
    why: "Taplio's monthly benchmark asks for one email, no password and no card, and Later gives away a checklist and a video guide beside its newsletter (" + T + ").",
    ours: "Every page and vault playbook is open with no sign-up (Leo's call for the vault, 29 Oct 2026), and the site collects no emails. 4 of the 7 templates already download as CSV and print, with no email asked. No /for page has a checklist.",
    build: "One printable checklist per /for page, the phone-video checklist first, readable on the page with no gate. An optional box to get the next one by email stores the address and sends nothing until Leo approves the first send.",
    question: "Collect emails at all, given the vault stays open?",
  },
  {
    id: "pm-mk-leo-posts",
    area: "founder",
    title: "Leo's posts are made in Postmosis and link the walkthrough",
    status: "todo",
    phase: 3,
    owner: "Leo",
    why: "Shares work with the hub cards faces-leo-weekly and faces-leo-linkedin-system. FeedHive's founder has about 89K LinkedIn followers and Supergrow's two founders about 20K between them (" + T + ").",
    ours: "The hub card faces-leo-weekly is started: a generator writes three reel scripts every Sunday, and its plan finishes the reels with the talking-head-reel skill, outside Postmosis. The generator has no Postmosis line or link, and postmosis.com links none of Leo's profiles.",
    build: "Each post made in Postmosis says so in one line and links the walkthrough with src=postmosis and a ref for the post. Once a week one post shows the making: the carousel from a client question, or the clip before and after the editor.",
  },
  {
    id: "pm-mk-guest-sessions",
    area: "groups",
    title: "A monthly guest session with a professional who posts well",
    status: "todo",
    phase: 3,
    owner: "Leo",
    why: "Taplio built its academy from guest creators' masterclasses, with their follower counts on the cards (" + T + ").",
    ours: "None.",
    build: "Leo invites one professional a month from the /for audiences to teach 30 minutes on how they post. Record it, cut clips in Postmosis, and publish a vault page from it with their permission.",
  },
  {
    id: "pm-mk-group-walkthrough",
    area: "groups",
    title: "A weekly 30-minute group walkthrough catches people who will not book alone",
    status: "todo",
    phase: 3,
    owner: "Leo",
    why: "Taplio names live group demos, though the page they point to returns 404, and Later runs live Expert Sessions (" + T + ").",
    ours: "None. Every walkthrough is one to one.",
    build: "One fixed weekly slot on a free video call, booked from the site as a second, quieter link. Each attendee is offered a 1:1 setup after. Count attendees and setups for six weeks.",
  },
  {
    id: "pm-mk-made-with-link",
    area: "loops",
    title: "Link-in-bio and review pages carry a small Made with Postmosis link",
    status: "todo",
    phase: 3,
    owner: "Claude",
    why: "Typefully credits sign-ups from users' shared threads to its affiliates, and one business tagged #madewithpredisai in its own ad (" + T + ").",
    ours: "The public link-in-bio page (src/pages/BioPublicPage.tsx) has no link back, and the review page (src/pages/PreviewReviewPage.tsx) says Postmosis in its header without a link.",
    build: "A one-line footer link to postmosis.com with ?ref=bio or ?ref=review, a per-brand switch to hide it, and a test that the link carries its ref.",
    question: "Show the link on customers' public pages, with a switch to hide it?",
  },
  {
    id: "pm-mk-community-sessions",
    area: "groups",
    title: "One professional community a month gets a members-only walkthrough",
    status: "todo",
    phase: 3,
    owner: "Leo",
    why: "AuthoredUp gives communities a member discount code and resells through LinkedIn trainers, and Taplio recruits community builders as partners (" + T + ").",
    ours: "None.",
    build: "Claude lists 12 communities that fit the /for audiences (an agents' group, a coaching circle, a freelancer meetup). Leo offers each organiser a free 30-minute session for members and books attendees for 1:1 setups.",
  },
  {
    id: "pm-mk-free-audit",
    area: "loops",
    title: "A free audit of a public Instagram or TikTok profile ends with a walkthrough offer",
    status: "todo",
    phase: 3,
    owner: "Claude",
    why: "Taplio's free tools turn a LinkedIn profile into posts and give profile feedback, and AuthoredUp audits a hiring post for free (" + T + ").",
    ours: "The account audit runs for signed-in customers only (supabase/functions/audit-social-account, JWT verification on), and each run reads the public profile through a paid data call.",
    build: "A /tools/profile-audit page on the site calling a new public endpoint that ships default off, with a daily cap, a bot check and a per-visitor limit. It shows three findings and offers to go through the rest with Leo.",
    question: "Each run costs a data call. Open a free public audit with a daily cap?",
  },

  // Phase 4: paid and partners (Jev's order, each after what it depends on)
  {
    id: "pm-mk-self-serve",
    area: "paid",
    title: "A visitor who will not book can still start alone",
    status: "todo",
    phase: 4,
    owner: "Leo + Claude",
    why: "All eight rivals lead with a free plan or a trial, and only Predis.ai says it takes a card (" + T + ").",
    ours: "Accounts are made after a walkthrough. The sign-in page has no sign-up form and tells FINternship Academy members to sign in there first (src/pages/Auth.tsx).",
    build: "Leo's call first. If yes: open sign-up on app.postmosis.com with a short trial, billing, and the walkthrough's setup as an onboarding checklist.",
    question: "Open self-serve sign-up beside the walkthrough?",
  },
  {
    id: "pm-mk-partner-ads",
    area: "paid",
    title: "Customers' own posts run as partnership ads",
    status: "todo",
    phase: 4,
    owner: "Leo",
    why: "Predis.ai runs ads from creators' own pages with Predis.ai and pays $2,000 for a shout-out that reaches 1M impressions (" + T + ").",
    ours: "None. There are no customer posts to run yet.",
    build: "Once pm-mk-testimonials has customers: ask one to run their best post made in Postmosis as a partnership ad, with a capped budget and their written permission.",
    question: "Spend on partnership ads once customers agree?",
  },
  {
    id: "pm-mk-product-hunt",
    area: "paid",
    title: "A Product Hunt launch, once a visitor can start alone",
    status: "todo",
    phase: 4,
    owner: "Leo",
    why: "Taplio drew 1,008 upvotes and Supergrow 947, each #1 of the day, and Typefully 928; AuthoredUp drew 93 and FeedHive 53 (" + T + ").",
    ours: "None. Launch visitors would meet a booking page.",
    build: "After pm-mk-self-serve ships: a launch day with Leo's video, the phone-video gap as the line, and every comment answered by Leo.",
  },
  {
    id: "pm-mk-referrals",
    area: "paid",
    title: "Customers earn a share for each professional they refer",
    status: "todo",
    phase: 4,
    owner: "Leo + Claude",
    why: "Buffer and AuthoredUp pay 25% for 12 months, Taplio 30% for a year, Supergrow and Predis.ai 30% for life and Typefully 20% recurring (" + T + ").",
    ours: "No public price, so no programme.",
    build: "Once a public price exists: a referral link per customer, tracked by a referral tool, paid monthly and on time.",
    question: "Pay 25% for 12 months once there is a public price?",
  },
  {
    id: "pm-mk-reviews",
    area: "paid",
    title: "Postmosis has G2 and Capterra profiles with real reviews",
    status: "todo",
    phase: 4,
    owner: "Leo",
    why: "Supergrow puts 4.8/5 on G2 in its hero and Predis.ai shows 4.7/5 on G2 (" + T + ").",
    ours: "None, and no customers to ask yet.",
    build: "Open both profiles once ten customers agree to review, asked at week four together with the testimonial request.",
  },
  {
    id: "pm-mk-retargeting",
    area: "paid",
    title: "Visitors who did not book see Leo on camera again",
    status: "todo",
    phase: 4,
    owner: "Leo + Claude",
    why: "Predis.ai retargets lapsed trials at $19 and $32 a month, and Supergrow runs 8 ads from one video (Meta Ad Library; " + T + ").",
    ours: "No pixel or ad tag on postmosis.com, no consent banner, and its privacy page says the site has no analytics. No ad account is named for Postmosis in either repo.",
    build: "Once pm-mk-booking-source shows which pages convert: a Meta pixel with consent, one audience of visitors who did not book, two of Leo's real reels as ads, a capped budget, judged on cost per booked walkthrough.",
    question: "Spend on retargeting, and how much a month?",
  },
  {
    id: "pm-mk-claude-directory",
    area: "paid",
    title: "Postmosis is listed in Claude's connector directory",
    status: "todo",
    phase: 4,
    owner: "Claude",
    why: "Taplio is an official Claude connector and has advertised it on Meta since 23 Oct 2026 (" + T + ").",
    ours: "Connect Claude works through a private connection link in the URL (content-studio-mcp, deployed without JWT verification, CLAUDE.md). A directory listing needs a proper sign-in flow and tool annotations.",
    build: "Add OAuth sign-in and tool annotations to content-studio-mcp, keep the link flow for existing connections, then submit to the directory.",
    question: "Add OAuth sign-in to Connect Claude for the listing?",
  },
];

export const PM_ASKS: MkAsk[] = [
  {
    id: "ask-pm-per-repo",
    date: "26 Oct 2026",
    short: "One page per app",
    text: "maybe for each repo we will use /marketing-north-star instead . then its more dedicated and comprehensive for each repo",
    items: ["pm-mk-position", "pm-mk-made-with", "pm-mk-testimonials", "pm-mk-leo-posts"],
  },
  {
    id: "ask-pm-postmosis",
    date: "30 Oct 2026",
    short: "One for postmosis.com",
    text: "include it for https://postmosis.com/ also, same. marketing and seo north-star",
    items: ["pm-mk-booking-source", "pm-mk-booking-page", "pm-mk-reminders", "pm-mk-walkthrough-script", "pm-mk-peer-ask"],
  },
];

export const PM_DECISIONS: { id: string; question: string; recommendation: string; decided?: string; items: string[] }[] = [
  {
    id: "dec-pm-counter",
    question: "Add a cookie-free page counter to postmosis.com?",
    recommendation: "Yes, Vercel Web Analytics, so each booking's source can be read against the page views behind it.",
    items: ["pm-mk-booking-source"],
  },
  {
    id: "dec-pm-email",
    question: "Add an email sender for booking reminders and checklists?",
    recommendation: "Use Pick a Time's own confirmation and reminders first, with the prep note in the page description its confirmation carries. Add a sender only if every message must be in your words, or you agree to collect emails for the checklists.",
    items: ["pm-mk-reminders", "pm-mk-downloads"],
  },
  {
    id: "dec-pm-founding",
    question: "Offer the first 20 professionals a held price for a written review?",
    recommendation: "Yes, if a price is named on the walkthrough anyway: 20 places, review asked at week four.",
    items: ["pm-mk-founding-offer"],
  },
  {
    id: "dec-pm-camp",
    question: "Run the posting camp in a free WhatsApp or Telegram group?",
    recommendation: "Telegram: a bot can post each day's prompt without a personal number, and members can keep their numbers hidden.",
    items: ["pm-mk-posting-camp"],
  },
  {
    id: "dec-pm-made-with-link",
    question: "Show a Made with Postmosis link on customers' public pages?",
    recommendation: "Yes, small and in the footer, with a per-brand switch to hide it.",
    items: ["pm-mk-made-with-link"],
  },
  {
    id: "dec-pm-free-audit",
    question: "Open a free public profile audit that costs a data call per run?",
    recommendation: "Yes, default off at first, 20 runs a day, behind a bot check.",
    items: ["pm-mk-free-audit"],
  },
  {
    id: "dec-pm-self-serve",
    question: "Open self-serve sign-up beside the walkthrough?",
    recommendation: "Not yet. Keep the walkthrough until twenty customers show what setup needs, then a no-card trial.",
    items: ["pm-mk-self-serve", "pm-mk-product-hunt"],
  },
  {
    id: "dec-pm-paid",
    question: "Spend on retargeting and partnership ads?",
    recommendation: "Not before the booking source shows a page that converts; then a capped test judged on cost per booked walkthrough.",
    items: ["pm-mk-retargeting", "pm-mk-partner-ads"],
  },
  {
    id: "dec-pm-referrals",
    question: "Run a paid referral programme?",
    recommendation: "After a public price exists: 25% for 12 months, as Buffer and AuthoredUp pay.",
    items: ["pm-mk-referrals"],
  },
  {
    id: "dec-pm-claude-oauth",
    question: "Add OAuth sign-in to Connect Claude for the directory listing?",
    recommendation: "Later. It is an auth change for a listing that brings few solo professionals today.",
    items: ["pm-mk-claude-directory"],
  },
];

export const PM_SKIP: { what: string; why: string }[] = [
  { what: "An AppSumo lifetime deal", why: "Predis.ai made $42,000 in a month and FeedHive sold out, but a lifetime deal is a lasting cost, needs billing and skips the walkthrough (" + T + ")." },
  { what: "A Chrome extension", why: "AuthoredUp has 30,000 users and Buffer 200,000, but it is a large build, and Taplio's and Supergrow's listings are gone (" + T + ")." },
  { what: "A $1 first month or a 30-day refund", why: "It changes conversion after the walkthrough, not bookings, and needs prices and billing; Leo can say it on the call if he wants." },
  { what: "A build contest or an open revenue dashboard", why: "Buffer runs both; they need a public API and numbers to show, which Postmosis does not have yet." },
  { what: "Automated DMs, or chasing a non-replier", why: "Our standing rule: nothing sends a cold DM by automation, and nobody is chased more than once." },
  { what: "AI avatar ads in Leo's place", why: "The hub's rule: real faces before AI faces." },
];

export const PM_SOURCES: { label: string; url: string }[] = [
  { label: "How eight competitors get customers, teardown of 30 Oct 2026", url: `${REPO_BLOB}/docs/marketing-north-star/postmosis/research/teardown.md` },
  { label: "What Leo asked for", url: `${REPO_BLOB}/docs/marketing-north-star/postmosis/leo.md` },
  { label: "The app marketing hub, with the shared cards", url: "https://app.postmosis.com/marketing-north-star" },
  { label: "postmosis.com's SEO north star", url: "https://app.postmosis.com/seo-north-star" },
];

export const pmSpecUrl = (id: string) => `${REPO_BLOB}/docs/marketing-north-star/postmosis/items/${id}.md`;

/** What a Claude session needs to do one card, pasted as its first message. */
export const pmBuildPrompt = (i: { id: string; title: string }) =>
  [
    `Do postmosis.com marketing card "${i.title}" (${i.id}).`,
    `1. In content-studio (github.com/leotansingapore/content-studio), read docs/marketing-north-star/postmosis/README.md, docs/marketing-north-star/postmosis/items/${i.id}.md and docs/marketing-north-star/postmosis/research/teardown.md. The site is ~/postmosis-site; read the vault in ~/Documents/Postmosis (product-truth.md, product-marketing.md) and obey each repo's CLAUDE.md.`,
    "2. The work may sit outside this repo (the site, the booking tool, Leo's accounts). Check \"What we have today\" against the real thing before changing anything.",
    "3. Stop and ask Leo before spending money, posting publicly, messaging anyone, a schema change or an auth change.",
    "4. Meet every line under \"Done when\".",
    "5. Then set the card's status and ours line in src/data/postmosisMarketingNorthStar.ts in content-studio and the spec's Status line, run its tests, git pull --rebase origin main, and push.",
  ].join("\n");
