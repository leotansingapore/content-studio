// Every linkable page and the state it can carry, so a param name lives in one place. "Copy link" buttons,
// in-app navigation that carries state and the tests build URLs here. The contract for jobs outside the app
// (Telegram, Lark, email) is docs/deep-links.md: change both together, and never rename a shipped param.

/** Production host, for links sent outside the app. */
export const APP_ORIGIN = "https://consultant-content-studio.vercel.app";

type Val = string | number | boolean | undefined | null;

const qs = (o: Record<string, Val>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== false && v !== "") p.set(k, String(v));
  const s = p.toString().replace(/%2C/g, ",");
  return s ? `?${s}` : "";
};

/** A business chip's label as it appears in links: "Team posts" -> "team-posts". */
export const slug = (label: string) =>
  label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const list = (values?: string[]) => (values?.length ? values.join(",") : undefined);

export type CalendarView = "month" | "week" | "upcoming";
export type AnalyticsPeriod = "7d" | "30d" | "90d" | "all";
export type PostStatus = "scheduled" | "posted";

export const links = {
  plan: (o: { view?: "plan" | "setup"; competitor?: string } = {}) =>
    `/plan${qs({ view: o.view !== "plan" && o.view, competitor: o.competitor })}`,
  calendar: (
    o: {
      view?: CalendarView;
      /** "all", "team-posts" or a business slug (see slug()). */
      business?: string;
      platform?: string;
      status?: PostStatus;
      /** YYYY-MM, the month the month view shows. */
      month?: string;
      /** YYYY-MM-DD, the Monday of the week the week view shows. */
      week?: string;
      /** YYYY-MM-DD, opens that day's panel. */
      day?: string;
      teampost?: string;
      post?: string;
      feed?: string;
    } = {},
  ) =>
    `/calendar${qs({
      view: o.view !== "month" && o.view,
      business: o.business,
      platform: o.platform !== "all" && o.platform,
      status: o.status,
      month: o.month,
      week: o.week,
      day: o.day,
      teampost: o.teampost,
      post: o.post,
      feed: o.feed,
    })}`,
  board: (o: { business?: string; feed?: string } = {}) => `/board${qs({ business: o.business, feed: o.feed })}`,
  drafts: (
    o: { status?: "draft" | PostStatus; platform?: string; pillar?: string; label?: string; q?: string; review?: string } = {},
  ) =>
    `/drafts${qs({
      status: o.status,
      platform: o.platform !== "all" && o.platform,
      pillar: o.pillar !== "all" && o.pillar,
      label: o.label !== "all" && o.label,
      q: o.q?.trim(),
      review: o.review,
    })}`,
  grid: () => "/grid",
  reels: (
    o: {
      brand?: string;
      /** feed is the Posts view, the default (a job may still name it, to beat a remembered board or grid). */
      view?: "feed" | "board" | "grid";
      /** The Posts view's stage chip; a card link without it lands on the card's own stage. */
      stage?: "review" | "changes" | "approved" | "scheduled" | "posted" | "archived" | "all";
      archived?: boolean;
      card?: string;
      t?: number;
      slide?: number;
    } = {},
  ) =>
    `/reels${qs({ brand: o.brand, view: o.view, stage: o.stage !== "review" && o.stage, archived: o.archived && "show", card: o.card, t: o.t, slide: o.slide })}`,

  // ---- Grow, Discover and settings pages ----
  // Multi-selects take URL values (slugs, see slug()) and join as a comma list; defaults are left out.
  inspiration: (o: { q?: string; pillar?: string[]; platform?: string[]; format?: string[]; audience?: string[]; saved?: boolean } = {}) =>
    `/inspiration${qs({ q: o.q?.trim(), pillar: list(o.pillar), platform: list(o.platform), format: list(o.format), audience: list(o.audience), saved: o.saved && "only" })}`,
  inspirationPost: (id: string) => `/inspiration/${encodeURIComponent(id)}`,
  profiles: (o: { q?: string; company?: string[]; platform?: string[]; audience?: string[]; niche?: string[]; saved?: boolean } = {}) =>
    `/profiles${qs({ q: o.q?.trim(), company: list(o.company), platform: list(o.platform), audience: list(o.audience), niche: list(o.niche), saved: o.saved && "only" })}`,
  profile: (id: string) => `/profiles/${encodeURIComponent(id)}`,
  swipe: (
    o: {
      tab?: "posts" | "news" | "ads";
      q?: string;
      format?: string;
      from?: string;
      /** A posts topic on the posts tab, a news topic with tab "news". */
      topic?: string;
      angle?: string;
      audience?: string;
      sort?: string;
      saved?: boolean;
      /** A top post's key, <advisorId>-<shortCode>: opens it. */
      post?: string;
      industry?: string;
    } = {},
  ) =>
    `/swipe${qs({
      tab: o.tab !== "posts" && o.tab,
      q: o.q?.trim(),
      format: o.format !== "all" && o.format,
      from: o.from !== "all" && o.from,
      topic: o.topic !== "all" && o.topic,
      angle: o.angle !== "all" && o.angle,
      audience: o.audience !== "all" && o.audience,
      sort: o.sort,
      saved: o.saved && "only",
      post: o.post,
      industry: o.industry !== "all" && o.industry,
    })}`,
  trends: (o: { platform?: string; type?: string; trend?: string } = {}) =>
    `/trends${qs({ platform: o.platform !== "all" && o.platform, type: o.type !== "all" && o.type, trend: o.trend })}`,
  analytics: (o: { period?: AnalyticsPeriod; by?: string; time?: string; rank?: string } = {}) =>
    `/analytics${qs({ period: o.period !== "30d" && o.period, by: o.by !== "platform" && o.by, time: o.time !== "all" && o.time, rank: o.rank !== "engagements" && o.rank })}`,
  trackedLinks: (o: { period?: "7d" | "30d" } = {}) => `/links${qs({ period: o.period !== "30d" && o.period })}`,
  engage: (o: { tool?: string } = {}) => `/recruit/engage${qs({ tool: o.tool !== "replies" && o.tool })}`,
  autoDm: (o: { log?: string; status?: "all" | "sent" | "skipped" | "failed"; edit?: string; keyword?: string } = {}) =>
    `/recruit/auto-dm${qs({ log: o.log, status: o.status !== "all" && o.status, edit: o.edit, keyword: o.keyword })}`,
  team: (o: { status?: string; from?: string; to?: string } = {}) =>
    `/team${qs({ status: o.status !== "pending" && o.status, from: o.from, to: o.to })}`,
  hubGuides: (o: { category?: string } = {}) => `/hub/guides${qs({ category: o.category })}`,
  hubTrends: (o: { niche?: string } = {}) => `/hub/trends${qs({ niche: o.niche })}`,
  hubAdmin: (o: { tab?: "clients" | "posts" | "members" } = {}) => `/hub/admin${qs({ tab: o.tab !== "clients" && o.tab })}`,

  // ---- Create pages (wave 2A) ----
  /** Write. draft/step/panel are live state; the rest pre-fill the brief once and leave the URL (docs "Still read"). */
  generate: (
    o: {
      draft?: string;
      step?: WriteStep;
      panel?: "shortcuts" | "post";
      day?: string;
      /** HH:MM, with day: an open posting slot's exact time. */
      time?: string;
      profile?: string;
      ask?: string;
      vibe?: string;
      pillar?: string;
      detail?: string;
      audience?: string;
      format?: string;
      platform?: string;
      cta?: string;
      funnel?: string;
      /** The idea source (real-question, ...), not the idea text: that is `detail`. */
      idea?: string;
      ctx?: string;
      ref?: string;
      formula?: string;
      /** A remix source key (remixSource.ts sourceKey): Leo's sessions show it as the "Remixing ..." chip. */
      source?: string;
    } = {},
  ) => `/generate${qs({ ...o, step: o.step !== "topic" && o.step })}`,
  batch: (o: { pillar?: string; audience?: string } = {}) =>
    `/generate/batch${qs({ pillar: o.pillar !== "topic" && o.pillar, audience: o.audience !== "general" && o.audience })}`,
  carousel: (o: { tab?: "drafts" | "paste" | "topic" | "saved"; draft?: string; carousel?: string } = {}) =>
    `/carousel${qs({ tab: o.tab !== "drafts" && o.tab, draft: o.draft, carousel: o.carousel })}`,
  edit: (
    o: {
      /** A video project id; projects live on one device. */
      p?: string;
      tab?: EditTab;
      mode?: "fix" | "cut";
      sticker?: string;
      broll?: string;
      guide?: "instagram" | "tiktok";
      /** Start screen panels: join, ai, or both. */
      panel?: ("join" | "ai")[];
      kind?: "template" | "montage" | "avatar" | "explainer";
      template?: string;
    } = {},
  ) =>
    `/edit${qs({
      p: o.p,
      tab: o.tab !== "style" && o.tab,
      mode: o.mode !== "fix" && o.mode,
      sticker: o.sticker,
      broll: o.broll,
      guide: o.guide,
      panel: o.panel?.join(","),
      kind: o.kind,
      template: o.template,
    })}`,
  clone: (o: { url?: string; clone?: string } = {}) => `/clone${qs({ url: o.url, clone: o.clone })}`,
  coach: (o: { report?: string; view?: "quiz"; section?: "idea-dump" } = {}) =>
    `/coach${qs({ report: o.report, view: o.view })}${o.section ? `#${o.section}` : ""}`,
  voice: () => "/voice",
  media: (o: { q?: string; folder?: string } = {}) => `/media${qs({ q: o.q?.trim(), folder: o.folder })}`,
  brand: (o: { section?: BrandSection } = {}) => `/brand${o.section ? `#${o.section}` : ""}`,
  createGuide: (o: { step?: GuideStep } = {}) => `/create-guide${o.step ? `#${o.step}` : ""}`,
  tutorial: (o: { section?: TutorialSection } = {}) => `/tutorial${o.section ? `#${o.section}` : ""}`,
  playbook: () => "/playbook",
  academy: (o: { lesson?: string } = {}) => `/academy${qs({ lesson: o.lesson })}`,
  // ---- end Create pages ----
  /** The slideshow editor (Leo only): s opens one (push); slide is 1-based; slide 1 and the Slide tab are left out. */
  slideshow: (o: { s?: string; slide?: number; panel?: "text" | "overlay"; box?: string; view?: "original" } = {}) =>
    `/slideshow${qs({ s: o.s, slide: o.slide !== 1 && o.slide, panel: o.panel, box: o.box, view: o.view })}`,
};

/** Any page with the Remix sheet open over it on that source (remix=<key>, push). */
export const withRemix = (path: string, key: string) => path + (path.includes("?") ? "&" : "?") + "remix=" + encodeURIComponent(key);

/** An app path as a full URL: this host in the browser, production elsewhere (a job, a test). */
export const absolute = (path: string) =>
  `${typeof window !== "undefined" && window.location?.origin?.startsWith("http") ? window.location.origin : APP_ORIGIN}${path}`;

// ---- Create pages (wave 2A): the values their params and #sections take.
export const WRITE_STEPS = ["topic", "funnel", "idea", "format"] as const;
export type WriteStep = (typeof WRITE_STEPS)[number];
export const EDIT_TABS = ["style", "cuts", "frame", "face", "stickers", "broll", "words"] as const;
export type EditTab = (typeof EDIT_TABS)[number];
export type BrandSection = "you" | "dm-links" | "offers" | "emoji-and-hashtags" | "avoid-words" | "colour" | "sign-off" | "posting-times" | "logo";
export type GuideStep = "idea" | "draft" | "carousel" | "reel" | "reverse-engineer" | "compliance" | "schedule";
export type TutorialSection = "why" | "voice" | "guided-flow" | "after" | "tabs" | "rules" | "rhythm" | "first-action";
// ---- end Create pages ----
