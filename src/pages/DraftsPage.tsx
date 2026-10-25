import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import CopyLinkButton from "@/components/CopyLinkButton";
import { useGoneItem, useUrlItem, useUrlSearch, useUrlState, useUrlUpdate } from "@/lib/urlState";
import { links } from "@/lib/links";
import { draftLine } from "@/lib/remixSource";
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
  Link2,
  MessageSquareText,
  Paperclip,
  Send,
  ListOrdered,
  Languages,
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
  onDraftsChanged,
} from "@/lib/draftHistory";
import { keyToDate, localDateKey, scheduleAt, scheduleTime, timeLabel } from "@/lib/dueDates";
import { currentScore } from "@/lib/postScore";
import { numbersJob, numbersLine, onNumbers, refreshIfStale, refreshNumbers, unlinkPost, type NumbersJob } from "@/lib/realNumbers";
import { timeAgo } from "@/lib/accountAudit";
import { zernioHolds } from "@/lib/zernioOutbox";
import { undoTo, updating, useOutbox } from "@/lib/useZernioOutbox";
import { repurposeTargetsFor, buildRepurposeUrl } from "@/lib/repurpose";
import DraftReviewControl from "@/components/team/DraftReviewControl";
import { LabelChip, LabelManager, LabelPicker } from "@/components/Labels";
import { loadLabels, setDraftLabels, type Label as ContentLabel } from "@/lib/labels";
import CsvImport from "@/components/CsvImport";
import DayInput from "@/components/DayInput";
import { loadPositioning } from "@/lib/positioning";
import { useDraftReviews } from "@/hooks/useDraftReviews";
import PreviewLinkPanel from "@/components/review/PreviewLinkPanel";
import { PostItForMePanel, ZernioStatus, useZernioRefresh } from "@/components/PostItForMe";
import { platformName, socialConnectShown } from "@/lib/socialConnect";
import { useLeoUser } from "@/lib/useLeoOnly";
import { LANG_NAMES, langOf } from "@/lib/translate";
import { LANGS, versionsOf } from "@/lib/translateJob";
import {
  fetchMyPreviewLinks,
  linksByDraft,
  reviewerCommentCount,
  type PreviewComment,
  type PreviewLink,
} from "@/lib/previewLinks";

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

const STATUSES = ["all", "draft", "scheduled", "posted"] as const;
// Filters, search and the open review panel live in the URL (docs/deep-links.md).
const FILTER_PARAMS = ["status", "platform", "pillar", "label", "q"];

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
        className="h-11 gap-1.5 text-xs text-muted-foreground sm:h-9 [@media(pointer:coarse)]:h-11"
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
              className="flex h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm text-foreground hover:bg-accent focus:bg-accent focus:outline-none sm:h-9 [@media(pointer:coarse)]:h-11"
            >
              <it.icon className="h-4 w-4 shrink-0 text-muted-foreground" /> {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Helpers for Leo's phase 7 parts (publish-schedule, publish-queue, remix-variations, learn-real-numbers, edit-score):
// day labels such as "Tue 21 Oct" and "Tue 21 Oct, 9am"
const dayLabel = (key: string) => keyToDate(key).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
const whenLabel = (at: string) => {
  const time = scheduleTime(at);
  return `${dayLabel(at.slice(0, 10))}${time ? `, ${timeLabel(time)}` : ""}`;
};
const titleOf = (d: DraftEntry) => (d.hook || d.draft).replace(/\s+/g, " ").trim().slice(0, 80) || "Untitled post";
// Write's score colours (GeneratePage's Predicted engagement)
const scoreTone = (v: number) => (v >= 7.5 ? "bg-success/15 text-success" : v >= 5 ? "bg-primary/15 text-primary" : "bg-warning/15 text-warning");

export default function DraftsPage() {
  const { toast } = useToast();
  const navigate = useNavigate();
  // Make it a thread on a text post's menu (formats-text-threads, north-star gate)
  const leo = useLeoUser();
  const [userId, setUserId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<DraftEntry[]>([]);
  const [params, setParams] = useSearchParams();
  const update = useUrlUpdate();
  const [platformFilter, setPlatformFilter] = useUrlState("platform", "all", { allowed: ["all", ...Object.keys(PLATFORM_LABEL)] });
  const [pillarFilter, setPillarFilter] = useUrlState("pillar", "all", { allowed: ["all", ...Object.keys(PILLAR_LABEL)] });
  const [search, setSearch, query] = useUrlSearch("q");
  const [statusFilter, setStatusFilter] = useUrlState<"all" | DraftStatus>("status", "all", { allowed: STATUSES });
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [repurposeOpenId, setRepurposeOpenId] = useState<string | null>(null);
  const [labels, setLabels] = useState<ContentLabel[]>([]);
  // A label id, "none", or "all"; an id that is not one of this account's labels reads as all.
  const [labelParam, setLabelFilter] = useUrlState("label", "all");
  const [labelOpenId, setLabelOpenId] = useState<string | null>(null);
  const [manageLabels, setManageLabels] = useState(false);
  // A just-made copy: scrolled to and outlined for a moment.
  const [flashId, setFlashId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [previewOpenId, openPreview, closePreview] = useUrlItem("review");
  const [previewLinks, setPreviewLinks] = useState<PreviewLink[]>([]);
  const [previewComments, setPreviewComments] = useState<PreviewComment[]>([]);
  const linksForDraft = useMemo(() => linksByDraft(previewLinks), [previewLinks]);
  const labelFilter = labelParam === "none" || labels.some((l) => l.id === labelParam) ? labelParam : "all";

  // Preview links and their comments; silent when unavailable (My posts works without them).
  useEffect(() => {
    if (!userId) return;
    let active = true;
    fetchMyPreviewLinks()
      .then((r) => {
        if (!active) return;
        setPreviewLinks(r.links);
        setPreviewComments(r.comments);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [userId]);

  useEffect(() => {
    if (!flashId) return;
    document.getElementById(`post-${flashId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    const t = setTimeout(() => setFlashId(null), 2400);
    return () => clearTimeout(t);
  }, [flashId]);
  const reviews = useDraftReviews(userId, drafts);
  const [postOpenId, setPostOpenId] = useState<string | null>(null);
  useZernioRefresh(userId, drafts, setDrafts);
  // The assistant moves posts from outside this page: read them again when it does.
  useEffect(() => (userId ? onDraftsChanged(() => setDrafts(loadDrafts(userId))) : undefined), [userId]);

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

  // ---- Leo's phase 7 parts; every other sign-in keeps today's page and calls ----
  const box = useOutbox(userId);
  // Real numbers (learn-real-numbers): pulled on open when the last pull is over 6 hours old, by the job outside
  // React; the header chip follows it, and a link it made by itself gets a toast with Undo while this page is open.
  const [job, setJob] = useState<NumbersJob | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [typing, setTyping] = useState<string[]>([]);
  const numbersOn = !!leo && !!userId && socialConnectShown();
  useEffect(() => {
    if (!numbersOn || !userId) return;
    let last = numbersJob(userId).at;
    const read = () => {
      const j = numbersJob(userId);
      setJob(j);
      setDrafts(loadDrafts(userId));
      if (j.running || !j.at || j.at === last) return;
      last = j.at;
      setUpdatedAt(j.at);
      const linked = j.linked.flatMap((l) => loadDrafts(userId).filter((d) => d.id === l.draftId));
      if (!linked.length) return;
      toast({
        title: linked.length === 1 ? `Numbers linked to "${titleOf(linked[0])}"` : `Numbers linked to ${linked.length} posts`,
        action: (
          <ToastAction
            altText="Undo"
            onClick={() => {
              for (const d of linked) unlinkPost(userId, d.id);
              setDrafts(loadDrafts(userId));
            }}
          >
            Undo
          </ToastAction>
        ),
      });
    };
    const off = onNumbers(read);
    setJob(numbersJob(userId));
    refreshIfStale(userId);
    return off;
  }, [numbersOn, userId, toast]);
  // "Updated {time}" stays in the chip's place for 3 seconds
  useEffect(() => {
    if (!updatedAt) return;
    const t = setTimeout(() => setUpdatedAt(null), 3000);
    return () => clearTimeout(t);
  }, [updatedAt]);

  // The schedule steps (publish-schedule) live in the URL for Leo: ?schedule=<post id> (push), with the steps' own
  // ?step= and ?network= (replace). A post that is out, or already with Zernio, never opens them.
  const scheduleParam = leo ? params.get("schedule") : null;
  useGoneItem("schedule", scheduleParam && drafts.length ? drafts.some((d) => d.id === scheduleParam) : undefined);
  const scheduleFor = (scheduleParam && drafts.find((d) => d.id === scheduleParam && draftStatus(d) !== "posted" && !d.zernio?.postId)?.id) || null;
  const panelId = scheduleFor ?? postOpenId;
  useEffect(() => {
    if (scheduleFor) document.getElementById(`post-${scheduleFor}`)?.scrollIntoView({ block: "nearest" });
  }, [scheduleFor]);
  const togglePanel = (id: string) => {
    if (!leo) return setPostOpenId((cur) => (cur === id ? null : id));
    if (panelId === id) closePanel();
    else update({ schedule: id, step: null, network: null }, { push: true });
  };
  const closePanel = () => {
    setPostOpenId(null);
    if (params.get("schedule")) update({ schedule: null, step: null, network: null });
  };

  const today = localDateKey();
  // The same counts as Home's stat cards.
  const counts = useMemo(() => {
    const c = { draft: 0, scheduled: 0, posted: 0 };
    for (const d of drafts) c[draftStatus(d)]++;
    return c;
  }, [drafts]);
  const visible = useMemo(() => {
    const q = query.toLowerCase();
    return drafts.filter((d) => {
      if (statusFilter !== "all" && draftStatus(d) !== statusFilter) return false;
      if (platformFilter !== "all" && d.platform !== platformFilter) return false;
      if (pillarFilter !== "all" && d.pillar !== pillarFilter) return false;
      if (labelFilter === "none" ? labels.some((l) => d.labels?.includes(l.id)) : labelFilter !== "all" && !d.labels?.includes(labelFilter)) return false;
      if (!q) return true;
      const blob = `${d.hook} ${d.draft}`.toLowerCase();
      return blob.includes(q);
    });
  }, [drafts, statusFilter, platformFilter, pillarFilter, labelFilter, labels, query]);


  const openManager = () => {
    setManageLabels(true);
    setLabelOpenId(null);
    requestAnimationFrame(() => document.getElementById("label-manager")?.scrollIntoView({ behavior: "smooth", block: "center" }));
  };

  // undoTo keeps the Zernio link as it is now, so an Undo after a move Zernio already made moves the post back
  const undoAction = (prev: DraftEntry[]) => (
    <ToastAction
      altText="Undo"
      onClick={() => {
        if (!userId) return;
        let back = loadDrafts(userId);
        for (const d of prev) back = undoTo(userId, d);
        setDrafts(back);
      }}
    >
      Undo
    </ToastAction>
  );

  const handleSetStatus = (id: string, status: DraftStatus, when?: string) => {
    if (!userId) return;
    const prev = drafts.find((d) => d.id === id);
    setDrafts(setDraftStatus(userId, id, status, when));
    // a new day for a post Zernio holds moves the real post too: say so, with Undo (publish-calendar)
    if (prev && when && status === "scheduled" && zernioHolds(prev) && prev.scheduledFor !== when)
      toast({ title: `Moved to ${whenLabel(when)}`, description: "The auto-post moves with it.", action: undoAction([prev]) });
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
        <ToastAction altText="Undo" onClick={() => setDrafts(undoTo(userId, prev))}>
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
    // Show everything so the new posts are in view at the top. One write: each setter would read the same old URL.
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        FILTER_PARAMS.forEach((k) => p.delete(k));
        return p;
      },
      { replace: true },
    );
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
    const at = drafts.findIndex((d) => d.id === id);
    const gone = drafts[at];
    // a post Zernio holds is cancelled there too, after a short wait the Undo can still beat (publish-calendar)
    const held = !!gone && zernioHolds(gone);
    const next = deleteDraft(userId, id);
    setDrafts(next);
    setConfirmId(null);
    toast({
      title: "Draft deleted",
      description: `Removed from your history.${held ? " Zernio won't post it." : ""}`,
      action: held ? (
        <ToastAction
          altText="Undo"
          onClick={() => {
            // back in its place at Zernio's time, which drops the waiting cancel (zernioOps)
            const cur = loadDrafts(userId).filter((d) => d.id !== id);
            setDrafts(saveDrafts(userId, [...cur.slice(0, at), gone, ...cur.slice(at)]));
          }}
        >
          Undo
        </ToastAction>
      ) : undefined,
    });
  };

  // "Numbers from your Instagram post": Unlink clears the link, and the matcher never links that post again
  const unlink = (prev: DraftEntry) => {
    if (!userId) return;
    unlinkPost(userId, prev.id);
    setDrafts(loadDrafts(userId));
    toast({
      title: "Unlinked",
      action: (
        <ToastAction altText="Undo" onClick={() => setDrafts(restoreDraft(userId, prev))}>
          Undo
        </ToastAction>
      ),
    });
  };

  // The header chip while the numbers job runs, for 3 seconds after it lands, and when it couldn't run
  const chip = "inline-flex min-h-7 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-medium";
  const numbersChip = (j: NumbersJob) => {
    if (j.running)
      return (
        <span className={`${chip} border-border/60 bg-muted/40 text-muted-foreground`}>
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" aria-hidden /> Updating your numbers...
        </span>
      );
    if (j.error) {
      // no analytics on the plan (402) and the daily cap (429) say it in the server's words; anything else can retry
      const own = j.error.status === 402 || j.error.status === 429;
      return (
        <span className={`${chip} border-warning/40 bg-warning/10 text-warning`}>
          {own ? j.error.message : "Couldn't update your numbers."}
          {!own && userId && (
            <button type="button" onClick={() => void refreshNumbers(userId)} className="font-semibold underline-offset-2 hover:underline [@media(pointer:coarse)]:min-h-11">
              Try again
            </button>
          )}
        </span>
      );
    }
    return updatedAt ? <span className={`${chip} border-border/60 text-muted-foreground`}>Updated {timeAgo(updatedAt)}</span> : null;
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-serif text-2xl font-semibold leading-tight tracking-tight text-foreground sm:text-3xl">
          All posts
        </h1>
        {job && <span aria-live="polite" className="mr-auto">{numbersChip(job)}</span>}
        {!importOpen && userId && (
          <Button size="sm" variant="outline" onClick={() => setImportOpen(true)} className="gap-1.5 [@media(pointer:coarse)]:h-11">
            <Upload className="h-3.5 w-3.5" /> Import CSV
          </Button>
        )}
      </header>
      {importOpen && userId && (
        <CsvImport
          posts={drafts}
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
            aria-pressed={statusFilter === key}
            className={`h-9 shrink-0 rounded-full border px-3 text-xs font-semibold transition-colors sm:h-8 [@media(pointer:coarse)]:h-11 ${
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
            <Button size="sm" variant="ghost" onClick={openManager} className="gap-1.5 text-xs text-muted-foreground [@media(pointer:coarse)]:h-11">
              <Tag className="h-3.5 w-3.5" /> Labels
            </Button>
          )}
        </CardHeader>
        <CardContent className={`grid gap-3 ${labels.length ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-3"}`}>
          <div className="space-y-1.5">
            <Label>Platform</Label>
            <Select value={platformFilter} onValueChange={setPlatformFilter}>
              <SelectTrigger aria-label="Platform" className="[@media(pointer:coarse)]:h-11">
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
              <SelectTrigger aria-label="Pillar" className="[@media(pointer:coarse)]:h-11">
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
                <SelectTrigger aria-label="Label" className="[@media(pointer:coarse)]:h-11">
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
                className="pl-7 [@media(pointer:coarse)]:h-11"
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
            // Leo: the saved score while the text is the one scored (edit-score), and the real numbers on a posted post,
            // from Zernio or a hand-linked post (learn-real-numbers): null or all zeros read "No numbers yet"
            const score = leo ? currentScore(d) : null;
            const real = leo && s === "posted" ? (d.zernio?.numbers ?? d.live?.numbers ?? (d.live ? null : undefined)) : undefined;
            const realLine = real ? numbersLine(real, ["views", "reach", "likes", "comments", "shares", "saves"]) : "";
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
                  {score && (
                    <Link
                      to={links.generate({ draft: d.id, section: "score" })}
                      aria-label={`Predicted engagement ${score.v.toFixed(1)} out of 10`}
                      className={`inline-flex min-h-6 items-center rounded-full px-2 text-[10px] font-bold [@media(pointer:coarse)]:min-h-11 ${scoreTone(score.v)}`}
                    >
                      {score.v.toFixed(1)}/10
                    </Link>
                  )}
                  <span className="ml-auto text-[10px] text-muted-foreground">
                    {ts.toLocaleString()}
                  </span>
                  <CopyLinkButton path={links.generate({ draft: d.id })} label={`Copy link to ${d.hook || "this post"}`.slice(0, 120)} className="-my-2 -mr-2" />
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
                {/* only Leo's drafts carry a source (north-star gate), so this needs no check of its own */}
                {d.source && (
                  <Link
                    to={links.generate({ draft: d.id, compare: "original" })}
                    className="mb-2 inline-flex w-fit items-center text-[11px] text-muted-foreground hover:text-foreground hover:underline [@media(pointer:coarse)]:min-h-11"
                  >
                    {draftLine(d.source)}
                  </Link>
                )}
                {d.media && /^https?:\/\//i.test(d.media) && (
                  <a
                    href={d.media}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mb-2 inline-flex h-9 w-fit items-center gap-1.5 text-[11px] font-medium text-primary hover:underline sm:h-7 [@media(pointer:coarse)]:h-11"
                  >
                    <Paperclip className="h-3.5 w-3.5" /> Open media
                  </a>
                )}
                {s !== "posted" && (
                  <label className="mb-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <CalendarClock className="h-3.5 w-3.5 shrink-0 text-primary" />
                    {s === "scheduled" ? "Scheduled for" : "Schedule for"}
                    <DayInput
                      min={today}
                      value={d.scheduledFor?.slice(0, 10) ?? ""}
                      // keeps a set posting time
                      onPick={(day) => handleSetStatus(d.id, "scheduled", scheduleAt(day, scheduleTime(d.scheduledFor)))}
                      className="h-9 rounded-md border border-input bg-background px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-8 [@media(pointer:coarse)]:h-11"
                    />
                  </label>
                )}
                {real !== undefined && (
                  <div className="mb-3 space-y-1 text-[11px]">
                    <p className="flex flex-wrap items-center gap-x-2 text-foreground">
                      <span>{realLine && real ? `${realLine}. Updated ${timeAgo(real.at)}` : "No numbers yet"}</span>
                      {!typing.includes(d.id) && (
                        <button
                          type="button"
                          onClick={() => setTyping((t) => [...t, d.id])}
                          className="font-semibold text-primary hover:underline [@media(pointer:coarse)]:min-h-11"
                        >
                          Type my own
                        </button>
                      )}
                    </p>
                    {d.live && (
                      <p className="flex flex-wrap items-center gap-x-2 text-muted-foreground">
                        Numbers from your {platformName(d.live.platform)} post
                        <button type="button" onClick={() => unlink(d)} className="font-semibold text-foreground hover:underline [@media(pointer:coarse)]:min-h-11">
                          Unlink
                        </button>
                      </p>
                    )}
                  </div>
                )}
                {s === "posted" && (real === undefined || typing.includes(d.id)) && (
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
                {(() => {
                  const ids = new Set((linksForDraft.get(d.id) ?? []).map((l) => l.id));
                  const n = ids.size ? reviewerCommentCount(previewComments, ids) : 0;
                  return n > 0 && previewOpenId !== d.id ? (
                    <button
                      type="button"
                      onClick={() => openPreview(d.id)}
                      className="mb-3 inline-flex h-9 w-fit items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 text-[11px] font-semibold text-primary sm:h-7"
                    >
                      <MessageSquareText className="h-3.5 w-3.5" /> {n} reviewer {n === 1 ? "comment" : "comments"}
                    </button>
                  ) : null;
                })()}
                <div className="mb-3 flex flex-wrap items-center gap-1.5">
                  {labels.filter((l) => d.labels?.includes(l.id)).map((l) => (
                    <LabelChip key={l.id} label={l} />
                  ))}
                  <button
                    type="button"
                    onClick={() => setLabelOpenId((cur) => (cur === d.id ? null : d.id))}
                    aria-expanded={labelOpenId === d.id}
                    className="inline-flex h-9 items-center gap-1 rounded-full border border-dashed border-border px-2.5 text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground sm:h-7 [@media(pointer:coarse)]:h-11"
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
                {d.zernio?.postId && userId && (
                  <div className="mb-3">
                    <ZernioStatus userId={userId} draft={d} onDrafts={setDrafts} />
                    {/* a move or cancel waiting to reach Zernio (publish-calendar's receipt) */}
                    {updating(box, d) && (
                      <span className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" aria-hidden /> Updating auto-post
                      </span>
                    )}
                  </div>
                )}
                <div className="mt-auto flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleRestore(d.id)}
                    className="h-11 gap-1.5 sm:h-9 [@media(pointer:coarse)]:h-11"
                  >
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </Button>
                  {s === "posted" ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleUnpost(d)}
                      className="h-11 gap-1.5 text-xs text-muted-foreground sm:h-9 [@media(pointer:coarse)]:h-11"
                    >
                      <Undo2 className="h-3.5 w-3.5" /> Mark unposted
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleSetStatus(d.id, "posted")}
                      disabled={reviews.blockReason(d) !== null}
                      title={reviews.blockReason(d) ?? undefined}
                      className="h-11 gap-1.5 text-xs text-success hover:text-success sm:h-9 [@media(pointer:coarse)]:h-11"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" /> Mark posted
                    </Button>
                  )}
                  {/* Leo's steps open on any post not yet out, with or without a day (publish-schedule) */}
                  {(leo ? s !== "posted" : s === "scheduled" && d.scheduledFor) && !d.zernio?.postId && socialConnectShown() && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => togglePanel(d.id)}
                      aria-expanded={panelId === d.id}
                      className="h-11 gap-1.5 text-xs text-primary hover:text-primary sm:h-9 [@media(pointer:coarse)]:h-11"
                    >
                      <Send className="h-3.5 w-3.5" /> Post it for me
                    </Button>
                  )}
                  <MoreMenu
                    items={[
                      { label: "Repurpose", icon: Wand2, onSelect: () => setRepurposeOpenId(d.id) },
                      ...(d.draft?.trim()
                        ? [{ label: "Make a carousel", icon: GalleryHorizontalEnd, onSelect: () => navigate(`/carousel?draft=${encodeURIComponent(d.id)}`) }]
                        : []),
                      ...(leo && d.format === "text-post" && d.draft?.trim()
                        ? [{ label: "Make it a thread", icon: ListOrdered, onSelect: () => navigate(links.generate({ draft: d.id, panel: "thread" })) }]
                        : []),
                      // edit-translate (Leo only): Write opens the English and makes the version there, once (navigation state, so a reload never spends)
                      ...(leo && d.draft?.trim() && !langOf(d)
                        ? LANGS.filter((l) => !versionsOf(drafts, d.id).some((v) => langOf(v) === l)).map((l) => ({
                            label: `Make it in ${LANG_NAMES[l]}`,
                            icon: Languages,
                            onSelect: () => navigate(links.generate({ draft: d.id }), { state: { translate: { id: d.id, lang: l } } }),
                          }))
                        : []),
                      ...(d.draft?.trim()
                        ? [{ label: "Share for review", icon: Link2, onSelect: () => openPreview(d.id) }]
                        : []),
                      { label: "Duplicate", icon: CopyPlus, onSelect: () => handleDuplicate(d.id) },
                    ]}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDelete(d.id)}
                    className={`ml-auto h-11 gap-1.5 text-xs sm:h-9 [@media(pointer:coarse)]:h-11 ${
                      confirmId === d.id
                        ? "text-destructive"
                        : "text-muted-foreground"
                    }`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {confirmId === d.id ? "Confirm" : "Delete"}
                  </Button>
                </div>
                {panelId === d.id && userId && (
                  <PostItForMePanel userId={userId} draft={d} blockReason={reviews.blockReason(d)} onDrafts={setDrafts} onClose={closePanel} />
                )}
                {previewOpenId === d.id && userId && (
                  <PreviewLinkPanel
                    userId={userId}
                    draft={d}
                    links={linksForDraft.get(d.id) ?? []}
                    comments={previewComments}
                    onLink={(link) =>
                      setPreviewLinks((prev) => [link, ...prev.filter((l) => l.id !== link.id)])
                    }
                    onComment={(c) => setPreviewComments((prev) => [...prev, c])}
                    onClose={closePreview}
                  />
                )}
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
                        className="text-muted-foreground hover:text-foreground [@media(pointer:coarse)]:-m-3.5 [@media(pointer:coarse)]:grid [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11 [@media(pointer:coarse)]:place-items-center"
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
