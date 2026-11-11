// Static ad formats (Leo, 11 Nov 2026 meeting: "every single one of this we should be including inside our app"),
// after Fastlane's Studio > Create > Static ads (22 formats, read from Leo's workspace 11 Nov). Names and lines are
// ours; no other app's name, logo or example picture is used. Each format has its own page at /make/static/<slug>
// (an example drawn by our own template, what it works best with, an optional note, one Make button), and is drawn
// as an /image layout so saving, sizes, Library and Run as an ad come with it. `ready` flips when its layout ships.

export type StaticNeed = "photo" | "price";

export interface StaticFormat {
  /** Unique, kebab-case; the /make/static/<slug> page and the /image layout id. */
  slug: string;
  name: string;
  /** One line on the gallery card and under the page title. */
  blurb: string;
  /** "Best with": the make still works without it. */
  best?: StaticNeed;
  /** "Needs": the Make button waits for it. */
  needs?: StaticNeed;
  ready: boolean;
}

export const STATIC_NEED_LINES: Record<StaticNeed, { best: string; needs: string }> = {
  photo: { best: "Best with a product photo", needs: "Needs a product photo" },
  price: { best: "Best with a price", needs: "Needs a price" },
};

export const STATIC_FORMATS: StaticFormat[] = [
  { slug: "text-chat", name: "Text message chat", blurb: "A text chat about a familiar task or mix-up.", ready: false },
  { slug: "us-vs-them", name: "Us vs them", blurb: "What you sell beside the usual way, row by row.", best: "photo", ready: false },
  { slug: "friend-recommends", name: "A friend recommends you", blurb: "A messaging chat where a friend tells another about you.", ready: false },
  { slug: "lofi-note", name: "Lo-fi note", blurb: "A scrappy note typed in a desktop notes window.", best: "photo", ready: false },
  { slug: "ai-chat", name: "AI chat answer", blurb: "A chat with an AI assistant that recommends you.", best: "photo", ready: false },
  { slug: "forum-thread", name: "Forum thread", blurb: "A forum post asking for help, and the reply that names you.", ready: false },
  { slug: "concern-answer", name: "Concern and answer", blurb: "A buyer's doubt, answered with one fact.", best: "photo", ready: false },
  { slug: "story-reply", name: "Story reply", blurb: "A buyer's question, answered in a story.", best: "photo", ready: false },
  { slug: "playful-apology", name: "Playful apology", blurb: "A bold-type apology for the funny side effects of what you sell.", ready: false },
  { slug: "page-post", name: "Page post", blurb: "A post from your own page, with reactions and comments under it.", best: "photo", ready: false },
  { slug: "email-screenshot", name: "Email screenshot", blurb: "An email in an inbox, with a subject worth opening.", ready: false },
  { slug: "phone-share", name: "Phone share", blurb: "Someone shares something worth seeing to the buyer's phone.", needs: "photo", ready: false },
  { slug: "share-popup", name: "Share pop-up", blurb: "What you sell pops up on their phone: Accept or Decline.", needs: "photo", ready: false },
  { slug: "whiteboard", name: "Whiteboard", blurb: "A whiteboard explaining one idea in marker.", ready: false },
  { slug: "anti-design", name: "Anti-design", blurb: "A deliberately rough ad with blunt notes scrawled on it.", best: "photo", ready: false },
  { slug: "street-poster", name: "Poster in the street", blurb: "A poster ad where your buyer walks past.", best: "photo", ready: false },
  { slug: "tear-off-flyer", name: "Tear-off flyer", blurb: "A tear-off flyer on a notice board.", best: "price", ready: false },
  { slug: "lettered-object", name: "Written on an object", blurb: "A handwritten line on a mirror, a mug or a sticky note.", best: "photo", ready: false },
  { slug: "tshirt-print", name: "T-shirt back print", blurb: "A stranger's T-shirt print that sells what you do.", ready: false },
  { slug: "article-page", name: "Article page", blurb: "Your own magazine page: your name, a big headline and a hero picture.", best: "photo", ready: false },
  { slug: "news-headline", name: "News headline", blurb: "A news-style picture: a photo, a badge and a huge headline.", best: "photo", ready: false },
  { slug: "general-ad", name: "General ad", blurb: "A clean ad shaped to your business.", best: "photo", ready: false },
];

export const staticFormatBySlug = (slug: string): StaticFormat | undefined => STATIC_FORMATS.find((f) => f.slug === slug);
export const staticFormatHref = (slug: string) => `/make/static/${slug}`;
