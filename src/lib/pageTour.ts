// Page tours (Volume's editor and campaign tours, folded in 1 Nov): a few steps on one page, each pointing at a
// data-tour target. Shown the first time someone opens the page; finished or closed ones are remembered per person in
// a synced key, so the tour doesn't come back on another device. The studio tour (tour.ts) is separate.

export interface PageStep {
  /** the data-tour value of the element the step points at */
  target: string;
  title: string;
  text: string;
}
export type PageTourId = "design-editor" | "campaign";

const key = (userId: string) => `content-studio-pagetours-${userId}`;

function read(userId: string): Partial<Record<PageTourId, string>> {
  try {
    const raw = JSON.parse(localStorage.getItem(key(userId)) ?? "{}");
    return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  } catch {
    return {};
  }
}
export const pageTourDone = (userId: string, id: PageTourId) => typeof read(userId)[id] === "string";
export function finishPageTour(userId: string, id: PageTourId, now = new Date()): void {
  try {
    localStorage.setItem(key(userId), JSON.stringify({ ...read(userId), [id]: now.toISOString() }));
  } catch {
    // storage blocked: the tour shows again next visit, which is harmless
  }
}

export const DESIGN_TOUR: readonly PageStep[] = [
  { target: "design-tools", title: "Add to the slide", text: "Text, a picture, a shape or a fade. Each one is a layer you can move and stack." },
  { target: "design-stage", title: "Edit on the slide", text: "Click a layer to pick it, drag to move it, pull a corner to resize. Double-click words to type." },
  { target: "design-panel", title: "Fine-tune it here", text: "Everything about the picked layer: font, colour, outline, photo look, position. The layers list is at the bottom." },
  { target: "design-brand", title: "Your brand, once", text: "Brand holds your palette, heading and body fonts, logo and headshot, ready on every slide." },
  { target: "design-slides", title: "Slides", text: "Add, duplicate or delete slides. Each one keeps its own layers." },
  { target: "design-export", title: "Get it out", text: "Download the slides, send them to your phone, or put them in My posts to schedule." },
];

export const CAMPAIGN_TOUR: readonly PageStep[] = [
  { target: "campaign-tabs", title: "Three kinds of slide", text: "The hook opens each post, the content slides deliver it, and the CTA closes it. Each tab sets its own slide." },
  { target: "campaign-hooks", title: "Hooks", text: "Add a few. Each post opens with one picked at random, so after a few weeks you see which ones land." },
  { target: "campaign-topic", title: "What the posts are about", text: "Type it or say it. Optimize sharpens it, and Search the web adds current facts with their sources." },
  { target: "campaign-pictures", title: "Pictures", text: "Pick a library for this kind of slide. Each post draws fresh pictures from it." },
  { target: "campaign-words", title: "How the words look", text: "Font, style, colour, size and where they sit. The example post shows the result." },
  { target: "campaign-look", title: "One look for every slide", text: "A photo filter and an overlay so the words stay readable." },
  { target: "campaign-generate", title: "See an example", text: "Generate writes and draws one post. Check it against TikTok's safe area, edit the caption, or send it now." },
  { target: "campaign-account", title: "Where it posts", text: "Pick the TikTok account, the posting times and the time zone." },
  { target: "campaign-publish", title: "Drafts or straight out", text: "Drafts wait in TikTok for you to post. Straight to your profile needs your OK first." },
  { target: "campaign-start", title: "Start", text: "Start runs it on your schedule. Pause stops it any time." },
];
