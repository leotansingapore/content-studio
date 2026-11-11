// What Create's first screen offers (StudioPage): six big choices, each one tap from its maker, and the rest behind
// "More formats". Every one is a page every sign-in can open (createFormats.test.ts), named as the nav names it.
import { CalendarClock, CalendarDays, Clapperboard, FileText, Images, Layers, LayoutTemplate, MessageCircleQuestion, PenLine, Sparkles, Video, type LucideIcon } from "lucide-react";

export type CreateFormat = { to: string; name: string; blurb: string; icon: LucideIcon };

export const CREATE_FORMATS: CreateFormat[] = [
  { to: "/generate", name: "Post", blurb: "A post in your voice, from a topic", icon: PenLine },
  { to: "/carousel", name: "Carousel", blurb: "Slides from a post or your notes", icon: Layers },
  { to: "/slideshow", name: "Slideshow", blurb: "Photo slides with your words on them", icon: Images },
  { to: "/edit", name: "Video", blurb: "Cut and caption a video you filmed", icon: Video },
  { to: "/generate/batch", name: "Weekly batch", blurb: "A week of posts in one go", icon: CalendarDays },
  { to: "/generate/answer", name: "Answer", blurb: "A reply to a question people ask you", icon: MessageCircleQuestion },
];

/** The other makers every sign-in has, behind "More formats". */
export const MORE_FORMATS: CreateFormat[] = [
  { to: "/design", name: "Design", blurb: "TikTok and Instagram slides from 16 templates", icon: LayoutTemplate },
  { to: "/design/campaigns", name: "Auto slideshows", blurb: "A new TikTok slideshow on a schedule", icon: CalendarClock },
  { to: "/generate/vsl", name: "Sales script", blurb: "A video sales letter from seven answers", icon: FileText },
  { to: "/hooks", name: "Hooks", blurb: "First lines in bulk, keep the good ones", icon: Sparkles },
  { to: "/make/hook-demo", name: "Hook + demo", blurb: "A hook that stops the scroll, then your demo", icon: Clapperboard },
  { to: "/clone", name: "Clone a reel", blurb: "A script from a reel that worked", icon: Clapperboard },
];
