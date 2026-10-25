// The studio's whole navigation in one place, shaped after Fastlane (docs/fastlane-nav-gap.md): one sidebar lists
// the sections, and the open section's pages are tabs at the top of the page (SectionTabs, in the shell). A section
// whose pages carry `group`s shows the groups as tabs and the open group's pages as chips under them. Phones get a
// bottom bar plus a More sheet. Adding a page = adding it to one section here.
import {
  BarChart3,
  BookMarked,
  Bookmark,
  Clapperboard,
  Flame,
  Gauge,
  GraduationCap,
  History,
  Home,
  Lightbulb,
  MessageSquare,
  MessageSquarePlus,
  CalendarClock,
  Command,
  Link2,
  ListChecks,
  MousePointerClick,
  Plug,
  Share2,
  Zap,
  ClipboardCheck,
  Columns3,
  Settings,
  Radar,
  Sparkles,
  Star,
  Swords,
  Target,
  TrendingUp,
  UserCheck,
  UserPlus,
  Users,
  Wand2,
  type LucideIcon,
} from "lucide-react";
import { ownerShown, reelsShown } from "@/lib/reelsBoard";
import { LEO_EMAILS } from "@/lib/leoOnly";
import { marketShown } from "@/lib/market";
import { socialConnectShown } from "@/lib/socialConnect";

export type NavPage = {
  to: string;
  label: string;
  /** Light up only on this exact path, not its children. */
  end?: boolean;
  /** Shown only to these sign-ins. */
  owners?: string[];
  /** Shown only while this says so (an answer this device remembers from the server). */
  show?: () => boolean;
  /** Browser tab title when it should differ from the label. */
  title?: string;
  /** Phone More-sheet tile icon; falls back to the section's. */
  icon?: LucideIcon;
  /** The tab this page sits under; pages after it share it until the next one. */
  group?: string;
  /** No section tabs on this page. */
  bare?: boolean;
  /** Its deeper addresses (/fads/positioning) are tabs of the page itself, so the row stays over them. */
  subTabs?: boolean;
  /** The line under its tile on an index page (Settings), 12 words at most. */
  hint?: string;
};

export type NavSection = {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Where the sidebar item lands on the first visit. */
  to: string;
  pages: NavPage[];
  /** Pinned to the foot of the sidebar. */
  foot?: boolean;
  /** The first page lists the others as tiles; they get a way back to it instead of tabs (Fastlane's Settings). */
  index?: boolean;
};

// Leo 2026-10-24: "matches the fastlane". Fastlane's five (Home, Strategy, Studio, Radar, Analytics) plus Grow, which
// Fastlane has no twin for; Brand, Learn, Feedback and Settings sit at the foot. Section ids are kept from the old nav
// (plan = Strategy, write = Studio, recruit = Grow, playbook = Brand); find and analytics are new.
export const SECTIONS: NavSection[] = [
  {
    id: "home",
    label: "Home",
    icon: Home,
    to: "/home",
    pages: [
      // Fastlane's Home has no tabs: the agent's chats are in the sidebar and North star in the account menu.
      { to: "/home", label: "Overview", title: "Home", bare: true },
      { to: "/agent", label: "Agent", icon: MessageSquare, owners: LEO_EMAILS, bare: true },
      { to: "/north-star", label: "North star", icon: Star, owners: LEO_EMAILS, bare: true },
    ],
  },
  {
    id: "plan",
    label: "Strategy",
    icon: Target,
    to: "/plan",
    pages: [
      { to: "/plan", label: "Plan", icon: Target },
      { to: "/ideas", label: "Ideas", icon: Lightbulb, owners: LEO_EMAILS },
      { to: "/campaigns", label: "Campaigns", icon: Columns3, owners: LEO_EMAILS },
      { to: "/calendar", label: "Calendar", icon: CalendarClock },
    ],
  },
  {
    id: "write",
    label: "Studio",
    icon: Wand2,
    to: "/studio",
    pages: [
      { to: "/studio", label: "Overview", title: "Studio", group: "Overview" },
      { to: "/generate", label: "Post", end: true, title: "Write a post", group: "Create" },
      { to: "/make", label: "Formats", owners: LEO_EMAILS },
      { to: "/generate/batch", label: "Batch" },
      { to: "/carousel", label: "Carousel" },
      { to: "/image", label: "Image", owners: LEO_EMAILS },
      { to: "/slideshow", label: "Slideshow", owners: LEO_EMAILS },
      { to: "/edit", label: "Video" },
      { to: "/library", label: "Everything", title: "Library", owners: LEO_EMAILS, group: "Library" },
      { to: "/drafts", label: "All posts", icon: History },
      { to: "/board", label: "Board", icon: Columns3 },
      { to: "/grid", label: "Grid", title: "Instagram grid" },
      { to: "/media", label: "Media" },
      { to: "/reels", label: "Posts board", end: true, show: reelsShown, icon: ClipboardCheck, group: "Review" },
      { to: "/team", label: "Leader approvals", icon: ClipboardCheck },
      { to: "/people", label: "Faces and voices", owners: LEO_EMAILS, group: "Influencers" },
    ],
  },
  {
    id: "find",
    label: "Radar",
    icon: Radar,
    to: "/swipe",
    pages: [
      { to: "/swipe", label: "Top posts", icon: TrendingUp },
      { to: "/trends", label: "Trends", icon: Flame },
      { to: "/clone", label: "Clone a reel", icon: Clapperboard },
      { to: "/inspiration", label: "Inspiration", icon: Lightbulb },
      { to: "/profiles", label: "Creators", icon: Users },
      { to: "/following", label: "Following", icon: UserCheck },
      { to: "/competitors", label: "Competitors", icon: Swords, owners: LEO_EMAILS },
      { to: "/saved", label: "Saved", icon: Bookmark, owners: LEO_EMAILS },
      { to: "/market", label: "Your market", icon: Radar, show: marketShown },
    ],
  },
  {
    id: "recruit",
    label: "Grow",
    icon: UserPlus,
    to: "/recruit",
    pages: [
      { to: "/recruit", label: "Brand Brain", end: true },
      { to: "/recruit/conversations", label: "Conversations" },
      { to: "/recruit/agent", label: "AI agent" },
      { to: "/recruit/engage", label: "Reply drafts" },
      { to: "/recruit/auto-dm", label: "Auto-DM", show: socialConnectShown },
    ],
  },
  {
    id: "analytics",
    label: "Analytics",
    icon: BarChart3,
    to: "/analytics",
    pages: [
      { to: "/analytics", label: "Analytics" },
      { to: "/coach", label: "Coach", icon: Gauge },
    ],
  },
  {
    id: "playbook",
    label: "Brand",
    icon: BookMarked,
    to: "/playbook",
    foot: true,
    pages: [
      { to: "/playbook", label: "My Playbook" },
      { to: "/voice", label: "Your voice" },
      { to: "/brand", label: "Brand kit" },
      { to: "/audiences", label: "Audiences", owners: LEO_EMAILS },
      { to: "/fads", label: "F.A.D.S.", subTabs: true },
    ],
  },
  {
    id: "learn",
    label: "Learn",
    icon: GraduationCap,
    to: "/welcome",
    foot: true,
    pages: [
      { to: "/welcome", label: "Getting started", icon: Sparkles },
      { to: "/academy", label: "Academy" },
      { to: "/create-guide", label: "How to post" },
      { to: "/tutorial", label: "How the studio works" },
    ],
  },
  {
    id: "feedback",
    label: "Feedback",
    icon: MessageSquarePlus,
    to: "/feedback",
    foot: true,
    pages: [{ to: "/feedback", label: "Requests and roadmap", title: "Feedback" }],
  },
  {
    // Fastlane's Settings: an index of tiles under the account menu; each page leads back to it. `group` names a tile
    // group here, not tabs.
    id: "settings",
    label: "Settings",
    icon: Settings,
    to: "/settings",
    foot: true,
    index: true,
    pages: [
      { to: "/settings", label: "Settings", end: true, bare: true },
      { to: "/accounts", label: "Social accounts", icon: Share2, show: socialConnectShown, group: "Connections", hint: "The Instagram and TikTok accounts the studio posts to." },
      { to: "/bio", label: "Link in bio", icon: Link2, hint: "One page of your links for your profile." },
      { to: "/links", label: "Tracked links", icon: MousePointerClick, hint: "Short links that count who clicks." },
      { to: "/connect", label: "Connect Claude", icon: Plug, hint: "Use the studio from a chat with Claude." },
      { to: "/reels/team", label: "Reviewers", icon: UserCheck, show: ownerShown, group: "Your team", hint: "Who approves posts on your posts board." },
      { to: "/activity", label: "Activity", icon: ListChecks, owners: LEO_EMAILS, hint: "Everything that ran, and who ran it." },
      { to: "/automations", label: "Automations", icon: Zap, owners: LEO_EMAILS, group: "The agent", hint: "What runs without you, and its limits." },
      { to: "/skills", label: "Skills", icon: Command, owners: LEO_EMAILS, hint: "Slash commands the agent runs for you." },
    ],
  },
];

export const section = (id: string) => SECTIONS.find((s) => s.id === id)!;

export const pathMatches = (pathname: string, to: string, end = false) =>
  pathname === to || (!end && pathname.startsWith(to + "/"));

export const visiblePages = (pages: NavPage[], email: string) =>
  pages.filter((p) => (!p.owners || p.owners.includes(email.toLowerCase())) && (!p.show || p.show()));

/** Each page carries the group (tab) it sits under, so a group survives its first page being hidden. */
export function groupedPages(pages: NavPage[]): NavPage[] {
  let group: string | undefined;
  return pages.map((p) => ({ ...p, group: (group = p.group ?? group) }));
}

/** The page a path belongs to: the longest matching route, so /generate/batch is Batch, not Post. */
export function pageFor(pathname: string): { section: NavSection; page: NavPage } | null {
  let best: { section: NavSection; page: NavPage } | null = null;
  for (const s of SECTIONS)
    for (const p of s.pages)
      if (pathMatches(pathname, p.to) && (!best || p.to.length > best.page.to.length)) best = { section: s, page: p };
  return best;
}

export const sectionFor = (pathname: string) => pageFor(pathname)?.section ?? null;

export const pageTitle = (pathname: string) => {
  const hit = pageFor(pathname);
  return hit ? `${hit.page.title ?? hit.page.label} - Content Studio` : "Content Studio";
};

export type Tab = { to: string; label: string; end?: boolean; active: boolean };
export type SectionTabs = { tabs: Tab[]; chips: Tab[]; back?: Tab };

/**
 * The tab row at the top of a page: its section's pages, or, when they carry groups, one tab per group (opening the
 * group's first page this sign-in sees) with the open group's pages as chips under it. One of a kind is not a choice,
 * so a row of one is left out; a `bare` page or a detail address under a page gets none, and a page under an `index`
 * section gets a way back instead.
 */
export function sectionTabs(pathname: string, email: string): SectionTabs {
  const hit = pageFor(pathname);
  if (!hit || hit.page.bare) return { tabs: [], chips: [] };
  // a detail page (a creator, a campaign, a format) has its own way back, as in Fastlane: no tabs over it
  if ((pathname.replace(/\/+$/, "") || "/") !== hit.page.to && !hit.page.subTabs) return { tabs: [], chips: [] };
  const index = hit.section.index ? hit.section.pages[0] : null;
  if (index) return { tabs: [], chips: [], back: { to: index.to, label: hit.section.label, active: false } };
  const all = groupedPages(hit.section.pages);
  const pages = visiblePages(all, email);
  const tab = (p: NavPage, label = p.label, active = p.to === hit.page.to): Tab => ({ to: p.to, label, end: p.end, active });
  const atLeastTwo = (t: Tab[]) => (t.length > 1 ? t : []);
  if (!all.some((p) => p.group)) return { tabs: atLeastTwo(pages.map((p) => tab(p))), chips: [] };
  const open = all.find((p) => p.to === hit.page.to)?.group;
  const groups = [...new Set(pages.map((p) => p.group))];
  return {
    tabs: atLeastTwo(groups.map((g) => tab(pages.find((p) => p.group === g)!, g, g === open))),
    chips: atLeastTwo(pages.filter((p) => p.group === open).map((p) => tab(p))),
  };
}

// Phone bottom bar: Fastlane's first four destinations; the rest are in More.
export const mobileTabs = (): { to: string; label: string; icon: LucideIcon; active: (pathname: string) => boolean }[] =>
  ["home", "plan", "write", "find"].map((id) => {
    const s = section(id);
    return { to: s.to, label: s.label, icon: s.icon, active: (p: string) => sectionFor(p)?.id === id };
  });

export type MoreTile = { to: string; label: string; icon: LucideIcon; sectionId: string };

/** The phone More sheet: one tile per section the bottom bar does not reach, opening the first page this sign-in sees. */
export function moreSheet(email: string): MoreTile[] {
  const bar = new Set(mobileTabs().map((t) => sectionFor(t.to)?.id));
  return SECTIONS.filter((s) => !bar.has(s.id))
    .map((s) => ({ s, first: visiblePages(s.pages, email)[0] }))
    .filter(({ first }) => first)
    .map(({ s, first }) => ({ to: first.to, label: s.label, icon: s.icon, sectionId: s.id }));
}
