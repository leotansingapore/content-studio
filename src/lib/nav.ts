// The studio's whole navigation in one place. Five places to go and two at the foot (Leo 11 Nov: "everything should be
// stupidly simple to use"; docs/nav-overhaul.md): Home, Create, Library, Plan, Insights, then Brand and Settings. The
// open section's tabs sit at the top of the page (SectionTabs, in the shell), five at most and one row. Pages that do
// one job share a tab (`group`): the tab shows a small arrow and lists them (the picker). Filters stay on the pages.
// Phones get a bottom bar of four plus More. Adding a page = adding it to one tab here; no address ever changes.
import {
  BarChart3,
  Bell,
  BookMarked,
  CalendarClock,
  Command,
  FolderOpen,
  Home,
  Link2,
  ListChecks,
  Megaphone,
  MessageSquare,
  MessageSquarePlus,
  MousePointerClick,
  Plug,
  Share2,
  SlidersHorizontal,
  Zap,
  Settings,
  Sparkles,
  Star,
  Wand2,
  Languages,
  Tag,
  UserCheck,
  GraduationCap,
  BookOpen,
  CircleHelp,
  type LucideIcon,
} from "lucide-react";
import { ownerShown, reelsShown } from "@/lib/reelsBoard";
import { LEO_EMAILS, leoOnly } from "@/lib/leoOnly";
import { marketShown } from "@/lib/market";
import { socialConnectShown } from "@/lib/socialConnect";
import { adviserBrand } from "@/lib/profession";

export type NavPage = {
  to: string;
  /** One or two plain words a stranger understands. */
  label: string;
  /** Light up only on this exact path, not its children. */
  end?: boolean;
  /** Shown only to these sign-ins. */
  owners?: string[];
  /** Its label on Leo's sign-ins, where the page is a different tool for them (/clone is Remix a post). */
  leoLabel?: string;
  /** Its label on a brand that isn't an adviser's, where the page keeps only what isn't for advisers (/swipe is News). */
  anyLabel?: string;
  /** Its label on Leo's sign-ins on a brand that isn't an adviser's, where it holds tools of his (/swipe: Swipe file, over its six tabs). */
  leoAnyLabel?: string;
  /** Shown only while this says so (what this device remembers: an answer from the server, the open brand). */
  show?: () => boolean;
  /** In its section's tabs only while this says so; its address and Jump to keep working either way (the recruit kit is an adviser brand's). */
  inTabs?: () => boolean;
  /** Browser tab title when it should differ from the label. */
  title?: string;
  /** Its tile icon on an index page (Settings); falls back to the section's. */
  icon?: LucideIcon;
  /** The tab this page sits under; pages after it share it until the next one. */
  group?: string;
  /** No section tabs on this page. */
  bare?: boolean;
  /** Its deeper addresses (/fads/positioning) are tabs of the page itself, so the row stays over them. */
  subTabs?: boolean;
  /** The line under its name in a picker or on an index tile (Settings), 12 words at most. */
  hint?: string;
  /** What it was called before, and other words people look for it by: Jump to finds it by these. */
  was?: string;
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
  /** The first page lists the others as tiles; they get a way back to it instead of tabs (Settings). */
  index?: boolean;
  /** What it was called before: Jump to finds its pages by these. */
  was?: string;
};

const adviser = () => adviserBrand();

/** No section shows more tabs than this to any sign-in (nav.test.ts holds it). */
export const MAX_TABS = 5;

// Section ids are kept from the older navs where a section lives on (plan, write = Create, playbook = Brand).
export const SECTIONS: NavSection[] = [
  {
    id: "home",
    label: "Home",
    icon: Home,
    to: "/home",
    pages: [
      // the agent's chats are in the sidebar and North star in the account menu
      { to: "/home", label: "Overview", title: "Home", bare: true },
      { to: "/agent", label: "Agent", icon: MessageSquare, owners: LEO_EMAILS, bare: true },
      { to: "/north-star", label: "North star", icon: Star, owners: LEO_EMAILS, bare: true },
    ],
  },
  {
    id: "write",
    label: "Create",
    icon: Wand2,
    to: "/studio",
    was: "Studio",
    pages: [
      // one screen that answers "what do you want to make?" (StudioPage)
      { to: "/studio", label: "Start", title: "Create", group: "Start", was: "Studio overview what to make" },
      { to: "/generate", label: "Post", end: true, title: "Write a post", group: "Write" },
      { to: "/generate/batch", label: "Weekly batch", was: "Batch" },
      { to: "/generate/answer", label: "Answer", title: "Answer a question" },
      { to: "/generate/vsl", label: "Sales script", title: "Write a VSL", was: "VSL video sales letter" },
      // write hooks in bulk, keep or say Not this (BuilderCult's My hooks, folded in 6 Nov)
      { to: "/hooks", label: "Hooks", title: "My hooks" },
      // Scriptwriter: 12 dials, hook ideas and a topic, written on Leo's own Claude Code (script desk)
      { to: "/script", label: "Script", title: "Scriptwriter", owners: LEO_EMAILS },
      { to: "/carousel", label: "Carousel", group: "Slides" },
      { to: "/slideshow", label: "Slideshow" },
      // the layer editor and its templates (Volume, folded in 31 Oct)
      { to: "/design", label: "Design", title: "Design slides", end: true },
      // a new slideshow on a schedule, sent to TikTok, and the pictures it draws from (Volume)
      { to: "/design/campaigns", label: "Auto slideshows", title: "Slideshow campaigns", was: "Campaigns", hint: "A new slideshow on a schedule." },
      { to: "/design/libraries", label: "Picture sets", title: "Image libraries", was: "Libraries", hint: "The pictures auto slideshows draw from." },
      { to: "/image", label: "Image", owners: LEO_EMAILS },
      { to: "/edit", label: "Video editor", title: "Edit a video", group: "Video", was: "Video" },
      // a hook that stops the scroll, then the app's demo (BuilderCult's Reaction UGC, folded in 6 Nov)
      { to: "/make/hook-demo", label: "Hook + demo", title: "Hook plus demo" },
      { to: "/clone", label: "Clone a reel", leoLabel: "Remix a post", was: "Radar remix" },
      { to: "/people", label: "Faces and voices", owners: LEO_EMAILS, was: "Influencers presenters" },
      // the whole catalogue (Fastlane's Studio > Create) and a deck of ready drafts to keep or skip (its Blitz)
      { to: "/make", label: "All formats", title: "Formats", owners: LEO_EMAILS, group: "Formats" },
      { to: "/blitz", label: "Blitz", owners: LEO_EMAILS, hint: "Swipe through ready drafts." },
    ],
  },
  {
    id: "library",
    label: "Library",
    icon: FolderOpen,
    to: "/library",
    was: "Studio",
    pages: [
      // one place for what you made, with four ways to look at it
      { to: "/library", label: "Everything", title: "Library", group: "Everything" },
      { to: "/drafts", label: "All posts", was: "My posts drafts history" },
      { to: "/board", label: "Board" },
      { to: "/grid", label: "Grid", title: "Instagram grid" },
      { to: "/media", label: "Media", group: "Media", was: "Photos and videos uploads" },
      { to: "/reels", label: "Posts board", end: true, show: reelsShown, group: "Approvals" },
      { to: "/team", label: "Leader approvals" },
    ],
  },
  {
    id: "plan",
    label: "Plan",
    icon: CalendarClock,
    to: "/calendar",
    was: "Strategy",
    // Leo's opens on his campaigns, everyone else's on the calendar
    pages: [
      { to: "/campaigns", label: "Campaigns", owners: LEO_EMAILS, group: "Campaigns" },
      { to: "/calendar", label: "Calendar", group: "Calendar" },
      { to: "/plan", label: "Weekly plan", group: "Plans", was: "Plan" },
      // a month of launch posts counting back from a date, each opening its maker (BuilderCult's Launch plan, 6 Nov)
      { to: "/launch", label: "Launch plan", was: "Launch" },
      { to: "/linkedin", label: "LinkedIn", title: "LinkedIn strategy" },
      // the formats that win among the brand's Apps like yours references, and this month's progress on them
      { to: "/social-north-star", label: "Social north star", owners: LEO_EMAILS },
      { to: "/ideas", label: "Ideas", owners: LEO_EMAILS, group: "Ideas" },
    ],
  },
  {
    id: "insights",
    label: "Insights",
    icon: BarChart3,
    to: "/analytics",
    pages: [
      { to: "/analytics", label: "Results", title: "Analytics", group: "Results", was: "Analytics numbers" },
      { to: "/coach", label: "Coach", group: "Coach", was: "Analytics" },
      // things to remix. Top posts, Trends and Examples are Singapore personal finance: an adviser brand's only
      { to: "/swipe", label: "Top posts", anyLabel: "News", leoAnyLabel: "Swipe file", group: "Find posts", was: "Radar ads inspiration" },
      { to: "/carousels", label: "Carousels", was: "Radar" },
      { to: "/working", label: "What's working", was: "Radar" },
      { to: "/trends", label: "Trends", show: () => adviserBrand(), was: "Radar" },
      { to: "/inspiration", label: "Inspiration", show: () => adviserBrand(), was: "Radar" },
      { to: "/saved", label: "Saved", owners: LEO_EMAILS, was: "Radar" },
      { to: "/market", label: "Your market", show: marketShown, was: "Radar" },
      // who to watch. Research is 100 Instagram creators read by Leo's Mac; Following is 5 accounts, for everyone
      { to: "/following", label: "Following", group: "Creators", was: "Radar" },
      { to: "/profiles", label: "Creators to follow", show: () => adviserBrand(), was: "Radar creator list" },
      { to: "/research", label: "Research", owners: LEO_EMAILS, was: "Radar" },
      { to: "/competitors", label: "Competitors", owners: LEO_EMAILS },
      // the recruit kit: one page with its own parts (/recruit/:tab). A tab on an adviser brand only (Leo 11 Nov); any
      // brand still opens it by address and from Jump to
      { to: "/recruit", label: "Recruit kit", end: true, group: "Recruit", was: "Brand Brain Grow", inTabs: adviser },
      { to: "/recruit/conversations", label: "Conversations", was: "Grow", inTabs: adviser },
      { to: "/recruit/agent", label: "Reply agent", was: "Grow AI agent", inTabs: adviser },
      { to: "/recruit/engage", label: "Reply drafts", was: "Grow", inTabs: adviser },
      { to: "/recruit/auto-dm", label: "Auto-DM", show: socialConnectShown, owners: LEO_EMAILS, was: "Grow", inTabs: adviser },
    ],
  },
  {
    id: "playbook",
    label: "Brand",
    icon: BookMarked,
    to: "/playbook",
    foot: true,
    pages: [
      { to: "/playbook", label: "Profile", group: "Profile", was: "My Playbook playbook" },
      { to: "/voice", label: "Voice", title: "Your voice", group: "Voice" },
      { to: "/brand", label: "Brand kit", group: "Brand kit" },
      { to: "/audiences", label: "Audiences", owners: LEO_EMAILS, group: "Audiences" },
      { to: "/fads", label: "Positioning", subTabs: true, show: () => adviserBrand(), was: "F.A.D.S. fads differentiation" },
    ],
  },
  {
    // An index of tiles under the account menu; each page leads back to it. `group` names a tile group here, not tabs.
    id: "settings",
    label: "Settings",
    icon: Settings,
    to: "/settings",
    foot: true,
    index: true,
    pages: [
      { to: "/settings", label: "Settings", end: true, bare: true },
      { to: "/notifications", label: "Notifications", icon: Bell, group: "You", hint: "Phone alerts and the Monday results email." },
      { to: "/settings/post-choices", label: "Post choices", icon: SlidersHorizontal, hint: "Who appears, your name, captions and text style on new posts." },
      { to: "/accounts", label: "Social accounts", icon: Share2, show: socialConnectShown, group: "Connections", hint: "The Instagram and TikTok accounts the studio posts to." },
      { to: "/bio", label: "Link in bio", icon: Link2, hint: "One page of your links for your profile." },
      { to: "/links", label: "Tracked links", icon: MousePointerClick, hint: "Short links that count who clicks." },
      { to: "/connect", label: "Connect Claude", icon: Plug, hint: "Use the studio from a chat with Claude." },
      { to: "/adlauncher", label: "AdLauncher", icon: Megaphone, owners: LEO_EMAILS, hint: "Launch ads you make here, paused, in AdLauncher." },
      { to: "/reels/team", label: "Reviewers", icon: UserCheck, show: ownerShown, group: "Your team", hint: "Who approves posts on your posts board." },
      // named as its page is, and as Fastlane's tile; Activity sits with it, so Your team is never a heading over a log
      { to: "/automations", label: "What runs without you", icon: Zap, owners: LEO_EMAILS, group: "The agent", hint: "What the agent does alone, and today's limits." },
      { to: "/activity", label: "Activity", icon: ListChecks, owners: LEO_EMAILS, hint: "Everything that ran, and who ran it." },
      { to: "/skills", label: "Skills", icon: Command, owners: LEO_EMAILS, hint: "Slash commands the agent runs for you." },
      // help is not a place to go every day: it sits here, and in the account menu
      { to: "/welcome", label: "Getting started", icon: Sparkles, group: "Help", was: "Learn onboarding", hint: "The first steps, ticked off as you do them." },
      { to: "/academy", label: "Academy", icon: GraduationCap, was: "Learn lessons course", hint: "Short lessons on posting that gets clients." },
      { to: "/create-guide", label: "How to post", icon: BookOpen, was: "Learn guide", hint: "One post from idea to scheduled, step by step." },
      { to: "/tutorial", label: "How it works", title: "How the studio works", icon: CircleHelp, was: "Learn tutorial", hint: "A walk through every part of the studio." },
      { to: "/feedback", label: "Feedback", icon: MessageSquarePlus, was: "Requests roadmap changelog", hint: "Ask for a feature, see the roadmap and what's new." },
    ],
  },
];

/**
 * Sections of a Settings page that get a tile of their own on /settings, straight after their page's (Fastlane lists
 * Post labels and Language beside Post choices). They are places on a page, not pages: no route, no tab title, and
 * the open page under them is still their page.
 */
export const SETTINGS_ANCHORS: { page: string; hash: string; label: string; icon: LucideIcon; hint: string; owners?: string[] }[] = [
  { page: "/settings/post-choices", hash: "labels", label: "Post labels", icon: Tag, hint: "The AI and ad labels that go out with a post." },
  { page: "/settings/post-choices", hash: "language", label: "Language", icon: Languages, owners: LEO_EMAILS, hint: "The language your posts are written in." },
];

/** A Settings group's tiles for this sign-in: its pages, each followed by its sections' tiles. */
export const settingsTiles = (pages: NavPage[], email: string): NavPage[] =>
  pages.flatMap((p) => [
    p,
    ...SETTINGS_ANCHORS.filter((a) => a.page === p.to && (!a.owners || a.owners.includes(email.toLowerCase()))).map((a) => ({ to: `${a.page}#${a.hash}`, label: a.label, icon: a.icon, hint: a.hint, group: p.group })),
  ]);

export const section = (id: string) => SECTIONS.find((s) => s.id === id)!;

export const pathMatches = (pathname: string, to: string, end = false) =>
  pathname === to || (!end && pathname.startsWith(to + "/"));

export const visiblePages = (pages: NavPage[], email: string) =>
  pages
    .filter((p) => (!p.owners || p.owners.includes(email.toLowerCase())) && (!p.show || p.show()))
    .map((p) =>
      p.leoAnyLabel && leoOnly(email) && !adviserBrand() ? { ...p, label: p.leoAnyLabel }
      : p.leoLabel && leoOnly(email) ? { ...p, label: p.leoLabel }
      : p.anyLabel && !adviserBrand() ? { ...p, label: p.anyLabel } : p);

/** Each page carries the group (tab) it sits under, so a group survives its first page being hidden. */
export function groupedPages(pages: NavPage[]): NavPage[] {
  let group: string | undefined;
  return pages.map((p) => ({ ...p, group: (group = p.group ?? group) }));
}

/** The page a path belongs to: the longest matching route, so /generate/batch is Weekly batch, not Post. */
export function pageFor(pathname: string): { section: NavSection; page: NavPage } | null {
  let best: { section: NavSection; page: NavPage } | null = null;
  for (const s of SECTIONS)
    for (const p of s.pages)
      if (pathMatches(pathname, p.to) && (!best || p.to.length > best.page.to.length)) best = { section: s, page: p };
  return best;
}

export const sectionFor = (pathname: string) => pageFor(pathname)?.section ?? null;

/** Where a section's nav item goes: its first page when you are already in it (a way out of a detail page), else the page you last had open there. */
export const sectionHref = (s: NavSection, email: string, hereId: string | undefined, last: string | undefined) => {
  const first = visiblePages(s.pages, email)[0]?.to ?? s.to;
  return hereId === s.id || !last ? first : last;
};

export const pageTitle = (pathname: string) => {
  const hit = pageFor(pathname);
  return hit ? `${hit.page.title ?? (hit.page.anyLabel && !adviserBrand() ? hit.page.anyLabel : hit.page.label)} - Postmosis` : "Postmosis";
};

export type Tab = { to: string; label: string; end?: boolean; active: boolean; hint?: string };
export type SectionTabs = { tabs: Tab[]; picker: Tab[]; back?: Tab };

/**
 * The one row at the top of a page: a tab per group of its section, opening the group's first page this sign-in sees.
 * A tab that holds one page is named after the page; one that holds several is named after the group, and the open
 * tab's pages come back as `picker` (the list under its arrow). One of a kind is not a choice, so a row or a picker
 * of one is left out; a `bare` page or a detail address under a page gets none, and a page under an `index` section
 * gets a way back instead.
 */
export function sectionTabs(pathname: string, email: string): SectionTabs {
  const hit = pageFor(pathname);
  if (!hit || hit.page.bare) return { tabs: [], picker: [] };
  // a detail page (a creator, a campaign, a format) has its own way back: no tabs over it
  if ((pathname.replace(/\/+$/, "") || "/") !== hit.page.to && !hit.page.subTabs) return { tabs: [], picker: [] };
  const index = hit.section.index ? hit.section.pages[0] : null;
  if (index) return { tabs: [], picker: [], back: { to: index.to, label: hit.section.label, active: false } };
  const all = groupedPages(hit.section.pages);
  const pages = visiblePages(all, email).filter((p) => !p.inTabs || p.inTabs());
  const tab = (p: NavPage, label = p.label, active = p.to === hit.page.to): Tab => ({ to: p.to, label, end: p.end, active, hint: p.hint });
  const atLeastTwo = (t: Tab[]) => (t.length > 1 ? t : []);
  const open = all.find((p) => p.to === hit.page.to)?.group;
  const of = (g: string | undefined) => pages.filter((p) => p.group === g);
  const groups = [...new Set(pages.map((p) => p.group))];
  const picker = atLeastTwo(of(open).map((p) => tab(p)));
  const tabs = groups.map((g) => tab(of(g)[0], of(g).length > 1 ? g : of(g)[0].label, g === open));
  // a lone tab still shows when it is the only way to its other pages
  return { tabs: tabs.length > 1 || picker.length ? tabs : [], picker };
}

// Phone bottom bar: four places and More. Home, Create, Library and Plan; the agent's sign-ins have their chats where
// Library is, and find Library in More.
const isChat = (p: string) => p === "/agent" || p.startsWith("/agent/");
export const mobileTabs = (email: string): { to: string; label: string; icon: LucideIcon; active: (pathname: string) => boolean }[] => {
  const chats = visiblePages(section("home").pages, email).some((p) => p.to === "/agent");
  const tab = (id: string) => {
    const s = section(id);
    // the first page this sign-in sees, as the sidebar opens (Leo's Plan is Campaigns, everyone else's Calendar)
    const to = visiblePages(s.pages, email)[0]?.to ?? s.to;
    return { to, label: s.label, icon: s.icon, active: (p: string) => sectionFor(p)?.id === id && !(chats && isChat(p)) };
  };
  return [tab("home"), tab("write"), chats ? { to: "/agent?panel=chats", label: "Chats", icon: MessageSquare, active: isChat } : tab("library"), tab("plan")];
};

export type MoreTile = { to: string; label: string; icon: LucideIcon; sectionId: string };

/** The phone More sheet: one tile per section the bottom bar does not reach, opening the first page this sign-in sees. */
export function moreSheet(email: string): MoreTile[] {
  const bar = new Set(mobileTabs(email).map((t) => sectionFor(t.to)?.id));
  return SECTIONS.filter((s) => !bar.has(s.id))
    .map((s) => ({ s, first: visiblePages(s.pages, email)[0] }))
    .filter(({ first }) => first)
    .map(({ s, first }) => ({ to: first.to, label: s.label, icon: s.icon, sectionId: s.id }));
}
