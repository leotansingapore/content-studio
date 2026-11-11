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
  /** The page's example: its layout's words for the made-up business below (STATIC_EXAMPLE). */
  example?: Record<string, string>;
}

/** The made-up business every format page's example is drawn for, and its product photo (a drawn bottle, no real brand). */
export const STATIC_EXAMPLE = {
  brand: { color: "#7A4B2A", name: "Hilltop Coffee", handle: "@hilltopcoffee" },
  picture: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800" preserveAspectRatio="xMidYMid slice"><rect width="800" height="800" fill="#EAD9C6"/><rect y="580" width="800" height="220" fill="#D8C0A4"/><ellipse cx="400" cy="676" rx="200" ry="28" fill="#000" opacity=".14"/><rect x="342" y="112" width="116" height="72" rx="12" fill="#262626"/><path d="M354 184h92v58c0 34 64 52 64 112v276c0 24-18 42-42 42H332c-24 0-42-18-42-42V354c0-60 64-78 64-112z" fill="#3A2213"/><rect x="300" y="404" width="200" height="164" rx="10" fill="#F6EDE0"/><text x="400" y="474" font-family="Georgia, serif" font-size="38" font-weight="600" text-anchor="middle" fill="#3A2213">COLD</text><text x="400" y="522" font-family="Georgia, serif" font-size="38" font-weight="600" text-anchor="middle" fill="#3A2213">BREW</text><path d="M322 300c-14 40-14 120-10 200" stroke="#fff" stroke-width="10" stroke-linecap="round" opacity=".18" fill="none"/></svg>',
  )}`,
};

export const STATIC_NEED_LINES: Record<StaticNeed, { best: string; needs: string }> = {
  photo: { best: "Best with a product photo", needs: "Needs a product photo" },
  price: { best: "Best with a price", needs: "Needs a price" },
};

export const STATIC_FORMATS: StaticFormat[] = [
  { slug: "text-chat", name: "Text message chat", blurb: "A text chat about a familiar task or mix-up.", ready: true, example: { name: "Priya", one: "what was that coffee you brought to the meeting", two: "cold brew from Hilltop Coffee. they bottle it themselves", three: "so smooth. was it sweetened", four: "nothing added at all, i checked the label", five: "where do you even get it", six: "they deliver to the office. i'll add you to our order" } },
  { slug: "us-vs-them", name: "Us vs them", blurb: "What you sell beside the usual way, row by row.", best: "photo", ready: true, example: { headline: "A queue downstairs, or a bottle in the fridge.", them: "Coffee run", us: "Hilltop cold brew", oldA: "Queue at the cafe downstairs", newA: "Pour it from the office fridge", oldB: "Pay for every single cup", newB: "One bottle shared round the team", oldC: "Sugar syrup by default", newC: "Nothing added, just coffee", close: "Skip the queue. Keep the bottle." } },
  { slug: "friend-recommends", name: "A friend recommends you", blurb: "A messaging chat where a friend tells another about you.", ready: true, example: { name: "Jun", one: "i can't get through the afternoon without a nap lately", two: "try the cold brew from Hilltop Coffee, it's what i drink after lunch", three: "isn't cold brew really bitter", four: "not theirs. smooth, and no sugar needed", five: "where do you buy it", six: "they deliver. i'll bring you a bottle tomorrow" } },
  { slug: "lofi-note", name: "Lo-fi note", blurb: "A scrappy note typed in a desktop notes window.", best: "photo", ready: false },
  { slug: "ai-chat", name: "AI chat answer", blurb: "A chat with an AI assistant that recommends you.", best: "photo", ready: true, example: { question: "i need something to get me through long afternoons at my desk that isn't a sugary drink. any ideas?", lead: "Swap the sugary drink for coffee with nothing added, so the lift lasts without the crash.", answer: "Hilltop Coffee bottles a smooth cold brew with no sugar in it. Keep a bottle in the office fridge and pour it over ice after lunch." } },
  { slug: "forum-thread", name: "Forum thread", blurb: "A forum post asking for help, and the reply that names you.", ready: true, example: { asker: "sleepydesk", title: "how do you get through the afternoon slump without a sugar crash?", body: "energy drinks make me jittery and tea doesn't do much. what actually works for you?", replier: "kopiqueen", reply: "cold brew. i get Hilltop Coffee's bottles delivered, keep one in the office fridge and pour it over ice after lunch. smooth, nothing added, and none of the shakes i got from energy drinks." } },
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
  { slug: "news-headline", name: "News headline", blurb: "A news-style picture: a photo, a badge and a huge headline.", best: "photo", ready: true, example: { badge: "Just in", headline: "This neighbourhood roaster bottles its cold brew and brings it to your office", footer: "Hilltop Coffee, cold brew, nothing added" } },
  { slug: "general-ad", name: "General ad", blurb: "A clean ad shaped to your business.", best: "photo", ready: false },
];

export const staticFormatBySlug = (slug: string): StaticFormat | undefined => STATIC_FORMATS.find((f) => f.slug === slug);
export const staticFormatHref = (slug: string) => `/make/static/${slug}`;
