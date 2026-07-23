// Sub-navigation for merged sections. Routes stay intact (deep links, query
// params keep working) — the sidebar shows one entry per group and these tabs
// move between the group's pages.
import { NavLink } from "react-router-dom";

export type SectionTab = { to: string; label: string; end?: boolean };

// Write group: the drafting surfaces.
export const WRITE_TABS: SectionTab[] = [
  { to: "/generate", label: "Write", end: true },
  { to: "/generate/batch", label: "Batch" },
];

// Playbook group: the strategy that steers every draft — positioning, voice,
// and the F.A.D.S. worksheet that produces both.
export const PLAYBOOK_TABS: SectionTab[] = [
  { to: "/playbook", label: "My Playbook" },
  { to: "/voice", label: "Your voice" },
  { to: "/fads", label: "F.A.D.S." },
];

// Pipeline group: one flow from plan to posted.
export const PIPELINE_TABS: SectionTab[] = [
  { to: "/plan", label: "Plan a week" },
  { to: "/calendar", label: "Calendar" },
  { to: "/board", label: "Board" },
  { to: "/drafts", label: "My posts" },
];

// Performance group: numbers first, then the craft check.
export const PERFORMANCE_TABS: SectionTab[] = [
  { to: "/analytics", label: "Analytics" },
  { to: "/coach", label: "Coach" },
];

export default function SectionTabs({ tabs }: { tabs: SectionTab[] }) {
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
