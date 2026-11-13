// What Create's first screen offers (StudioPage): six big choices, each one tap from its maker, and the rest behind
// "More formats". Every one is a page every sign-in can open (createFormats.test.ts), named as the nav names it.
import { groupedPages, section } from "@/lib/nav";
import { CalendarDotsIcon, FilmSlateIcon, FileTextIcon, ImagesIcon, StackIcon, LayoutIcon, ChatCircleDotsIcon, PencilLineIcon, SparkleIcon, VideoCameraIcon, type Icon } from "@phosphor-icons/react";

export type CreateFormat = { to: string; name: string; blurb: string; icon: Icon };

export const CREATE_FORMATS: CreateFormat[] = [
  { to: "/generate", name: "Post", blurb: "A post in your voice, from a topic", icon: PencilLineIcon },
  { to: "/carousel", name: "Carousel", blurb: "Slides from a post or your notes", icon: StackIcon },
  { to: "/slideshow", name: "Slideshow", blurb: "Photo slides with your words on them", icon: ImagesIcon },
  { to: "/edit", name: "Video", blurb: "Cut and caption a video you filmed", icon: VideoCameraIcon },
  { to: "/generate/batch", name: "Weekly batch", blurb: "A week of posts in one go", icon: CalendarDotsIcon },
  { to: "/generate/answer", name: "Answer", blurb: "A reply to a question people ask you", icon: ChatCircleDotsIcon },
];

/** The other makers every sign-in has, behind "More formats". */
export const MORE_FORMATS: CreateFormat[] = [
  { to: "/design", name: "Design", blurb: "TikTok and Instagram slides from 16 templates", icon: LayoutIcon },
  { to: "/design/campaigns", name: "Auto slideshows", blurb: "A new TikTok slideshow on a schedule", icon: CalendarDotsIcon },
  { to: "/generate/vsl", name: "Sales script", blurb: "A video sales letter from seven answers", icon: FileTextIcon },
  { to: "/hooks", name: "Hooks", blurb: "First lines in bulk, keep the good ones", icon: SparkleIcon },
  { to: "/make/hook-demo", name: "Hook + demo", blurb: "A hook that stops the scroll, then your demo", icon: FilmSlateIcon },
  { to: "/clone", name: "Clone a reel", blurb: "A script from a reel that worked", icon: FilmSlateIcon },
];

// The kinds Create's type tabs filter by are the headings of the Create tab's picker (nav.ts `head`), so the two
// cannot drift: a maker's kind is the heading it sits under there.
const CREATE_PAGES = groupedPages(section("write").pages).filter((p) => p.group === "Create");
export const CREATE_KINDS: string[] = CREATE_PAGES.flatMap((p) => (p.head ? [p.head] : []));

/** The kind of the maker at this address: its heading in the Create picker; null for a page that is not a maker. */
export function kindOf(to: string): string | null {
  let head: string | null = null;
  for (const p of CREATE_PAGES) {
    head = p.head ?? head;
    if (p.to === to) return head;
  }
  return null;
}

/** The catalogue's own kinds (src/data/formats.ts) under the same three names. */
export const kindOfFormat = (kind: "video" | "slides" | "text" | "image"): string =>
  CREATE_KINDS[kind === "text" ? 0 : kind === "video" ? 2 : 1];
