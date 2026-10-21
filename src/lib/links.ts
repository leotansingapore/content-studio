// Every linkable page and the state it can carry, so a param name lives in one place. "Copy link" buttons,
// in-app navigation that carries state and the tests build URLs here. The contract for jobs outside the app
// (Telegram, Lark, email) is docs/deep-links.md: change both together, and never rename a shipped param.

import type { FormatKind } from "@/data/formats";
import type { LibraryFormat, LibraryStatus } from "@/lib/library";

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
      stage?: "review" | "changes" | "approved" | "scheduled" | "posted" | "archived" | "all" | "notes";
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
  /** sort=for-you (Leo only, with a Plan positioning); the tier sections are the default, left out. */
  profiles: (
    o: { q?: string; company?: string[]; platform?: string[]; audience?: string[]; niche?: string[]; saved?: boolean; sort?: "for-you" } = {},
  ) =>
    `/profiles${qs({ q: o.q?.trim(), company: list(o.company), platform: list(o.platform), audience: list(o.audience), niche: list(o.niche), saved: o.saved && "only", sort: o.sort })}`,
  /** works: scrolls to "What works for them" (#works). */
  profile: (id: string, o: { works?: boolean } = {}) => `/profiles/${encodeURIComponent(id)}${o.works ? "#works" : ""}`,
  /** foryou, search and hooks are Leo's tabs (phase 2); each tab reads the shared params with its own allowed list. */
  swipe: (
    o: {
      tab?: "posts" | "news" | "ads" | "foryou" | "search" | "hooks";
      q?: string;
      format?: string;
      from?: string;
      /** A posts topic on the posts tab, a news topic with tab "news". */
      topic?: string;
      angle?: string;
      audience?: string;
      /** Left out when it is the tab's default: reach on search, relevant on ads. */
      sort?: string;
      saved?: boolean;
      /** A top post's key, <advisorId>-<shortCode>: opens it. */
      post?: string;
      industry?: string;
      /** With tab "news": a story's id, scrolled to and marked. */
      story?: string;
      /** With tab "ads": an ad's id, scrolled to, marked and read in full; Leo's sign-ins open its drawer. */
      ad?: string;
      /** For you: organic posts or ads only. */
      kind?: "all" | "organic" | "ads";
      /** For you: the hidden cards only. */
      hidden?: boolean;
      /** Ads: a competitor id, space or sg. */
      scope?: string;
      /** Ads: a hook family id (_shared/tags.ts HOOK_FAMILIES). */
      hook?: string;
      running?: boolean;
      /** Ads: running at least this many days. */
      run?: "7" | "30" | "90";
      /** Ads: facebook, instagram, messenger, threads; search: tiktok, youtube. */
      platform?: string;
      emotion?: string;
      /** Search: posted in the last 30 days or any time; 90d is the default, left out. */
      posted?: "30d" | "90d" | "any";
      /** Hooks: a psychology id (_shared/tags.ts PSYCHOLOGY). */
      why?: string;
      /** Hooks: a hook formula id. */
      formula?: string;
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
      sort: !(o.tab === "search" && o.sort === "reach") && !(o.tab === "ads" && o.sort === "relevant") && o.sort,
      saved: o.saved && "only",
      post: o.post,
      industry: o.industry !== "all" && o.industry,
      story: o.story,
      kind: o.kind !== "all" && o.kind,
      hidden: o.hidden && "only",
      scope: o.scope !== "all" && o.scope,
      hook: o.hook !== "all" && o.hook,
      running: o.running && "only",
      run: o.run,
      platform: o.platform !== "all" && o.platform,
      emotion: o.emotion !== "all" && o.emotion,
      posted: o.posted !== "90d" && o.posted,
      why: o.why !== "all" && o.why,
      formula: o.formula !== "all" && o.formula,
      ad: o.ad,
    })}`,
  /**
   * view: Leo's search, hashtags and formats views (kits is the default, left out); show filters the search view; topic
   * and tag open a drawer (push). The formats view filters by kind (all left out) and opens a card by template (push).
   */
  trends: (
    o: {
      platform?: string;
      type?: string;
      trend?: string;
      view?: "kits" | "search" | "hashtags" | "formats";
      show?: "rising" | "gap";
      topic?: string;
      tag?: string;
      kind?: "all" | "slideshow" | "wall-of-text";
      template?: string;
    } = {},
  ) =>
    `/trends${qs({
      view: o.view !== "kits" && o.view,
      platform: o.platform !== "all" && o.platform,
      type: o.type !== "all" && o.type,
      trend: o.trend,
      show: o.show,
      topic: o.topic,
      tag: o.tag,
      kind: o.kind !== "all" && o.kind,
      template: o.template,
    })}`,
  /** ?post=<platform>:<post id>: a followed account's post, scrolled to and marked. account=<platform>:<handle> with view=patterns opens What worked (push). */
  following: (o: { post?: string; account?: string; view?: "patterns" } = {}) =>
    `/following${qs({ post: o.post, account: o.account, view: o.view })}`,
  /** Competitors (Leo only). ads is the default view once a competitor exists, left out; edit and ad open an item (push). */
  competitors: (
    o: {
      view?: "ads" | "posts" | "list";
      /** With view=list: a competitor id, its editor open. */
      edit?: string;
      /** One competitor's pill. */
      c?: string;
      running?: boolean;
      platform?: "instagram" | "tiktok";
      /** Posts: the outlier order is the default, left out. */
      sort?: "views" | "newest";
      /** With view=posts: <platform>:<post id>, scrolled to and marked (push). */
      post?: string;
      /** An ad's Library id: its drawer open. */
      ad?: string;
    } = {},
  ) =>
    `/competitors${qs({
      view: o.view !== "ads" && o.view,
      edit: o.edit,
      c: o.c,
      running: o.running && "only",
      platform: o.platform,
      sort: o.sort,
      post: o.post,
      ad: o.ad,
    })}`,
  /** Saved (Leo only). Filters replace; item opens one (push), breakdown scrolls to its Breakdown (#breakdown). */
  saved: (
    o: {
      /** A board id, or unsorted; all boards is the default. */
      board?: string;
      platform?: "instagram" | "tiktok" | "youtube" | "ad" | "link";
      q?: string;
      item?: string;
      hook?: string;
      angle?: string;
      topic?: string;
      emotion?: string;
      audience?: string;
      format?: string;
      breakdown?: boolean;
    } = {},
  ) =>
    `/saved${qs({
      board: o.board,
      platform: o.platform,
      q: o.q?.trim(),
      hook: o.hook !== "all" && o.hook,
      angle: o.angle !== "all" && o.angle,
      topic: o.topic !== "all" && o.topic,
      emotion: o.emotion !== "all" && o.emotion,
      audience: o.audience !== "all" && o.audience,
      format: o.format !== "all" && o.format,
      item: o.item,
    })}${o.item && o.breakdown ? "#breakdown" : ""}`,
  /** Home; what-moved scrolls to the What moved card. */
  home: (o: { section?: "what-moved" } = {}) => `/home${o.section ? `#${o.section}` : ""}`,
  /** Your market (Leo only). post=<platform>:<post id> shows that competitor post under either chip, scrolled to. */
  market: (o: { show?: "act" | "all"; view?: "digest" | "setup"; post?: string } = {}) =>
    `/market${qs({ show: o.show !== "act" && o.show, view: o.view !== "digest" && o.view, post: o.post })}`,
  /** audit=<platform>:<post id>: one of your own posts from the account audit, shown on top of that account's audit. */
  analytics: (o: { period?: AnalyticsPeriod; by?: string; time?: string; rank?: string; audit?: string } = {}) =>
    `/analytics${qs({ period: o.period !== "30d" && o.period, by: o.by !== "platform" && o.by, time: o.time !== "all" && o.time, rank: o.rank !== "engagements" && o.rank, audit: o.audit })}`,
  trackedLinks: (o: { period?: "7d" | "30d" } = {}) => `/links${qs({ period: o.period !== "30d" && o.period })}`,
  engage: (o: { tool?: string } = {}) => `/recruit/engage${qs({ tool: o.tool !== "replies" && o.tool })}`,
  autoDm: (o: { log?: string; status?: "all" | "sent" | "skipped" | "failed"; edit?: string; keyword?: string } = {}) =>
    `/recruit/auto-dm${qs({ log: o.log, status: o.status !== "all" && o.status, edit: o.edit, keyword: o.keyword })}`,
  /** post=<submission id> opens the review list that holds it (leaders) or marks it in Your submissions. */
  team: (o: { status?: string; from?: string; to?: string; post?: string } = {}) =>
    `/team${qs({ status: o.status !== "pending" && o.status, from: o.from, to: o.to, post: o.post })}`,
  hubGuides: (o: { category?: string } = {}) => `/hub/guides${qs({ category: o.category })}`,
  hubTrends: (o: { niche?: string; trend?: string } = {}) => `/hub/trends${qs({ niche: o.niche, trend: o.trend })}`,
  hubAdmin: (o: { tab?: "clients" | "posts" | "members" } = {}) => `/hub/admin${qs({ tab: o.tab !== "clients" && o.tab })}`,

  // ---- Create pages (wave 2A) ----
  /**
   * Write. draft/step/panel/network/view/hooks are live state; the rest pre-fill the brief once and leave the URL (docs
   * "Still read"). panel=thread and view=prompter push; network (threads left out) and hooks (formulas left out) replace.
   */
  generate: (
    o: {
      draft?: string;
      step?: WriteStep;
      panel?: "shortcuts" | "post" | "thread";
      /** With panel=thread: the thread's network. */
      network?: "threads" | "x";
      /** The teleprompter over a short-video draft. */
      view?: "prompter";
      /** The hook card's tab: hook formulas, or the lines proven in your niche. */
      hooks?: "formulas" | "proven";
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
      /** A remixed post's compare strip (Leo only): the Original or More like this tab; your version is the default. */
      compare?: CompareView;
    } = {},
  ) => `/generate${qs({ ...o, step: o.step !== "topic" && o.step, network: o.network !== "threads" && o.network, hooks: o.hooks !== "formulas" && o.hooks })}`,
  batch: (o: { pillar?: string; audience?: string } = {}) =>
    `/generate/batch${qs({ pillar: o.pillar !== "topic" && o.pillar, audience: o.audience !== "general" && o.audience })}`,
  /** design (clean left out), size (4x5 left out), view and slide (1 left out) replace. */
  carousel: (
    o: {
      tab?: "drafts" | "paste" | "topic" | "saved";
      draft?: string;
      carousel?: string;
      compare?: CompareView;
      design?: CarouselDesign;
      size?: "4x5" | "1x1" | "9x16";
      /** One slide at a time, or the list. Neither is left out: phones default to one, large screens to all. */
      view?: "one" | "all";
      /** The open slide, 1-based, with view=one. */
      slide?: number;
    } = {},
  ) =>
    `/carousel${qs({
      tab: o.tab !== "drafts" && o.tab,
      draft: o.draft,
      carousel: o.carousel,
      compare: o.compare,
      design: o.design !== "clean" && o.design,
      size: o.size !== "4x5" && o.size,
      view: o.view,
      slide: o.slide !== 1 && o.slide,
    })}`,
  edit: (
    o: {
      /** A video project id; projects live on one device. */
      p?: string;
      tab?: EditTab;
      mode?: "fix" | "cut";
      sticker?: string;
      broll?: string;
      guide?: "instagram" | "tiktok";
      /** Start screen panels: join, ai, wall (Words over a video), own (Your own video or pictures), clips (Long video into clips), or several. wall, own and clips are Leo only. */
      panel?: ("join" | "ai" | "wall" | "own" | "clips")[];
      kind?: "template" | "montage" | "avatar" | "explainer";
      template?: string;
      // The rest are Leo only, read by the AI panel's kinds and the own and clips panels.
      /** You speaking's format (plain left out). */
      talk?: "plain" | "news" | "stage" | "spokesperson";
      /** A brand kit offer's place: fills the template's "Your product" once, then leaves the address. */
      offer?: number;
      /** The explainer's look (photo left out). */
      look?: ExplainerLook;
      /** Where the narrated video starts (topic left out). */
      from?: "topic" | "script" | "link" | "draft";
      /** Pre-fills read once: the topic, an article link. */
      topic?: string;
      link?: string;
      /** A post id: its script or words fill the panel. */
      draft?: string;
      /** The narrated video's length (30 left out). */
      secs?: 30 | 60;
      /** Stock first, or AI pictures (stock left out). */
      visuals?: "stock" | "ai";
      /** What it is about, for the own and clips panels (read once). */
      about?: string;
      /** The clips' length (auto left out). */
      len?: "auto" | "short" | "long";
      /** A YouTube link for the clips panel. */
      yt?: string;
      /** clips: scrolls to the long video's clip list (#clips). */
      section?: "clips";
      /** A words-over-video project with all the editing tools instead of its short panel. */
      view?: "all";
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
      talk: o.talk !== "plain" && o.talk,
      offer: o.offer,
      look: o.look !== "photo" && o.look,
      from: o.from !== "topic" && o.from,
      topic: o.topic?.trim(),
      link: o.link,
      draft: o.draft,
      secs: o.secs !== 30 && o.secs,
      visuals: o.visuals !== "stock" && o.visuals,
      about: o.about?.trim(),
      len: o.len !== "auto" && o.len,
      yt: o.yt,
      view: o.view,
    })}${o.section ? `#${o.section}` : ""}`,
  /** source=<link:|upload: key> reopens a source read on Leo's Remix a post (push). */
  clone: (o: { url?: string; clone?: string; source?: string } = {}) => `/clone${qs({ url: o.url, clone: o.clone, source: o.source })}`,
  coach: (o: { report?: string; view?: "quiz"; section?: "idea-dump" } = {}) =>
    `/coach${qs({ report: o.report, view: o.view })}${o.section ? `#${o.section}` : ""}`,
  voice: () => "/voice",
  /** item=<picture key> scrolls to and marks that picture. */
  media: (o: { q?: string; folder?: string; item?: string } = {}) => `/media${qs({ q: o.q?.trim(), folder: o.folder, item: o.item })}`,
  brand: (o: { section?: BrandSection } = {}) => `/brand${o.section ? `#${o.section}` : ""}`,
  createGuide: (o: { step?: GuideStep } = {}) => `/create-guide${o.step ? `#${o.step}` : ""}`,
  tutorial: (o: { section?: TutorialSection } = {}) => `/tutorial${o.section ? `#${o.section}` : ""}`,
  playbook: () => "/playbook",
  academy: (o: { lesson?: string } = {}) => `/academy${qs({ lesson: o.lesson })}`,
  // ---- end Create pages ----
  /** The slideshow editor (Leo only): s opens one (push); slide is 1-based; slide 1 and the Slide tab are left out. */
  slideshow: (o: { s?: string; slide?: number; panel?: "text" | "overlay"; box?: string; view?: "original" } = {}) =>
    `/slideshow${qs({ s: o.s, slide: o.slide !== 1 && o.slide, panel: o.panel, box: o.box, view: o.view })}`,
  /** Everything made (Leo only): format, status and q replace; panel=making opens the Making now sheet on phones (push). */
  library: (o: { format?: LibraryFormat; status?: LibraryStatus; q?: string; panel?: "making" } = {}) =>
    `/library${qs({ format: o.format, status: o.status, q: o.q?.trim(), panel: o.panel })}`,
  /** A format's create page (Leo only, src/data/formats.ts): source, from, mention=no and the format's own params. Making on arrival is navigation state { go: true }, never a param. */
  makeFormat: (slug: string, p: Record<string, string | number | undefined> = {}) => `/make/${encodeURIComponent(slug)}${qs(p)}`,
  /** The format gallery (Leo only): kind (all left out) and needs=none replace. */
  make: (o: { kind?: FormatKind | "all"; needsNone?: boolean } = {}) => `/make${qs({ kind: o.kind !== "all" && o.kind, needs: o.needsNone && "none" })}`,
  /** The Image page (Leo only): layout (headline left out) and size (4x5 left out) replace; source is read once, then removed; image opens a saved design (replace). */
  image: (o: { layout?: ImageLayout; size?: "4x5" | "1x1" | "9x16" | "wide"; source?: string; image?: string } = {}) =>
    `/image${qs({ layout: o.layout !== "headline" && o.layout, size: o.size !== "4x5" && o.size, source: o.source, image: o.image })}`,
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
/** A remixed post's compare strip on Write and the carousel maker (?compare=); version is the default, left out. */
export const COMPARE_TABS = ["version", "original", "more"] as const;
export type CompareView = Exclude<(typeof COMPARE_TABS)[number], "version">;
// ---- end Create pages ----

// ---- North star phase 3 (Leo only): the values the format params take.
/** /image?layout=: four ad layouts, then the five meme layouts. */
export const IMAGE_LAYOUTS = ["headline", "quote", "stat", "testimonial", "top-bottom", "nobody-me", "expectation", "pov", "post-reaction"] as const;
export type ImageLayout = (typeof IMAGE_LAYOUTS)[number];
/** /edit?look=: the explainer's looks (ai-video EXPLAINER_LOOKS holds the same ids). */
export const EXPLAINER_LOOK_IDS = ["photo", "clay", "paper", "felt", "chalk", "comic", "cartoon3d", "storybook"] as const;
export type ExplainerLook = (typeof EXPLAINER_LOOK_IDS)[number];
/** /carousel?design=. */
export const CAROUSEL_DESIGNS = ["clean", "bold", "numbered", "checklist", "post-card", "photo-cover", "quote", "notebook"] as const;
export type CarouselDesign = (typeof CAROUSEL_DESIGNS)[number];
