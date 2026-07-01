import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Card,
  CardContent,
  CardDescription,
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
import { supabase } from "@/lib/supabase";
import {
  Trash2,
  Search,
  Pencil,
  Sparkles,
  CheckCircle2,
  Undo2,
  CalendarClock,
} from "lucide-react";
import {
  deleteDraft,
  loadDrafts,
  setDraftStatus,
  draftStatus,
  type DraftEntry,
  type DraftStatus,
} from "@/lib/draftHistory";

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

  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!active) return;
      const id = data.user?.id ?? null;
      setUserId(id);
      setDrafts(loadDrafts(id));
    })();
    return () => {
      active = false;
    };
  }, []);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return drafts.filter((d) => {
      if (statusFilter !== "all" && draftStatus(d) !== statusFilter) return false;
      if (platformFilter !== "all" && d.platform !== platformFilter) return false;
      if (pillarFilter !== "all" && d.pillar !== pillarFilter) return false;
      if (!q) return true;
      const blob = `${d.hook} ${d.draft}`.toLowerCase();
      return blob.includes(q);
    });
  }, [drafts, statusFilter, platformFilter, pillarFilter, search]);

  const handleSetStatus = (id: string, status: DraftStatus, when?: string) => {
    if (!userId) return;
    setDrafts(setDraftStatus(userId, id, status, when));
  };

  const handleRestore = (id: string) => {
    navigate(`/generate?draft=${encodeURIComponent(id)}`);
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
      <header className="space-y-1.5">
        <h1 className="font-serif text-2xl font-semibold leading-tight tracking-tight text-foreground sm:text-3xl">
          My posts
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Everything you draft saves here automatically. Mark posts as done to
          track what you've shipped and keep your momentum going.
        </p>
      </header>

      {drafts.length > 0 && (
        <>
      <div className="scrollbar-none flex gap-1.5 overflow-x-auto">
        {(
          [
            ["all", `All (${drafts.length})`],
            ["draft", "Drafts"],
            ["scheduled", "Scheduled"],
            ["posted", "Posted"],
          ] as [("all" | DraftStatus), string][]
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setStatusFilter(key)}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
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
        <CardHeader>
          <CardTitle className="font-serif text-xl">
            Filter your drafts
          </CardTitle>
          <CardDescription>
            Narrow by platform / pillar, or search by keyword across the hook
            and body.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Platform</Label>
            <Select value={platformFilter} onValueChange={setPlatformFilter}>
              <SelectTrigger>
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
              <SelectTrigger>
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
            const statusStyle =
              s === "posted"
                ? "border-success/40 bg-success/10 text-success"
                : s === "scheduled"
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border/60 bg-muted/40 text-muted-foreground";
            return (
              <div
                key={d.id}
                className="flex flex-col rounded-xl border border-border/70 bg-card p-4 shadow-card transition-colors hover:border-primary/40"
              >
                <div className="mb-2 flex flex-wrap items-center gap-1.5">
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${statusStyle}`}
                  >
                    {s === "posted" ? "Posted" : s === "scheduled" ? "Scheduled" : "Draft"}
                  </span>
                  <span className="rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    {PLATFORM_LABEL[d.platform] ?? d.platform}
                  </span>
                  <span className="rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    {PILLAR_LABEL[d.pillar] ?? d.pillar}
                  </span>
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
                    <input
                      type="date"
                      value={d.scheduledFor?.slice(0, 10) ?? ""}
                      onChange={(e) =>
                        e.target.value &&
                        handleSetStatus(d.id, "scheduled", e.target.value)
                      }
                      className="rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  </label>
                )}
                <div className="mt-auto flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleRestore(d.id)}
                    className="gap-1.5"
                  >
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </Button>
                  {s === "posted" ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleSetStatus(d.id, "draft")}
                      className="gap-1.5 text-xs text-muted-foreground"
                    >
                      <Undo2 className="h-3.5 w-3.5" /> Mark unposted
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleSetStatus(d.id, "posted")}
                      className="gap-1.5 text-xs text-success hover:text-success"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" /> Mark posted
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDelete(d.id)}
                    className={`ml-auto gap-1.5 text-xs ${
                      confirmId === d.id
                        ? "text-destructive"
                        : "text-muted-foreground"
                    }`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {confirmId === d.id ? "Confirm" : "Delete"}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
