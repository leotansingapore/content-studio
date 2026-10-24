// The studio's whole navigation in one place. The desktop shell has two rails:
// rail 1 lists these sections, rail 2 lists the open section's pages. Phones
// get a bottom bar plus a More sheet, and SectionTabs on the page itself for
// tabbed sections. Adding a page = adding it to one section here.
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
  PenLine,
  CalendarClock,
  ClipboardCheck,
  Columns3,
  Settings,
  Radar,
  ShieldCheck,
  Sparkles,
  Star,
  Swords,
  Target,
  TrendingUp,
  UserCheck,
  UserPlus,
  Users,
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
  /** Rail 2 heading this page starts; the pages after it sit under it until the next one. */
  group?: string;
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

// Leo 2026-10-24 picked three rails (proposal E of six he compared): rail 1 is the work in order (decide what to post,
// make it, approve it, put it out, grow), rail 2 the open section's pages under group headings, and a context rail
// (ContextRail.tsx) holds the open page's own views, filters and counts. Each business is its own (2026-10-23).
export const SECTIONS: NavSection[] = [
  {
    id: "home",
    label: "Home",
    icon: Home,
    to: "/home",
    pages: [
      { to: "/home", label: "Overview", title: "Home" },
      { to: "/agent", label: "Agent", icon: MessageSquare, owners: LEO_EMAILS },
      { to: "/welcome", label: "Getting started", icon: Sparkles },
      { to: "/north-star", label: "North star", icon: Star, owners: LEO_EMAILS },
    ],
  },
  {
    id: "plan",
    label: "Plan",
    icon: Lightbulb,
    to: "/plan",
    pages: [
      { to: "/plan", label: "Plan", icon: Target, group: "Your plan" },
      { to: "/ideas", label: "Ideas", icon: Lightbulb, owners: LEO_EMAILS },
      { to: "/campaigns", label: "Campaigns", icon: Columns3, owners: LEO_EMAILS },
      { to: "/swipe", label: "Top posts", icon: TrendingUp, group: "Find ideas" },
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
    id: "write",
    label: "Create",
    icon: PenLine,
    to: "/generate",
    tabbed: true,
    pages: [
      { to: "/generate", label: "Post", end: true, title: "Write a post", group: "Make" },
      { to: "/make", label: "Formats", owners: LEO_EMAILS },
      { to: "/generate/batch", label: "Batch" },
      { to: "/carousel", label: "Carousel" },
      { to: "/image", label: "Image", owners: LEO_EMAILS },
      { to: "/slideshow", label: "Slideshow", owners: LEO_EMAILS },
      { to: "/edit", label: "Video" },
      { to: "/media", label: "Media", group: "Your files" },
      { to: "/library", label: "Library", owners: LEO_EMAILS },
    ],
  },
  {
    id: "review",
    label: "Review",
    icon: ClipboardCheck,
    to: "/reels",
    tabbed: true,
    pages: [
      { to: "/reels", label: "Posts board", end: true, show: reelsShown },
      { to: "/team", label: "Leader approvals" },
    ],
  },
  {
    id: "pipeline",
    label: "Publish",
    icon: CalendarClock,
    to: "/calendar",
    tabbed: true,
    pages: [
      { to: "/calendar", label: "Calendar", group: "Your posts" },
      { to: "/board", label: "Board" },
      { to: "/drafts", label: "All posts" },
      { to: "/grid", label: "Grid", title: "Instagram grid" },
      { to: "/analytics", label: "Analytics", group: "Results" },
      { to: "/coach", label: "Coach" },
    ],
  },
  {
    id: "recruit",
    label: "Grow",
    icon: UserPlus,
    to: "/recruit",
    tabbed: true,
    pages: [
      { to: "/recruit", label: "Brand Brain", end: true },
      { to: "/recruit/conversations", label: "Conversations" },
      { to: "/recruit/agent", label: "AI agent" },
      { to: "/recruit/engage", label: "Reply drafts" },
      { to: "/recruit/auto-dm", label: "Auto-DM", show: socialConnectShown },
    ],
  },
  {
    id: "playbook",
    label: "Brand",
    icon: BookMarked,
    to: "/playbook",
    tabbed: true,
    pages: [
      { to: "/playbook", label: "My Playbook", group: "Who you are" },
      { to: "/voice", label: "Your voice" },
      { to: "/brand", label: "Brand kit" },
      { to: "/audiences", label: "Audiences", owners: LEO_EMAILS },
      { to: "/people", label: "Faces and voices", owners: LEO_EMAILS },
      { to: "/fads", label: "F.A.D.S." },
      { to: "/accounts", label: "Social accounts", show: socialConnectShown, group: "Channels" },
      { to: "/bio", label: "Link in bio" },
      { to: "/links", label: "Tracked links" },
    ],
  },
  {
    // Set-up pages: who reviews, Claude, skills, automations, logs.
    id: "settings",
    label: "Settings",
    icon: Settings,
    to: "/connect",
    foot: true,
    pages: [
      { to: "/reels/team", label: "Reviewers", show: ownerShown },
      { to: "/connect", label: "Connect Claude" },
      { to: "/skills", label: "Skills", owners: LEO_EMAILS },
      { to: "/automations", label: "Automations", owners: LEO_EMAILS },
      { to: "/activity", label: "Activity", owners: LEO_EMAILS },
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
  pages.filter((p) => (!p.owners || p.owners.includes(email.toLowerCase())) && (!p.show || p.show()));

/** Each page carries the rail 2 heading it sits under, so a heading survives its first page being hidden. */
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

// Phone bottom bar: the four daily destinations. Publish opens on the Calendar and stands for its whole section;
// the fourth tab is Review for those who see the posts board, else All posts.
export const mobileTabs = (board: boolean): { to: string; label: string; icon: LucideIcon; active: (pathname: string) => boolean }[] => [
  { to: "/home", label: "Home", icon: Home, active: (p) => sectionFor(p)?.id === "home" },
  { to: "/generate", label: "Create", icon: PenLine, active: (p) => sectionFor(p)?.id === "write" },
  {
    to: "/calendar",
    label: "Publish",
    icon: CalendarClock,
    active: (p) => sectionFor(p)?.id === "pipeline" && (board || !pathMatches(p, "/drafts")),
  },
  board
    ? { to: "/reels", label: "Review", icon: ClipboardCheck, active: (p) => sectionFor(p)?.id === "review" }
    : { to: "/drafts", label: "All posts", icon: History, active: (p) => pathMatches(p, "/drafts") },
];

/** `whole`: the tile stands for its entire section, not one page. */
export type MoreTile = { to: string; label: string; icon: LucideIcon; sectionId: string; whole: boolean };

/**
 * The phone More sheet: everything the bottom bar does not reach. A tabbed or
 * one-page section is one tile (page tabs do the rest); others list each page.
 * Sections left with one tile share a heading-less grid at the top.
 */
export function moreSheet(email: string, board: boolean): { singles: MoreTile[]; groups: { label: string; tiles: MoreTile[] }[] } {
  const barPaths = new Set(mobileTabs(board).map((t) => t.to));
  const all = SECTIONS.filter((s) => visiblePages(s.pages, email).length > 0).map((s) => ({
    label: s.label,
    tiles: (s.tabbed || s.pages.length === 1
      ? [{ to: visiblePages(s.pages, email)[0]?.to ?? s.to, label: s.label, icon: s.icon, sectionId: s.id, whole: true }] // the first page this sign-in sees
      : visiblePages(s.pages, email).map((p) => ({ to: p.to, label: p.label, icon: p.icon ?? s.icon, sectionId: s.id, whole: false }))
    ).filter((t) => !barPaths.has(t.to)),
  })).filter((g) => g.tiles.length > 0);
  return {
    singles: all.filter((g) => g.tiles.length === 1).flatMap((g) => g.tiles),
    groups: all.filter((g) => g.tiles.length > 1),
  };
}
