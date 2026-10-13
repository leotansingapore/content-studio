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

export type CalendarView = "month" | "week" | "upcoming";
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
  reels: (o: { brand?: string; view?: "board" | "grid"; archived?: boolean; card?: string; t?: number; slide?: number } = {}) =>
    `/reels${qs({ brand: o.brand, view: o.view, archived: o.archived && "show", card: o.card, t: o.t, slide: o.slide })}`,
};

/** An app path as a full URL: this host in the browser, production elsewhere (a job, a test). */
export const absolute = (path: string) =>
  `${typeof window !== "undefined" && window.location?.origin?.startsWith("http") ? window.location.origin : APP_ORIGIN}${path}`;
