// Every format a post can be made in (docs/north-star/items/formats-gallery.md): the /make gallery's cards, the
// /make/<slug> pages MakeFormatPage finds by slug, and the Remix sheet's "Also make" row. A card links to its own
// /make page (Component) or to a page elsewhere (to). Prices come from the price table, never a typed number.
// `ready` and `preview` are the integrator's: a card shows in the gallery once its item ships, and a page that is not
// ready still opens for Leo at /make/<slug>, so its builder can check it there.

import { lazy, type ComponentType, type LazyExoticComponent } from "react";
import { links, type ExplainerLook } from "@/lib/links";
import { WRITE_PRICE, priceOf, sumPrices, type Price } from "@/lib/prices";
import type { RemixSource } from "@/lib/remixSource";
import { TEMPLATES, type VideoTemplate } from "../../supabase/functions/ai-video/templates.ts";
import type { UsageFeature } from "../../supabase/functions/_shared/usageCaps.ts";

export type FormatKind = "video" | "slides" | "text" | "image";
export type FormatNeed = "demo-video" | "photo" | "own-video" | "own-media" | "reel-video";

export const NEED_LINES: Record<FormatNeed, string> = {
  "demo-video": "Needs a demo video",
  photo: "Needs a photo of the person",
  "own-video": "Needs a video of you",
  "own-media": "Needs your own video or photos",
  "reel-video": "Needs a reel's video: Instagram or an upload",
};

type LinkOpts = { source?: string; mention?: "no" };

export interface FormatDef {
  /** Unique, kebab-case; a /make/<slug> page when Component is set. */
  slug: string;
  name: string;
  blurb: string;
  kind: FormatKind;
  /** Gallery order: cents or nothing, made without filming, people, your own footage. */
  group: 1 | 2 | 3 | 4;
  /** The cap whose uses left the card shows; none means "No AI cost". */
  cap?: UsageFeature;
  /** The default options' price, from priceOf and sumPrices. */
  price(): Price | "pick" | null;
  needs?: FormatNeed;
  /** A page outside /make, built with links.*. */
  to?: (o: LinkOpts) => string;
  Component?: LazyExoticComponent<ComponentType<{ userId: string; source: RemixSource | null }>>;
  /** Listed in the Remix sheet's "Also make" row. */
  alsoMake?: true;
  /** Its /make page opens for every sign-in, not only Leo's (the server's remix OPEN_MAKES says the same). */
  everyone?: true;
  /** Integrator only. */
  ready: boolean;
  /** public/formats/<slug>.webp and .mp4 exist. Integrator only. */
  preview?: true;
}

export type PageFormat = FormatDef & { cap: UsageFeature; Component: NonNullable<FormatDef["Component"]> };

/** A price whose options can make it dearer: "From US$0.82". */
const from = (p: Price | "pick" | null): Price | "pick" | null => (p && p !== "pick" ? { ...p, kind: "from" } : p);

export const explainerPrice = () => sumPrices(priceOf("ai-video", { scenes: 5 }), priceOf("ai-voice"), priceOf("ai-video-script"));
const presenterTalkPrice = () => sumPrices(priceOf("ai-video", { seconds: 25 }), priceOf("ai-video-script"), priceOf("ai-voice"), priceOf("ai-image"));

const LOOKS: { id: Exclude<ExplainerLook, "photo">; name: string; blurb: string }[] = [
  { id: "clay", name: "Clay", blurb: "A narrated video in handmade clay figures and sets." },
  { id: "paper", name: "Paper cutout", blurb: "A narrated video in layered paper cutouts." },
  { id: "felt", name: "Felt", blurb: "A narrated video in soft felted wool figures." },
  { id: "chalk", name: "Chalkboard", blurb: "A narrated video drawn in chalk on a green board." },
  { id: "comic", name: "Comic book", blurb: "A narrated video in bold comic book panels." },
  { id: "cartoon3d", name: "3D cartoon", blurb: "A narrated video with bright, rounded 3D characters." },
  { id: "storybook", name: "Storybook", blurb: "A narrated video in soft watercolour pictures." },
];

const TALKS: { slug: string; talk: "news" | "stage" | "spokesperson"; name: string; blurb: string }[] = [
  { slug: "news-anchor", talk: "news", name: "News anchor", blurb: "Your point told like a story from a news desk, with a headline banner." },
  { slug: "stage-talk", talk: "stage", name: "Stage talk", blurb: "One idea told from a conference stage, like a short talk." },
  { slug: "spokesperson", talk: "spokesperson", name: "Spokesperson", blurb: "Someone presenting your offer, with its picture on screen." },
];

/** One card per editor template, leaving out the ones the editor hides. */
export function templateFormats(list: VideoTemplate[]): FormatDef[] {
  return list
    .filter((t) => !t.hidden)
    .map((t) => ({
      slug: `template-${t.id}`,
      name: t.title,
      blurb: t.blurb,
      kind: "video",
      group: 2,
      cap: "ai-clip",
      // the editor opens at 8 s and 720p, so the card prices what pressing it makes (the gallery check, 21 Oct)
      price: () => priceOf("ai-clip", { seconds: 8, quality: "720p" }),
      needs: t.needsPhoto ? "photo" : undefined,
      to: () => links.edit({ panel: ["ai"], kind: "template", template: t.id }),
      ready: true,
    }));
}

export const FORMATS: FormatDef[] = [
  // 1: cents or nothing
  {
    slug: "slideshow",
    name: "Slideshow",
    blurb: "Photo slides with words on them, for Instagram and TikTok.",
    kind: "slides",
    group: 1,
    cap: "remix-make",
    price: () => priceOf("remix-make"),
    Component: lazy(() => import("@/components/make/Slideshow")),
    alsoMake: true,
    // on for everyone (Leo, 30 Oct: "Slideshows for everyone")
    everyone: true,
    ready: true,
  },
  {
    slug: "wall-of-text",
    name: "Wall of text",
    blurb: "Bold words over a video, the kind people stop to read.",
    kind: "video",
    group: 1,
    cap: "remix-make",
    price: () => priceOf("remix-make"),
    Component: lazy(() => import("@/components/make/WallOfText")),
    alsoMake: true,
    ready: true,
  },
  {
    slug: "notification-stack",
    name: "Notification stack",
    blurb: "A client's worries pop up one by one as phone notifications, then one big word.",
    kind: "video",
    group: 1,
    // Jev picks the stock clip; nothing is written or generated
    cap: "montage-pick",
    price: () => priceOf("montage-pick"),
    Component: lazy(() => import("@/components/make/NotificationStack")),
    ready: true,
  },
  {
    slug: "static-ad",
    name: "Static ad",
    blurb: "One designed picture with your words: a headline, a quote, a stat or a client's words.",
    kind: "image",
    group: 1,
    cap: "remix-make",
    price: () => priceOf("remix-make"),
    to: (o) => links.image({ source: o.source }),
    alsoMake: true,
    ready: true,
  },
  {
    slug: "meme",
    name: "Meme",
    blurb: "A picture with a joke your audience gets, in a layout they know.",
    kind: "image",
    group: 1,
    cap: "remix-make",
    price: () => priceOf("remix-make"),
    to: (o) => links.image({ layout: "top-bottom", source: o.source }),
    alsoMake: true,
    ready: true,
  },
  {
    slug: "carousel",
    name: "Carousel",
    blurb: "Swipe-through slides drawn from your post.",
    kind: "slides",
    group: 1,
    price: () => null,
    to: () => links.carousel(),
    ready: true,
  },
  {
    slug: "text-post",
    name: "Text post",
    blurb: "A written post in your voice for LinkedIn, Instagram or Facebook.",
    kind: "text",
    group: 1,
    price: () => WRITE_PRICE,
    to: () => links.generate({ format: "text-post" }),
    ready: true,
  },
  {
    slug: "script",
    name: "Short video script",
    blurb: "A script to film yourself, with the hook first.",
    kind: "text",
    group: 1,
    price: () => WRITE_PRICE,
    to: () => links.generate({ format: "short-video" }),
    ready: true,
  },
  {
    slug: "montage",
    name: "Stock montage",
    blurb: "Free stock clips cut to a theme, ready for your words.",
    kind: "video",
    group: 1,
    cap: "montage-beats",
    price: () => priceOf("montage-beats"),
    to: () => links.edit({ panel: ["ai"], kind: "montage" }),
    ready: true,
  },
  {
    // north star phase 7a: a stub page until film-studio (wave 2) replaces LaunchFilm.tsx
    slug: "launch-film",
    name: "Launch film",
    blurb: "A film of your product, made from your brand and app screens.",
    kind: "video",
    group: 1,
    cap: "launch-film",
    price: () => priceOf("launch-film"),
    Component: lazy(() => import("@/components/make/LaunchFilm")),
    ready: false,
  },
  // 2: made without filming
  {
    slug: "text-over-clip",
    name: "Words over a made scene",
    blurb: "Your words over a short clip we make for you: a kitchen, a walk, an interview.",
    kind: "video",
    group: 2,
    cap: "ai-clip",
    price: () => sumPrices(priceOf("remix-make"), priceOf("ai-clip", { seconds: 8, quality: "480p" })),
    Component: lazy(() => import("@/components/make/TextOverClip")),
    alsoMake: true,
    ready: true,
  },
  {
    slug: "explainer",
    name: "Narrated video",
    blurb: "A voiceover over pictures made for each scene of your script.",
    kind: "video",
    group: 2,
    cap: "ai-video",
    price: explainerPrice,
    to: () => links.edit({ panel: ["ai"], kind: "explainer" }),
    ready: true,
  },
  ...LOOKS.map(
    (l): FormatDef => ({
      slug: `look-${l.id}`,
      name: l.name,
      blurb: l.blurb,
      kind: "video",
      group: 2,
      cap: "ai-video",
      price: explainerPrice,
      to: () => links.edit({ panel: ["ai"], kind: "explainer", look: l.id }),
      ready: false,
    }),
  ),
  ...templateFormats(TEMPLATES),
  // 3: people
  {
    slug: "talking-head",
    name: "Talking head",
    blurb: "You, or an AI presenter, saying your script to the phone camera.",
    kind: "video",
    group: 3,
    cap: "ai-video",
    price: () => sumPrices(priceOf("remix-make"), priceOf("ai-video", { seconds: 15 }), priceOf("ai-voice"), priceOf("ai-image")),
    Component: lazy(() => import("@/components/make/TalkingHead")),
    alsoMake: true,
    ready: true,
  },
  {
    slug: "green-screen",
    name: "Green screen",
    blurb: "You in front of a list, a demo or a picture.",
    kind: "video",
    group: 3,
    cap: "remix-make",
    price: () => from(priceOf("remix-make")),
    Component: lazy(() => import("@/components/make/GreenScreen")),
    ready: true,
  },
  {
    slug: "hook-demo",
    name: "Hook plus demo",
    blurb: "A hook that stops the scroll, then your demo.",
    kind: "video",
    group: 3,
    cap: "remix-make",
    price: () => from(priceOf("remix-make")),
    needs: "demo-video",
    Component: lazy(() => import("@/components/make/HookDemo")),
    ready: true,
  },
  ...TALKS.map(
    (t): FormatDef => ({
      slug: t.slug,
      name: t.name,
      blurb: t.blurb,
      kind: "video",
      group: 3,
      cap: "ai-video",
      price: presenterTalkPrice,
      to: () => links.edit({ panel: ["ai"], kind: "avatar", talk: t.talk }),
      ready: false,
    }),
  ),
  {
    // north star phase 7a: a stub page until same-edit-page (wave 2) replaces SameEdit.tsx. The first version with a
    // face: its script, a 15 s Speak run and the voice; the edit's read is its own press.
    slug: "same-edit",
    name: "Same edit, your version",
    blurb: "A reel's cuts, on-screen text and pacing, rebuilt with your words.",
    kind: "video",
    group: 3,
    cap: "ai-video",
    price: () => sumPrices(priceOf("remix-make"), priceOf("ai-video", { seconds: 15 }), priceOf("ai-voice")),
    needs: "reel-video",
    Component: lazy(() => import("@/components/make/SameEdit")),
    ready: false,
  },
  // 4: your own footage
  {
    slug: "own-media",
    name: "Your own video or pictures",
    blurb: "Your footage or photos with words, captions and sound.",
    kind: "video",
    group: 4,
    cap: "own-words",
    price: () => sumPrices(priceOf("own-words"), priceOf("ai-voice")),
    needs: "own-media",
    to: () => links.edit({ panel: ["own"] }),
    ready: true,
  },
  {
    slug: "clips",
    name: "Long video into clips",
    blurb: "A webinar, podcast or call recording cut into ranked short clips.",
    kind: "video",
    group: 4,
    cap: "video-clips",
    price: () => sumPrices(priceOf("video-transcribe", { minutes: 60 }), priceOf("video-clips", { passes: 2 })),
    needs: "own-video",
    to: () => links.edit({ panel: ["clips"] }),
    ready: true,
  },
  {
    slug: "edit-own",
    name: "Edit your own video",
    blurb: "Captions, cuts and stickers on a video you filmed.",
    kind: "video",
    group: 4,
    price: () => null,
    needs: "own-video",
    to: () => links.edit(),
    ready: true,
  },
];

/** Format pages only (an entry with a Component), so Slideshow.tsx and WallOfText.tsx read their cap without a check. */
export const formatBySlug = (slug: string | undefined): PageFormat | null =>
  (FORMATS.find((f): f is PageFormat => f.slug === slug && !!f.Component && !!f.cap) ?? null);

/** Where a card goes: its own page elsewhere, else /make/<slug> with the shared params. */
export function formatHref(f: FormatDef, o: LinkOpts = {}): string {
  return f.to ? f.to(o) : links.makeFormat(f.slug, { source: o.source, mention: o.mention });
}

/** The gallery's filters: a kind ("all" or none for every kind), and only the formats that need nothing extra. */
export function filterFormats(list: FormatDef[], o: { kind?: FormatKind | "all"; needsNone?: boolean }): FormatDef[] {
  return list.filter((f) => (!o.kind || o.kind === "all" || f.kind === o.kind) && (!o.needsNone || !f.needs));
}

/** The Remix sheet's "Also make" links: ready ones only; go (make on arrival) only under US$1, so a dearer one asks first on its page. */
export function alsoMakeList(list: FormatDef[]): { f: FormatDef; go: boolean }[] {
  return list
    .filter((f) => f.ready && f.alsoMake)
    .map((f) => {
      const p = f.price();
      return { f, go: p !== "pick" && (p === null || p.usd < 1) };
    });
}

// The caps the format pages spend, worded as the Remix sheet's VIDEO_LIMITS.
const CAP_NOUNS: Partial<Record<UsageFeature, string>> = {
  "remix-make": "remixes",
  "ai-video": "videos",
  "ai-clip": "AI clips",
  "ai-voice": "voiceovers",
  "ai-image": "AI pictures",
};

/** Why a button that spends several caps is off: the first one used up, named, or null while every one has a use left. */
export function usedUpLine(caps: UsageFeature[], left: (f: UsageFeature) => number | null): string | null {
  const out = caps.find((c) => left(c) === 0);
  if (!out) return null;
  const noun = CAP_NOUNS[out];
  return `${noun ? `No ${noun} left today.` : "One of its steps has no uses left today."} Back at 8am Singapore time.`;
}
