import { useEffect, useId, useMemo, useRef, useState } from "react";
import SectionTabs, { PIPELINE_TABS } from "@/components/SectionTabs";
import { useNavigate } from "react-router-dom";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { supabase } from "@/lib/supabase";
import {
  Trash2,
  Search,
  Pencil,
  Sparkles,
  CheckCircle2,
  Undo2,
  CalendarClock,
  Wand2,
  X,
  GalleryHorizontalEnd,
  Tag,
  CopyPlus,
  Upload,
  MoreHorizontal,
} from "lucide-react";
import {
  deleteDraft,
  loadDrafts,
  saveDrafts,
  setDraftStatus,
  setDraftMetrics,
  draftStatus,
  duplicateDraft,
  undoDuplicate,
  markUnposted,
  restoreDraft,
  MAX_DRAFTS,
  type DraftEntry,
  type DraftStatus,
} from "@/lib/draftHistory";
import { keyToDate, localDateKey, scheduleAt, scheduleTime, timeLabel } from "@/lib/dueDates";
import { repurposeTargetsFor, buildRepurposeUrl } from "@/lib/repurpose";
import DraftReviewControl from "@/components/team/DraftReviewControl";
import { LabelChip, LabelManager, LabelPicker } from "@/components/Labels";
import { loadLabels, setDraftLabels, type Label as ContentLabel } from "@/lib/labels";
import CsvImport from "@/components/CsvImport";
import DayInput from "@/components/DayInput";
import { loadPositioning } from "@/lib/positioning";
import { useDraftReviews } from "@/hooks/useDraftReviews";

const PLATFORM_LABEL: Record<string, string> = {
  linkedin: "LinkedIn",
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
};

const PILLAR_LABEL: Record<string, string> = {
  interest: "Interest",
  identity: "Identity",
  topic: "Topic",
  market: "Market",
};

type MenuItem = { label: string; icon: typeof Pencil; onSelect: () => void };

// A card's less-used actions behind one "More" button (menu button pattern: Enter,
// Space or the arrow keys open it, arrows move, Escape closes and returns focus).
function MoreMenu({ items }: { items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const focusItem = (i: number) => itemRefs.current[(i + items.length) % items.length]?.focus();
  const openAt = (i: number) => {
    setOpen(true);
    requestAnimationFrame(() => focusItem(i));
  };
  const close = () => {
    setOpen(false);
    button.current?.focus();
  };

  return (
    <div ref={root} className="relative">
      <Button
        ref={button}
        size="sm"
        variant="ghost"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => (open ? setOpen(false) : openAt(0))}
        onKeyDown={(e) => {
          if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
          e.preventDefault();
          openAt(e.key === "ArrowDown" ? 0 : items.length - 1);
        }}
        className="h-11 gap-1.5 text-xs text-muted-foreground sm:h-9"
      >
        <MoreHorizontal className="h-3.5 w-3.5" /> More
      </Button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label="More actions"
          onKeyDown={(e) => {
            const i = itemRefs.current.indexOf(document.activeElement as HTMLButtonElement);
            const to = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: items.length - 1 }[e.key];
            if (to !== undefined) {
              e.preventDefault();
              focusItem(to);
            } else if (e.key === "Escape") {
              e.preventDefault();
              close();
            } else if (e.key === "Tab") setOpen(false);
          }}
          className="absolute bottom-full right-0 z-30 mb-1 w-52 rounded-xl border border-border/70 bg-popover p-1 shadow-elegant"
        >
          {items.map((it, i) => (
            <button
              key={it.label}
              ref={(el) => (itemRefs.current[i] = el)}
              type="button"
              role="menuitem"
              tabIndex={-1}
              onClick={() => {
                close();
                it.onSelect();
              }}
              className="flex h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm text-foreground hover:bg-accent focus:bg-accent focus:outline-none sm:h-9"
            >
              <it.icon className="h-4 w-4 shrink-0 text-muted-foreground" /> {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function DraftsPage() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<DraftEntry[]>([]);
  const [platformFilter, setPlatformFilter] = useState<string>("all");
  const [pillarFilter, setPillarFilter] = useState<string>("all");
  const [search, setSearch] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<"all" | DraftStatus>("all");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [repurposeOpenId, setRepurposeOpenId] = useState<string | null>(null);
  const [labels, setLabels] = useState<ContentLabel[]>([]);
  const [labelFilter, setLabelFilter] = useState<string>("all");
  const [labelOpenId, setLabelOpenId] = useState<string | null>(null);
  const [manageLabels, setManageLabels] = useState(false);
  // A just-made copy: scrolled to and outlined for a moment.
  const [flashId, setFlashId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  useEffect(() => {
    if (!flashId) return;
    document.getElementById(`post-${flashId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    const t = setTimeout(() => setFlashId(null), 2400);
    return () => clearTimeout(t);
  }, [flashId]);
  const reviews = useDraftReviews(userId, drafts);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!active) return;
      const id = data.user?.id ?? null;
      setUserId(id);
      setDrafts(loadDrafts(id));
      setLabels(loadLabels(id));
    })();
    return () => {
      active = false;
    };
  }, []);

  const today = localDateKey();
  // The same counts as Home's stat cards.
  const counts = useMemo(() => {
    const c = { draft: 0, scheduled: 0, posted: 0 };
    for (const d of drafts) c[draftStatus(d)]++;
    return c;
  }, [drafts]);
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return drafts.filter((d) => {
      if (statusFilter !== "all" && draftStatus(d) !== statusFilter) return false;
      if (platformFilter !== "all" && d.platform !== platformFilter) return false;
      if (pillarFilter !== "all" && d.pillar !== pillarFilter) return false;
      if (labelFilter === "none" ? labels.some((l) => d.labels?.includes(l.id)) : labelFilter !== "all" && !d.labels?.includes(labelFilter)) return false;
      if (!q) return true;
      const blob = `${d.hook} ${d.draft}`.toLowerCase();
      return blob.includes(q);
    });
  }, [drafts, statusFilter, platformFilter, pillarFilter, labelFilter, labels, search]);

  const openManager = () => {
    setManageLabels(true);
    setLabelOpenId(null);
    requestAnimationFrame(() => document.getElementById("label-manager")?.scrollIntoView({ behavior: "smooth", block: "center" }));
  };

  const handleSetStatus = (id: string, status: DraftStatus, when?: string) => {
    if (!userId) return;
    setDrafts(setDraftStatus(userId, id, status, when));
  };

  // Back to Scheduled on its day, time and repeat (or to drafts if it never had a day).
  const handleUnpost = (prev: DraftEntry) => {
    if (!userId) return;
    const back = markUnposted(userId, prev.id);
    setDrafts(back);
    const when = back.find((d) => d.id === prev.id)?.scheduledFor;
    const time = scheduleTime(when);
    toast({
      title: when ? "Back to scheduled" : "Back to drafts",
      description: when
        ? keyToDate(when.slice(0, 10)).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }) + (time ? `, ${timeLabel(time)}` : "")
        : undefined,
      action: (
        <ToastAction altText="Undo" onClick={() => setDrafts(restoreDraft(userId, prev))}>
          Undo
        </ToastAction>
      ),
    });
  };

  const handleMetric = (
    id: string,
    field: "impressions" | "reactions" | "comments" | "shares",
    value: string,
  ) => {
    if (!userId) return;
    const n = Math.max(0, parseInt(value, 10) || 0);
    setDrafts(setDraftMetrics(userId, id, { [field]: n }));
  };

  const handleRestore = (id: string) => {
    navigate(`/generate?draft=${encodeURIComponent(id)}`);
  };

  const handleDuplicate = (id: string) => {
    if (!userId) return;
    const r = duplicateDraft(userId, id);
    if (!r) return;
    setDrafts(r.drafts);
    // The copy is a draft: make sure the list is showing drafts.
    if (statusFilter !== "all" && statusFilter !== "draft") setStatusFilter("all");
    setFlashId(r.copy.id);
    const pushedOut = r.dropped[0];
    toast({
      title: "Copy made",
      description: pushedOut
        ? `It's at the top as a draft. My posts keeps ${MAX_DRAFTS}, so "${(pushedOut.hook || pushedOut.draft).slice(0, 40) || "your oldest post"}" was removed. Undo brings it back.`
        : "It's at the top as a draft.",
      action: (
        <ToastAction altText="Undo" onClick={() => setDrafts(undoDuplicate(userId, r.copy.id, r.dropped))}>
          Undo
        </ToastAction>
      ),
    });
  };

  const handleImport = (entries: DraftEntry[]) => {
    if (!userId || !entries.length) return;
    saveDrafts(userId, [...entries, ...loadDrafts(userId)]);
    setDrafts(loadDrafts(userId));
    setImportOpen(false);
    // Show everything so the new posts are in view at the top.
    setStatusFilter("all");
    setPlatformFilter("all");
    setPillarFilter("all");
    setLabelFilter("all");
    setSearch("");
    setFlashId(entries[0].id);
    const ids = new Set(entries.map((e) => e.id));
    const scheduled = entries.filter((e) => e.scheduledFor).length;
    toast({
      title: `Imported ${entries.length} post${entries.length === 1 ? "" : "s"}`,
      description: `${scheduled} scheduled, ${entries.length - scheduled} saved as drafts.`,
      action: (
        <ToastAction
          altText="Undo"
          onClick={() => {
            saveDrafts(userId, loadDrafts(userId).filter((d) => !ids.has(d.id)));
            setDrafts(loadDrafts(userId));
          }}
        >
          Undo
        </ToastAction>
      ),
    });
  };

  const handleDelete = (id: string) => {
    if (!userId) return;
    if (confirmId !== id) {
      setConfirmId(id);
      return;
    }
    const next = deleteDraft(userId, id);
    setDrafts(next);
    setConfirmId(null);
    toast({
      title: "Draft deleted",
      description: "Removed from your history.",
    });
  };

  return (
    <div className="space-y-6">
      <SectionTabs tabs={PIPELINE_TABS} />
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-serif text-2xl font-semibold leading-tight tracking-tight text-foreground sm:text-3xl">
          My posts
        </h1>
        {!importOpen && userId && (
          <Button size="sm" variant="outline" onClick={() => setImportOpen(true)} className="gap-1.5">
            <Upload className="h-3.5 w-3.5" /> Import CSV
          </Button>
        )}
      </header>
      {importOpen && userId && (
        <CsvImport
          postCount={drafts.length}
          defaultPlatform={loadPositioning(userId)?.platform ?? "linkedin"}
          onImport={handleImport}
          onClose={() => setImportOpen(false)}
        />
      )}

      {drafts.length > 0 && (
        <>
      <div className="scrollbar-none flex gap-1.5 overflow-x-auto">
        {(
          [
            ["all", `All (${drafts.length})`],
            ["draft", `Drafts (${counts.draft})`],
            ["scheduled", `Scheduled (${counts.scheduled})`],
            ["posted", `Posted (${counts.posted})`],
          ] as [("all" | DraftStatus), string][]
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setStatusFilter(key)}
            className={`h-9 shrink-0 rounded-full border px-3 text-xs font-semibold transition-colors sm:h-8 ${
              statusFilter === key
                ? "border-primary/60 bg-primary/10 text-primary"
                : "border-border/70 bg-background text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <Card className="border-border/60 shadow-card">
        <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="font-serif text-xl">
            Filter your drafts
          </CardTitle>
          {!manageLabels && (
            <Button size="sm" variant="ghost" onClick={openManager} className="gap-1.5 text-xs text-muted-foreground">
              <Tag className="h-3.5 w-3.5" /> Labels
            </Button>
          )}
        </CardHeader>
        <CardContent className={`grid gap-3 ${labels.length ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-3"}`}>
          <div className="space-y-1.5">
            <Label>Platform</Label>
            <Select value={platformFilter} onValueChange={setPlatformFilter}>
              <SelectTrigger aria-label="Platform">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All platforms</SelectItem>
                <SelectItem value="linkedin">LinkedIn</SelectItem>
                <SelectItem value="instagram">Instagram</SelectItem>
                <SelectItem value="facebook">Facebook</SelectItem>
                <SelectItem value="tiktok">TikTok</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Pillar</Label>
            <Select value={pillarFilter} onValueChange={setPillarFilter}>
              <SelectTrigger aria-label="Pillar">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All pillars</SelectItem>
                <SelectItem value="interest">Interest</SelectItem>
                <SelectItem value="identity">Identity</SelectItem>
                <SelectItem value="topic">Topic</SelectItem>
                <SelectItem value="market">Market</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {labels.length > 0 && (
            <div className="space-y-1.5">
              <Label>Label</Label>
              <Select value={labelFilter} onValueChange={setLabelFilter}>
                <SelectTrigger aria-label="Label">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All labels</SelectItem>
                  {labels.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name}
                    </SelectItem>
                  ))}
                  <SelectItem value="none">No label</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Search</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Hook or body keyword"
                className="pl-7"
              />
            </div>
          </div>
        </CardContent>
      </Card>
      {manageLabels && userId && (
        <LabelManager
          userId={userId}
          labels={labels}
          drafts={drafts}
          onLabelsChange={setLabels}
          onDeleted={(nextLabels, nextDrafts, name, posts) => {
            setLabels(nextLabels);
            setDrafts(nextDrafts);
            if (labelFilter !== "all" && !nextLabels.some((l) => l.id === labelFilter)) setLabelFilter("all");
            toast({ title: `Deleted "${name}"`, description: posts ? `Taken off ${posts} post${posts === 1 ? "" : "s"}.` : undefined });
          }}
          onClose={() => setManageLabels(false)}
        />
      )}
        </>
      )}

      {visible.length === 0 ? (
        <Card className="border-border/60 shadow-card">
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center text-sm text-muted-foreground">
            <Sparkles className="h-6 w-6 text-primary" />
            {drafts.length === 0
              ? "No drafts yet. Generate one and pick a variant - it'll save here automatically."
              : "No drafts match the filters. Loosen them or clear the search."}
            <Button
              size="sm"
              onClick={() => navigate("/generate")}
              className="gap-1.5"
            >
              <Pencil className="h-3.5 w-3.5" /> Write a post
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {visible.map((d) => {
            const preview = d.draft.replace(/\s+/g, " ").slice(0, 100);
            const ts = new Date(d.createdAt);
            const s = draftStatus(d);
            // Same rule as Home's due card: a scheduled day before today is overdue.
            const late = s === "scheduled" && (d.scheduledFor ?? "").slice(0, 10) < today;
            const statusStyle =
              s === "posted"
                ? "border-success/40 bg-success/10 text-success"
                : late
                  ? "border-warning/40 bg-warning/10 text-warning"
                  : s === "scheduled"
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border/60 bg-muted/40 text-muted-foreground";
            return (
              <div
                key={d.id}
                id={`post-${d.id}`}
                className={`flex flex-col rounded-xl border bg-card p-4 shadow-card transition-colors hover:border-primary/40 ${
                  flashId === d.id ? "border-primary ring-2 ring-primary/40" : "border-border/70"
                }`}
              >
                <div className="mb-2 flex flex-wrap items-center gap-1.5">
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${statusStyle}`}
                  >
                    {s === "posted" ? "Posted" : late ? "Overdue" : s === "scheduled" ? "Scheduled" : "Draft"}
                  </span>
                  {[PLATFORM_LABEL[d.platform] ?? d.platform, PILLAR_LABEL[d.pillar] ?? d.pillar].filter(Boolean).map((tag) => (
                    <span key={tag} className="rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      {tag}
                    </span>
                  ))}
                  <span className="ml-auto text-[10px] text-muted-foreground">
                    {ts.toLocaleString()}
                  </span>
                </div>
                {d.hook && (
                  <div className="mb-2 line-clamp-2 font-serif text-sm font-semibold leading-snug text-foreground">
                    {d.hook}
                  </div>
                )}
                <p className="mb-2 line-clamp-3 text-xs leading-relaxed text-muted-foreground">
                  {preview}
                  {d.draft.length > 100 ? "..." : ""}
                </p>
                {s !== "posted" && (
                  <label className="mb-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <CalendarClock className="h-3.5 w-3.5 shrink-0 text-primary" />
                    {s === "scheduled" ? "Scheduled for" : "Schedule for"}
                    <DayInput
                      min={today}
                      value={d.scheduledFor?.slice(0, 10) ?? ""}
                      // keeps a set posting time
                      onPick={(day) => handleSetStatus(d.id, "scheduled", scheduleAt(day, scheduleTime(d.scheduledFor)))}
                      className="h-9 rounded-md border border-input bg-background px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-8"
                    />
                  </label>
                )}
                {s === "posted" && (
                  <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {(
                      [
                        ["impressions", "Impressions"],
                        ["reactions", "Reactions"],
                        ["comments", "Comments"],
                        ["shares", "Shares"],
                      ] as const
                    ).map(([field, label]) => (
                      <label key={field} className="space-y-0.5">
                        <span className="block text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
                          {label}
                        </span>
                        <input
                          type="number"
                          min={0}
                          inputMode="numeric"
                          defaultValue={d.metrics?.[field] ?? ""}
                          onChange={(e) => handleMetric(d.id, field, e.target.value)}
                          placeholder="0"
                          className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        />
                      </label>
                    ))}
                  </div>
                )}
                {reviews.enabled && <DraftReviewControl draft={d} reviews={reviews} />}
                <div className="mb-3 flex flex-wrap items-center gap-1.5">
                  {labels.filter((l) => d.labels?.includes(l.id)).map((l) => (
                    <LabelChip key={l.id} label={l} />
                  ))}
                  <button
                    type="button"
                    onClick={() => setLabelOpenId((cur) => (cur === d.id ? null : d.id))}
                    aria-expanded={labelOpenId === d.id}
                    className="inline-flex h-9 items-center gap-1 rounded-full border border-dashed border-border px-2.5 text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground sm:h-7"
                  >
                    <Tag className="h-3 w-3" /> {d.labels?.some((id) => labels.some((l) => l.id === id)) ? "Edit labels" : "Add label"}
                  </button>
                </div>
                {labelOpenId === d.id && userId && (
                  <LabelPicker
                    className="mb-3"
                    userId={userId}
                    labels={labels}
                    selected={d.labels ?? []}
                    onChange={(ids) => setDrafts(setDraftLabels(userId, d.id, ids))}
                    onLabelsChange={setLabels}
                    onManage={openManager}
                    onClose={() => setLabelOpenId(null)}
                  />
                )}
                <div className="mt-auto flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleRestore(d.id)}
                    className="h-11 gap-1.5 sm:h-9"
                  >
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </Button>
                  {s === "posted" ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleUnpost(d)}
                      className="h-11 gap-1.5 text-xs text-muted-foreground sm:h-9"
                    >
                      <Undo2 className="h-3.5 w-3.5" /> Mark unposted
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleSetStatus(d.id, "posted")}
                      className="h-11 gap-1.5 text-xs text-success hover:text-success sm:h-9"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" /> Mark posted
                    </Button>
                  )}
                  <MoreMenu
                    items={[
                      { label: "Repurpose", icon: Wand2, onSelect: () => setRepurposeOpenId(d.id) },
                      ...(d.draft?.trim()
                        ? [{ label: "Make a carousel", icon: GalleryHorizontalEnd, onSelect: () => navigate(`/carousel?draft=${encodeURIComponent(d.id)}`) }]
                        : []),
                      { label: "Duplicate", icon: CopyPlus, onSelect: () => handleDuplicate(d.id) },
                    ]}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDelete(d.id)}
                    className={`ml-auto h-11 gap-1.5 text-xs sm:h-9 ${
                      confirmId === d.id
                        ? "text-destructive"
                        : "text-muted-foreground"
                    }`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {confirmId === d.id ? "Confirm" : "Delete"}
                  </Button>
                </div>
                {repurposeOpenId === d.id && (
                  <div className="mt-3 space-y-2 rounded-lg border border-primary/20 bg-primary/5 p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">
                        Repurpose into
                      </p>
                      <button
                        type="button"
                        onClick={() => setRepurposeOpenId(null)}
                        aria-label="Close"
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {repurposeTargetsFor(d).map((t) => (
                        <button
                          key={t.key}
                          type="button"
                          onClick={() => navigate(buildRepurposeUrl(d, t))}
                          className="rounded-full border border-border/70 bg-background px-2.5 py-1 text-[11px] font-medium text-foreground transition-colors hover:border-primary/50 hover:bg-primary/10"
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
