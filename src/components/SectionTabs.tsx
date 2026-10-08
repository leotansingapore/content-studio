// Sub-navigation for tabbed sections on phones and tablets. Routes stay intact
// (deep links, query params keep working). From lg up, rail 2 of the shell
// lists the same pages, so these tabs step aside there.
import { useEffect, useState, useSyncExternalStore } from "react";
import { NavLink } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { section, visiblePages, type NavPage } from "@/lib/nav";

export type SectionTab = NavPage;

export const WRITE_TABS = section("write").pages;
export const PLAYBOOK_TABS = section("playbook").pages;
export const PIPELINE_TABS = section("pipeline").pages;
export const RECRUIT_TABS = section("recruit").pages;
export const LEARN_TABS = section("learn").pages;

// Matches the shell's lg breakpoint, where the two rails appear.
const RAILS = "(min-width: 1024px)";
const onRailsChange = (cb: () => void) => {
  const m = window.matchMedia(RAILS);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
};
const railsShown = () => window.matchMedia(RAILS).matches;

export default function SectionTabs({ tabs, className = "" }: { tabs: SectionTab[]; className?: string }) {
  const [email, setEmail] = useState("");
  const rails = useSyncExternalStore(onRailsChange, railsShown);
  const gated = tabs.some((t) => t.owners);
  useEffect(() => {
    if (gated) supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
  }, [gated]);
  if (rails) return null;
  return (
    <nav
      aria-label="Section"
      data-nav
      className={`flex w-fit max-w-full flex-wrap gap-1 rounded-lg border border-border/60 bg-muted/30 p-1 ${className}`}
    >
      {visiblePages(tabs, email).map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end={t.end}
          className={({ isActive }) =>
            `flex min-h-10 items-center whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-semibold transition-colors sm:min-h-0 ${
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
