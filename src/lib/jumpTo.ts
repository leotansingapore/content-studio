// "Jump to" (Cmd/Ctrl+K, and the search button on phones): every page the nav shows, a few create
// actions and the pages opened recently, filtered by what you type. Items come from SECTIONS through
// visiblePages, so the list can never drift from the nav or show a page the rails hide.
import { SECTIONS, pageFor, visiblePages } from "@/lib/nav";

export interface JumpItem {
  to: string;
  label: string;
  /** Section name, "Create" or "Recent". */
  group: string;
  /** Extra words people search with, beyond the label and section. */
  keywords: string;
}

export const CREATE_ITEMS: JumpItem[] = [
  { to: "/generate", label: "Write a post", group: "Create", keywords: "new post compose" },
  { to: "/generate/batch", label: "Write a batch of posts", group: "Create", keywords: "new several week" },
  { to: "/carousel", label: "Make a carousel", group: "Create", keywords: "new slides pdf" },
  { to: "/edit", label: "Edit a video", group: "Create", keywords: "new reel clip captions" },
];

/** Words a page is looked for by that its label doesn't say. */
const KEYWORDS: Record<string, string> = {
  "/home": "dashboard start",
  "/north-star": "roadmap competitors fastlane spec",
  "/calendar": "schedule scheduled posts upcoming queue dates planner content",
  "/plan": "weekly plan ideas",
  "/drafts": "posts history saved mark posted",
  "/library": "made everything videos ready",
  "/board": "kanban pipeline",
  "/grid": "instagram feed preview",
  "/reels": "reels board approve",
  "/reels/team": "invite teammate teammates people roles members access",
  "/playbook": "notifications alerts reminders",
  "/brand": "posting times best time when slots logo photo colours sign-off",
  "/voice": "tone writing style",
  "/bio": "link in bio page",
  "/links": "short links utm clicks",
  "/accounts": "connect instagram linkedin facebook zernio",
  "/fads": "fads framework",
  "/connect": "claude mcp ai",
  "/coach": "diagnosis score feedback",
  "/analytics": "results numbers stats insights performance",
  "/team": "team review approval approve leader",
  "/swipe": "top posts examples",
  "/trends": "trending videos",
  "/clone": "copy a reel style",
  "/inspiration": "ideas examples posts",
  "/profiles": "creators accounts",
  "/following": "creators followed",
  "/market": "market news competitors chatgpt ai answers geo",
  "/recruit": "recruitment brand brain",
  "/recruit/engage": "replies comments dms",
  "/academy": "lessons course",
  "/create-guide": "how to post guide",
  "/tutorial": "help how it works",
  "/feedback": "ideas requests bugs roadmap",
  "/media": "library pictures images photos",
  "/edit": "reel clip captions subtitles",
  "/slideshow": "slideshow photo carousel tiktok photos",
};

/** Every page this sign-in sees, labelled with its section. */
export function pageItems(email: string): JumpItem[] {
  return SECTIONS.flatMap((s) =>
    visiblePages(s.pages, email).map((p) => ({
      to: p.to,
      label: p.title ?? p.label,
      group: s.label,
      keywords: `${p.label} ${KEYWORDS[p.to] ?? ""}`.trim(),
    })),
  );
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

/**
 * Items matching every word typed, best first: label or the page's own address word starts with the
 * query ("drafts" is My posts, at /drafts), then a label word starts with it, then the words appear
 * anywhere in label, address, section or keywords. Ties: shorter label, then list order.
 */
export function searchJump(items: JumpItem[], query: string): JumpItem[] {
  const q = norm(query);
  if (!q) return items;
  const words = q.split(" ");
  const scored: { item: JumpItem; score: number; len: number; i: number }[] = [];
  items.forEach((item, i) => {
    const label = norm(item.label);
    const address = norm(item.to.split("/").pop() ?? "");
    const hay = `${label} ${address} ${norm(item.group)} ${norm(item.keywords)}`;
    if (!words.every((w) => hay.includes(w))) return;
    const score = label.startsWith(q) || address.startsWith(q) ? 0 : label.split(" ").some((w) => w.startsWith(words[0])) ? 1 : 2;
    scored.push({ item, score, len: label.length, i });
  });
  // the shorter label is the closer match ("Brand kit" before "Brand Brain" for "brand")
  return scored.sort((a, b) => a.score - b.score || a.len - b.len || a.i - b.i).map((s) => s.item);
}

// Recently opened pages, per device (outside the synced content-studio- prefix: where you were is
// this screen's business, not every device's).
const RECENT_KEY = "cs-recent-pages";
export const RECENT_MAX = 5;

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function loadRecent(): string[] {
  try {
    const raw = JSON.parse(storage()?.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string").slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

/** Puts a nav page first in the recent list; paths that are not a nav page are ignored. */
export function pushRecent(pathname: string): string[] {
  const hit = pageFor(pathname);
  if (!hit) return loadRecent();
  const next = [hit.page.to, ...loadRecent().filter((p) => p !== hit.page.to)].slice(0, RECENT_MAX);
  try {
    storage()?.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* recent pages are a convenience: skip when storage is blocked */
  }
  return next;
}

/** The full list for an empty query: recent pages (not the one open), create actions, then every page. */
export function jumpList(email: string, recent: string[], currentPath: string): JumpItem[] {
  const pages = pageItems(email);
  const here = pageFor(currentPath)?.page.to;
  const recentItems = recent
    .filter((to) => to !== here)
    .map((to) => pages.find((p) => p.to === to))
    .filter((p): p is JumpItem => !!p)
    .slice(0, 3)
    .map((p) => ({ ...p, group: "Recent" }));
  return [...recentItems, ...CREATE_ITEMS, ...pages];
}
