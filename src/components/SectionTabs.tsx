// Sub-navigation for merged sections. Routes stay intact (deep links, query
// params keep working) — the sidebar shows one entry per group and these tabs
// move between the group's pages.
import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { REELS_BOARD_OWNERS } from "@/lib/reelsBoard";

export type SectionTab = { to: string; label: string; end?: boolean; /** Shown only to these sign-ins. */ owners?: string[] };

// Write group: the drafting surfaces.
export const WRITE_TABS: SectionTab[] = [
  { to: "/generate", label: "Write", end: true },
  { to: "/generate/batch", label: "Batch" },
  { to: "/carousel", label: "Carousel" },
  { to: "/edit", label: "Video" },
];

// Playbook group: the strategy that steers every draft — positioning, voice,
// and the F.A.D.S. worksheet that produces both.
export const PLAYBOOK_TABS: SectionTab[] = [
  { to: "/playbook", label: "My Playbook" },
  { to: "/voice", label: "Your voice" },
  { to: "/fads", label: "F.A.D.S." },
];

// Pipeline group: calendar, board, and posted.
export const PIPELINE_TABS: SectionTab[] = [
  { to: "/calendar", label: "Calendar" },
  { to: "/board", label: "Board" },
  { to: "/drafts", label: "My posts" },
  { to: "/reels", label: "Reels", owners: REELS_BOARD_OWNERS },
];

// Recruit group: the #TopofMind recruitment kit, one Brand Brain behind all three.
export const RECRUIT_TABS: SectionTab[] = [
  { to: "/recruit", label: "Brand Brain", end: true },
  { to: "/recruit/conversations", label: "Conversations" },
  { to: "/recruit/agent", label: "AI agent" },
];

// Coach is now its own top-level destination (not a Performance sub-tab), so
// Performance no longer needs a tab group.

// Learn group: every teaching surface in one place.
export const LEARN_TABS: SectionTab[] = [
  { to: "/academy", label: "Academy" },
  { to: "/create-guide", label: "How to post" },
  { to: "/tutorial", label: "How the studio works" },
];

export default function SectionTabs({ tabs }: { tabs: SectionTab[] }) {
  const [email, setEmail] = useState("");
  const gated = tabs.some((t) => t.owners);
  useEffect(() => {
    if (gated) supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email?.toLowerCase() ?? ""));
  }, [gated]);
  tabs = tabs.filter((t) => !t.owners || t.owners.includes(email));
  return (
    <nav
      aria-label="Section"
      className="flex w-fit max-w-full flex-wrap gap-1 rounded-lg border border-border/60 bg-muted/30 p-1"
    >
      {tabs.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end={t.end}
          className={({ isActive }) =>
            `whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
              isActive
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`
          }
        >
          {t.label}
        </NavLink>
      ))}
    </nav>
  );
}
