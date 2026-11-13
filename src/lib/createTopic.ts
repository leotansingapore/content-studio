// Create > Start's topic box (StudioPage): what is typed there goes with whichever tile is tapped, and is still in the
// box on the way back. Per tab (sessionStorage, cs- keys): a hint, never synced.
//   cs-create-topic-<scoped>: the box's words
// Answer takes it in its own address (?q=), Hooks and Slideshow's writer (/make/slideshow, where a topic becomes
// slides; /slideshow itself has no topic field) in ?topic=. Carousel and Weekly batch keep their topic in their per-tab work
// (cs-carousel-work-, cs-batch-work-), read once when the page opens: the topic is put there only when that work is
// empty, so nothing already typed or made in them is ever replaced.
// shortcut: this writes two pages' private per-tab keys, pinned in createTopic.test.ts against their source; give
// Carousel and Weekly batch a ?topic= of their own if either changes how it keeps its work.

import { links } from "@/lib/links";
import { scoped } from "@/lib/profiles";

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const tab = (): Store | null => {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
};
const boxKey = (userId: string) => `cs-create-topic-${scoped(userId)}`;
export const CAROUSEL_WORK = "cs-carousel-work-";
export const BATCH_WORK = "cs-batch-work-";
export const MAX_TOPIC = 300;

export function loadCreateTopic(userId: string, store: Store | null = tab()): string {
  try {
    return (store?.getItem(boxKey(userId)) ?? "").slice(0, MAX_TOPIC);
  } catch {
    return "";
  }
}
export function saveCreateTopic(userId: string, topic: string, store: Store | null = tab()): void {
  try {
    if (topic.trim()) store?.setItem(boxKey(userId), topic.slice(0, MAX_TOPIC));
    else store?.removeItem(boxKey(userId));
  } catch {
    // blocked storage: the box just starts empty next time
  }
}

/** Puts the topic into a page's per-tab work when that work holds nothing of the person's yet. */
function seed(store: Store | null, key: string, topic: string, extra: object, busy: (w: Record<string, unknown>) => boolean): void {
  try {
    const raw = JSON.parse(store?.getItem(key) ?? "null");
    const work = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
    const typed = (v: unknown) => typeof v === "string" && v.trim() !== "";
    if (typed(work.topic) || busy(work)) return;
    store?.setItem(key, JSON.stringify({ ...work, ...extra, topic }));
  } catch {
    // blocked or corrupt storage: the tile still opens, with an empty topic
  }
}

/** Where a Create tile goes with the box's topic: the tile's own address, carrying the topic wherever its page has a place for one. */
export function tileHref(to: string, topicRaw: string, userId: string | null, store: Store | null = tab()): string {
  const topic = topicRaw.trim().slice(0, MAX_TOPIC);
  if (!topic) return to;
  if (userId) saveCreateTopic(userId, topic, store);
  if (to === "/generate") return links.generate({ detail: topic });
  if (to === "/generate/answer") return `${to}?q=${encodeURIComponent(topic)}`;
  if (to === "/slideshow") return links.makeFormat("slideshow", { topic });
  if (to === "/hooks") return `${to}?${new URLSearchParams({ topic })}`;
  if (to === "/carousel" && userId) {
    const typed = (v: unknown) => typeof v === "string" && v.trim() !== "";
    seed(store, CAROUSEL_WORK + scoped(userId), topic, { mode: "topic" }, (w) => typed(w.pasteText) || (Array.isArray(w.slides) && w.slides.length > 0));
    return links.carousel({ tab: "topic" });
  }
  if (to === "/generate/batch" && userId) seed(store, BATCH_WORK + scoped(userId), topic, {}, (w) => !!w.cards && typeof w.cards === "object" && Object.keys(w.cards).length > 0);
  return to;
}
