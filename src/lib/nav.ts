// The studio's whole navigation in one place. The desktop shell has two rails:
// rail 1 lists these sections, rail 2 lists the open section's pages. Phones
// get a bottom bar plus a More sheet, and SectionTabs on the page itself for
// tabbed sections. Adding a page = adding it to one section here.
import {
  BarChart3,
  BookMarked,
  Clapperboard,
  Columns3,
  Compass,
  Flame,
  Gauge,
  GraduationCap,
  History,
  Home,
  Lightbulb,
  MessageSquarePlus,
  PenLine,
  CalendarClock,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react";
import { REELS_BOARD_OWNERS } from "@/lib/reelsBoard";

export type NavPage = {
  to: string;
  label: string;
  /** Light up only on this exact path, not its children. */
  end?: boolean;
  /** Shown only to these sign-ins. */
  owners?: string[];
  /** Browser tab title when it should differ from the label. */
  title?: string;
  /** Phone More-sheet tile icon; falls back to the section's. */
  icon?: LucideIcon;
};

export type NavSection = {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Where the rail icon lands on the first visit. */
  to: string;
  pages: NavPage[];
  /** The pages are tabs of one screen: phones show one tile and SectionTabs. */
  tabbed?: boolean;
  /** Pinned to the bottom of rail 1. */
  foot?: boolean;
};

export const SECTIONS: NavSection[] = [
  {
    id: "home",
    label: "Home",
    icon: Home,
    to: "/home",
    pages: [
      { to: "/home", label: "Overview", title: "Home" },
      { to: "/welcome", label: "Getting started", icon: Sparkles },
    ],
  },
  {
    id: "write",
    label: "Write",
    icon: PenLine,
    to: "/generate",
    tabbed: true,
    pages: [
      { to: "/generate", label: "Post", end: true, title: "Write a post" },
      { to: "/generate/batch", label: "Batch" },
      { to: "/carousel", label: "Carousel" },
      { to: "/edit", label: "Video" },
      { to: "/media", label: "Media" },
    ],
  },
  {
    id: "pipeline",
    label: "Pipeline",
    icon: Columns3,
    to: "/calendar",
    tabbed: true,
    pages: [
      { to: "/plan", label: "Plan" },
      { to: "/calendar", label: "Calendar" },
      { to: "/board", label: "Board" },
      { to: "/drafts", label: "My posts" },
      { to: "/grid", label: "Grid", title: "Instagram grid" },
      { to: "/reels", label: "Reels", owners: REELS_BOARD_OWNERS },
    ],
  },
  {
    id: "recruit",
    label: "Recruit",
    icon: UserPlus,
    to: "/recruit",
    tabbed: true,
    pages: [
      { to: "/recruit", label: "Brand Brain", end: true },
      { to: "/recruit/conversations", label: "Conversations" },
      { to: "/recruit/agent", label: "AI agent" },
    ],
  },
  {
    id: "improve",
    label: "Improve",
    icon: Gauge,
    to: "/coach",
    pages: [
      { to: "/coach", label: "Coach", icon: Target },
      { to: "/analytics", label: "Analytics", icon: BarChart3 },
      { to: "/team", label: "Team review", icon: ShieldCheck },
    ],
  },
  {
    id: "discover",
    label: "Discover",
    icon: Compass,
    to: "/swipe",
    pages: [
      { to: "/swipe", label: "Top posts", icon: TrendingUp },
      { to: "/trends", label: "Trends", icon: Flame },
      { to: "/clone", label: "Clone a reel", icon: Clapperboard },
      { to: "/inspiration", label: "Inspiration", icon: Lightbulb },
      { to: "/profiles", label: "Creators", icon: Users },
    ],
  },
  {
    id: "playbook",
    label: "Playbook",
    icon: BookMarked,
    to: "/playbook",
    tabbed: true,
    pages: [
      { to: "/playbook", label: "My Playbook" },
      { to: "/voice", label: "Your voice" },
      { to: "/brand", label: "Brand kit" },
      { to: "/fads", label: "F.A.D.S." },
      { to: "/connect", label: "Connect Claude" },
    ],
  },
  {
    id: "learn",
    label: "Learn",
    icon: GraduationCap,
    to: "/academy",
    tabbed: true,
    foot: true,
    pages: [
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
];

export const section = (id: string) => SECTIONS.find((s) => s.id === id)!;

export const pathMatches = (pathname: string, to: string, end = false) =>
  pathname === to || (!end && pathname.startsWith(to + "/"));

export const visiblePages = (pages: NavPage[], email: string) =>
  pages.filter((p) => !p.owners || p.owners.includes(email.toLowerCase()));

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

// Phone bottom bar: the four daily destinations. Calendar stands for the
// whole Pipeline except My posts, which has its own tab.
export const MOBILE_TABS: { to: string; label: string; icon: LucideIcon; active: (pathname: string) => boolean }[] = [
  { to: "/home", label: "Home", icon: Home, active: (p) => sectionFor(p)?.id === "home" },
  { to: "/generate", label: "Write", icon: PenLine, active: (p) => sectionFor(p)?.id === "write" },
  {
    to: "/calendar",
    label: "Calendar",
    icon: CalendarClock,
    active: (p) => sectionFor(p)?.id === "pipeline" && !pathMatches(p, "/drafts"),
  },
  { to: "/drafts", label: "Posts", icon: History, active: (p) => pathMatches(p, "/drafts") },
];

/** `whole`: the tile stands for its entire section, not one page. */
export type MoreTile = { to: string; label: string; icon: LucideIcon; sectionId: string; whole: boolean };

/**
 * The phone More sheet: everything the bottom bar does not reach. A tabbed or
 * one-page section is one tile (page tabs do the rest); others list each page.
 * Sections left with one tile share a heading-less grid at the top.
 */
export function moreSheet(email: string): { singles: MoreTile[]; groups: { label: string; tiles: MoreTile[] }[] } {
  const barPaths = new Set(MOBILE_TABS.map((t) => t.to));
  const all = SECTIONS.map((s) => ({
    label: s.label,
    tiles: (s.tabbed || s.pages.length === 1
      ? [{ to: s.to, label: s.label, icon: s.icon, sectionId: s.id, whole: true }]
      : visiblePages(s.pages, email).map((p) => ({ to: p.to, label: p.label, icon: p.icon ?? s.icon, sectionId: s.id, whole: false }))
    ).filter((t) => !barPaths.has(t.to)),
  })).filter((g) => g.tiles.length > 0);
  return {
    singles: all.filter((g) => g.tiles.length === 1).flatMap((g) => g.tiles),
    groups: all.filter((g) => g.tiles.length > 1),
  };
}
