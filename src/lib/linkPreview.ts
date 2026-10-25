// What a link-preview crawler (Telegram, WhatsApp, Slack...) is told about a shared link. The SPA serves one
// index.html for every URL and crawlers never run the bundle, so vercel.json sends crawler user-agents to
// api/page-og.ts, which answers with the head built here (link-previews skill).
//
// A post link names its post only when the post is public, bundled data: a news story, an ad, a creator's top
// post, a trend, an inspiration example or a creator. Everything else is behind a login (your posts, the posts
// board, team posts), so its card names the page, never what is on it. Words are looked up by id; nothing from
// the query is ever printed. Relative imports only: the edge function bundles this file outside Vite.

import NEWS from "../data/industryNews.json";
import ADS_FILE from "../data/adsSwipe.json";
import TOP_POSTS from "../data/topPosts.json";
import ADVISORS from "../data/advisors.json";
import TRENDS from "../data/trends.json";
import INSPIRATION from "../data/inspiration.json";

export const ORIGIN = "https://consultant-content-studio.vercel.app";
export const SITE_NAME = "Content Studio";
// index.html's own description, so a page card says what the home page says
export const SITE_DESCRIPTION =
  "Turn your positioning into a week of posts. Plan a funnel-balanced calendar - Attraction, Building Trust, Conversion - then draft each post in 60 seconds.";
export const SITE_CARD = "/og/site.jpg";

/** Each page's name as the nav shows it (src/lib/nav.ts, a page's title else its label); the test keeps them equal. */
export const PAGES: Record<string, string> = {
  "/home": "Home",
  "/agent": "Agent",
  "/welcome": "Getting started",
  "/north-star": "North star",
  "/generate": "Write a post",
  "/make": "Formats",
  "/generate/batch": "Batch",
  "/carousel": "Carousel",
  "/image": "Image",
  "/slideshow": "Slideshow",
  "/edit": "Video",
  "/media": "Media",
  "/plan": "Plan",
  "/campaigns": "Campaigns",
  "/ideas": "Ideas",
  "/calendar": "Calendar",
  "/board": "Board",
  "/drafts": "All posts",
  "/library": "Library",
  "/grid": "Instagram grid",
  "/reels": "Posts board",
  "/reels/team": "Reviewers",
  "/recruit": "Brand Brain",
  "/recruit/conversations": "Conversations",
  "/recruit/agent": "AI agent",
  "/recruit/engage": "Reply drafts",
  "/recruit/auto-dm": "Auto-DM",
  "/coach": "Coach",
  "/analytics": "Analytics",
  "/team": "Leader approvals",
  "/swipe": "Top posts",
  "/trends": "Trends",
  "/clone": "Clone a reel",
  "/inspiration": "Inspiration",
  "/profiles": "Creators",
  "/following": "Following",
  "/competitors": "Competitors",
  "/saved": "Saved",
  "/market": "Your market",
  "/playbook": "My Playbook",
  "/voice": "Your voice",
  "/brand": "Brand kit",
  "/audiences": "Audiences",
  "/people": "Faces and voices",
  "/bio": "Link in bio",
  "/links": "Tracked links",
  "/accounts": "Social accounts",
  "/fads": "F.A.D.S.",
  "/connect": "Connect Claude",
  "/settings": "Settings",
  "/studio": "Studio",
  "/skills": "Skills",
  "/activity": "Activity",
  "/automations": "Automations",
  "/academy": "Academy",
  "/create-guide": "How to post",
  "/tutorial": "How the studio works",
  "/feedback": "Feedback",
};

export interface Preview {
  title: string;
  description: string;
  /** Absolute. */
  image: string;
  /** The site card is ours, 1200x630; a post's own picture has its own size. */
  ownCard: boolean;
}

/** Plain ASCII on one line: chat apps and old clients mangle smart quotes, dashes and emoji. */
export function ascii(s: string): string {
  return (s ?? "")
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”″]/g, '"')
    .replace(/[–—−]/g, "-")
    .replace(/…/g, "...")
    .normalize("NFKD")
    // markdown markers only: a single _ belongs to handles like @that_ang_moh_in_finance
    .replace(/\*\*|__|`+/g, "")
    .replace(/(^|\s)#{1,6}\s/g, "$1")
    .replace(/[^\x20-\x7E]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** At most `max` characters, cut at a word, with "..." when cut. */
export function clip(s: string, max: number): string {
  const t = ascii(s);
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 3);
  return `${cut.slice(0, cut.lastIndexOf(" ") > max / 2 ? cut.lastIndexOf(" ") : cut.length).replace(/[\s,.;:-]+$/, "")}...`;
}

type Story = { id: string; title: string; gist: string; clipping?: string };
type Ad = { adId: string; advertiser: string; headline: string | null; body: string; image: string };
type TopPost = { shortCode: string; caption: string; cover?: string; idea?: { hook?: string } };
type Advisor = { id: string; name: string; handle: string; platform: string; why_follow?: string };
type Trend = { id: string; title: string; why_it_works?: string };
type Example = { id: string; hook: string; content: string };

const stories = NEWS as Story[];
const ads = (ADS_FILE as { ads?: Ad[] }).ads ?? [];
const advisors = ADVISORS as Advisor[];
const trends = TRENDS as Trend[];
const examples = INSPIRATION as Example[];
// The same <advisorId>-<shortCode> key /swipe?post= reads (src/lib/topPosts.ts: Instagram handles only).
const topByKey = new Map<string, { post: TopPost; advisor: Advisor }>();
for (const a of advisors) {
  if (a.platform !== "instagram") continue;
  for (const post of (TOP_POSTS as Record<string, TopPost[]>)[a.handle.replace("@", "").toLowerCase()] ?? []) {
    topByKey.set(`${a.id}-${post.shortCode}`, { post, advisor: a });
  }
}

/** The page a path belongs to: its own row, else its nearest listed parent, else the site. */
export function pageName(path: string): string | null {
  for (let p = path.replace(/\/+$/, "") || "/"; p; p = p.slice(0, p.lastIndexOf("/"))) {
    if (PAGES[p]) return PAGES[p];
  }
  return null;
}

export function previewFor(path: string, query: URLSearchParams, origin = ORIGIN): Preview {
  const abs = (p?: string) => (p && p.startsWith("/") && !p.startsWith("//") ? `${origin}${p}` : `${origin}${SITE_CARD}`);
  const post = (title: string, description: string, picture?: string): Preview => ({
    title: clip(title, 90) || SITE_NAME,
    description: clip(description, 200) || SITE_DESCRIPTION,
    image: abs(picture),
    ownCard: !picture,
  });
  const seg = path.replace(/\/+$/, "").split("/");
  let id = "";
  try {
    id = decodeURIComponent(seg[2] ?? "");
  } catch {
    // a broken % code (a link cut short in a chat) names no post, so the page's card shows
  }

  if (path === "/swipe") {
    const tab = query.get("tab");
    const story = tab === "news" && stories.find((s) => s.id === query.get("story"));
    if (story) return post(story.title, story.gist, story.clipping);
    const ad = tab === "ads" && ads.find((a) => a.adId === query.get("ad"));
    if (ad) return post(ad.headline ? `${ad.advertiser}: ${ad.headline}` : `${ad.advertiser} ad`, ad.body, ad.image);
    const top = topByKey.get(query.get("post") ?? "");
    if (top) return post(`${top.advisor.name} (${top.advisor.handle})`, top.post.caption || top.post.idea?.hook || "", top.post.cover);
  }
  if (path === "/trends") {
    const trend = trends.find((t) => t.id === query.get("trend"));
    if (trend) return post(trend.title, trend.why_it_works ?? "");
  }
  if (seg[1] === "inspiration" && seg.length === 3) {
    const ex = examples.find((e) => e.id === id);
    if (ex) return post(ex.hook, ex.content);
  }
  if (seg[1] === "profiles" && seg.length === 3) {
    const a = advisors.find((x) => x.id === id);
    if (a) return post(`${a.name} (${a.handle})`, a.why_follow ?? "");
  }

  const name = pageName(path);
  return { title: name ?? SITE_NAME, description: SITE_DESCRIPTION, image: `${origin}${SITE_CARD}`, ownCard: true };
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The whole bare page a crawler gets. `url` is the shared link, printed escaped as og:url. */
export function headHtml(p: Preview, url: string): string {
  const t = esc(p.title);
  const full = esc(p.title === SITE_NAME ? SITE_NAME : `${p.title} | ${SITE_NAME}`);
  const d = esc(p.description);
  const u = esc(url);
  const img = esc(p.image);
  const size = p.ownCard ? `\n<meta property="og:image:width" content="1200" />\n<meta property="og:image:height" content="630" />` : "";
  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8" />
<title>${full}</title>
<meta name="description" content="${d}" />
<meta name="robots" content="noindex" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="${SITE_NAME}" />
<meta property="og:title" content="${t}" />
<meta property="og:description" content="${d}" />
<meta property="og:url" content="${u}" />
<meta property="og:image" content="${img}" />${size}
<meta property="og:image:alt" content="${t}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${t}" />
<meta name="twitter:description" content="${d}" />
<meta name="twitter:image" content="${img}" />
</head><body><a href="${u}">${t}</a></body></html>`;
}

/** The preview fetchers vercel.json sends to api/page-og (the test checks the regex there matches this list). */
export const PREVIEW_BOTS = [
  "facebookexternalhit",
  "WhatsApp",
  "TelegramBot",
  "Twitterbot",
  "Slackbot",
  "LinkedInBot",
  "Discordbot",
  "SkypeUriPreview",
  "MicrosoftPreview",
  "Google-PageRenderer",
  "redditbot",
  "Embedly",
  "Iframely",
  "Pinterestbot",
];
