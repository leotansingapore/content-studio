// The open section's pages as a tab row at the top of every page, after Fastlane (docs/fastlane-nav-gap.md), with the
// open group's pages as chips under it. The shell renders it once, above the page. Routes stay intact (deep links,
// query params keep working).
import { Link, useLocation } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { sectionTabs, type Tab } from "@/lib/nav";

const tabClass = (active: boolean) =>
  `flex min-h-9 shrink-0 items-center whitespace-nowrap rounded-lg border px-3 text-sm font-medium transition-colors [@media(pointer:coarse)]:min-h-11 ${
    active ? "border-border bg-background text-foreground shadow-sm" : "border-transparent text-muted-foreground hover:text-foreground"
  }`;

// The open tab's pages: a quieter row than the page's own filter chips, so moving to a page never reads as filtering it.
const chipClass = (active: boolean) =>
  `inline-flex h-9 shrink-0 items-center whitespace-nowrap rounded-md px-2.5 text-xs font-medium transition-colors sm:h-7 [@media(pointer:coarse)]:min-h-11 ${
    active ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
  }`;

function Row({ tabs, cls }: { tabs: Tab[]; cls: (active: boolean) => string }) {
  return (
    <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none]">
      {tabs.map((t) => (
        <Link key={t.to} to={t.to} aria-current={t.active ? "page" : undefined} className={cls(t.active)}>
          {t.label}
        </Link>
      ))}
    </div>
  );
}

export default function SectionTabs({ email }: { email: string }) {
  const { pathname } = useLocation();
  const { tabs, chips, back } = sectionTabs(pathname, email);
  if (back)
    return (
      <nav aria-label="Section" data-nav className="mb-4">
        <Link to={back.to} className="inline-flex min-h-9 items-center gap-1 rounded-lg pr-2 text-sm text-muted-foreground transition-colors hover:text-foreground [@media(pointer:coarse)]:min-h-11">
          <ChevronLeft className="h-4 w-4" /> {back.label}
        </Link>
      </nav>
    );
  if (!tabs.length && !chips.length) return null;
  return (
    <nav aria-label="Section" data-nav className="mb-6 space-y-3">
      {tabs.length > 0 && <Row tabs={tabs} cls={tabClass} />}
      {chips.length > 0 && <Row tabs={chips} cls={chipClass} />}
    </nav>
  );
}
