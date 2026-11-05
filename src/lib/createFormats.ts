// The ways to make something new, in one place: Studio's Formats row and the create menu (sidebar New post, phone
// Create) both list these, so the two never drift.
import { CalendarClock, FileText, Images, Layers, LayoutTemplate, PenLine, Video, type LucideIcon } from "lucide-react";

export type CreateFormat = { to: string; name: string; blurb: string; icon: LucideIcon };

export const CREATE_FORMATS: CreateFormat[] = [
  { to: "/generate", name: "Post", blurb: "A post in your voice, from a topic", icon: PenLine },
  { to: "/generate/batch", name: "Batch", blurb: "Several posts in one go", icon: FileText },
  { to: "/carousel", name: "Carousel", blurb: "Slides from a post or your notes", icon: Layers },
  { to: "/slideshow", name: "Slideshow", blurb: "Photo slides with your words on them", icon: Images },
  { to: "/design", name: "Design", blurb: "TikTok and Instagram slides from 16 templates", icon: LayoutTemplate },
  { to: "/design/campaigns", name: "Campaign", blurb: "A new TikTok slideshow on a schedule", icon: CalendarClock },
  { to: "/edit", name: "Video", blurb: "Cut and caption a video you filmed", icon: Video },
];
