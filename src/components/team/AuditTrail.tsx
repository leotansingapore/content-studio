import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, Loader2, ScrollText } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  EmptyBlock,
  ErrorBlock,
  FORMAT_LABEL,
  LoadingBlock,
  PLATFORM_LABEL,
} from "@/components/team/shared";
import {
  AUDIT_PAGE,
  EVENT_LABEL,
  auditCsv,
  auditCsvFilename,
  fetchAllEvents,
  fetchEvents,
  formatSgt,
  friendlyError,
  sgtDateString,
  sgtDayBounds,
  type ReviewEvent,
  type ReviewEventKind,
  type Team,
} from "@/lib/teamReview";

const KIND_STYLE: Record<ReviewEventKind, string> = {
  team_created: "border-primary/30 bg-primary/10 text-primary",
  member_joined: "border-border/60 bg-muted/40 text-muted-foreground",
  member_left: "border-border/60 bg-muted/40 text-muted-foreground",
  submitted: "border-amber-500/40 bg-amber-500/10 text-amber-700",
  approved: "border-success/40 bg-success/10 text-success",
  changes_requested: "border-destructive/40 bg-destructive/10 text-destructive",
};

function KindBadge({ kind }: { kind: ReviewEventKind }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] ${
        KIND_STYLE[kind] ?? KIND_STYLE.member_joined
      }`}
    >
      {EVENT_LABEL[kind] ?? kind}
    </span>
  );
}

function eventDetails(e: ReviewEvent): string {
  const d = e.detail ?? {};
  const text = (key: string) => (typeof d[key] === "string" ? (d[key] as string) : "");
  switch (e.kind) {
    case "team_created":
      return text("team_name") ? `Team "${text("team_name")}"` : "";
    case "member_joined":
    case "member_left":
      return text("role") === "leader" ? "As leader" : "As member";
    case "submitted": {
      const flags = Number(d.flag_count ?? 0);
      return [
        PLATFORM_LABEL[text("platform")] ?? text("platform"),
        FORMAT_LABEL[text("format")] ?? text("format"),
        flags === 0 ? "no flags" : `${flags} compliance flag${flags === 1 ? "" : "s"}`,
      ]
        .filter(Boolean)
        .join(" · ");
    }
    case "approved":
    case "changes_requested":
      return [text("author_name") && `${text("author_name")}'s post`, text("comment")]
        .filter(Boolean)
        .join(": ");
    default:
      return "";
  }
}

export default function AuditTrail({ team, refreshKey }: { team: Team; refreshKey: number }) {
  const { toast } = useToast();
  const today = sgtDateString(new Date());
  const [from, setFrom] = useState(() => sgtDateString(new Date(Date.now() - 29 * 86_400_000)));
  const [to, setTo] = useState(today);
  const [rows, setRows] = useState<ReviewEvent[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const requestRef = useRef(0);

  const bounds = useMemo(() => sgtDayBounds(from, to), [from, to]);

  const load = useCallback(async () => {
    const request = ++requestRef.current;
    if (!bounds) {
      setRows([]);
      setHasMore(false);
      setStatus("ready");
      return;
    }
    setStatus("loading");
    setError("");
    try {
      const page = await fetchEvents(team.id, bounds.fromIso, bounds.toIso, 0, AUDIT_PAGE);
      if (request !== requestRef.current) return;
      setRows(page);
      setHasMore(page.length === AUDIT_PAGE);
      setStatus("ready");
    } catch (e) {
      if (request !== requestRef.current) return;
      setError(friendlyError(e));
      setStatus("error");
    }
  }, [bounds, team.id]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const loadMore = async () => {
    if (!bounds) return;
    setLoadingMore(true);
    try {
      const page = await fetchEvents(team.id, bounds.fromIso, bounds.toIso, rows.length, AUDIT_PAGE);
      setRows((prev) => [...prev, ...page]);
      setHasMore(page.length === AUDIT_PAGE);
    } catch (e) {
      toast({ title: "Couldn't load more events", description: friendlyError(e), variant: "destructive" });
    } finally {
      setLoadingMore(false);
    }
  };

  const handleExport = async () => {
    if (!bounds) return;
    setExporting(true);
    setExportError("");
    try {
      const all = await fetchAllEvents(team.id, bounds.fromIso, bounds.toIso);
      if (all.length === 0) {
        setExportError("There are no events in this date range to export.");
        return;
      }
      // BOM so Excel reads names in any script correctly.
      const blob = new Blob(["﻿", auditCsv(all)], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = auditCsvFilename(team.name, from, to);
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5_000);
      toast({
        title: "Audit trail exported",
        description: `${all.length} event${all.length === 1 ? "" : "s"}, ${from} to ${to}.`,
      });
    } catch (e) {
      setExportError(friendlyError(e));
    } finally {
      setExporting(false);
    }
  };

  return (
    <Card className="border-border/60 shadow-card">
      <CardHeader>
        <CardTitle className="font-serif text-xl">Audit trail</CardTitle>
        <CardDescription>
          Every team change, submission and decision, with who did it and when. Entries can't
          be edited or deleted. Times are Singapore time.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end">
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="audit-from">From</Label>
            <input
              id="audit-from"
              type="date"
              value={from}
              max={to || today}
              onChange={(e) => setFrom(e.target.value)}
              className="flex h-10 w-full min-w-0 rounded-md border border-input bg-background px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-auto"
            />
          </div>
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="audit-to">To</Label>
            <input
              id="audit-to"
              type="date"
              value={to}
              min={from}
              max={today}
              onChange={(e) => setTo(e.target.value)}
              className="flex h-10 w-full min-w-0 rounded-md border border-input bg-background px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-auto"
            />
          </div>
          <Button
            variant="outline"
            onClick={handleExport}
            disabled={!bounds || exporting || status !== "ready"}
            className="col-span-2 gap-1.5 sm:col-span-1"
          >
            {exporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Export CSV
          </Button>
        </div>
        {!bounds && (
          <p role="alert" className="text-sm text-destructive">
            Pick a start date on or before the end date.
          </p>
        )}
        {exportError && (
          <p role="alert" className="break-words text-sm text-destructive">
            {exportError}
          </p>
        )}

        {status === "loading" ? (
          <LoadingBlock label="Loading the audit trail…" />
        ) : status === "error" ? (
          <ErrorBlock message={error} onRetry={() => void load()} />
        ) : rows.length === 0 ? (
          bounds && (
            <EmptyBlock icon={<ScrollText className="h-6 w-6" />}>
              <p>No events between {from} and {to}.</p>
            </EmptyBlock>
          )
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border/60 text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                    <th scope="col" className="py-2 pr-3 font-semibold">Time</th>
                    <th scope="col" className="py-2 pr-3 font-semibold">Event</th>
                    <th scope="col" className="py-2 pr-3 font-semibold">By</th>
                    <th scope="col" className="py-2 pr-3 font-semibold">Details</th>
                    <th scope="col" className="py-2 font-semibold">Hash</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((e) => (
                    <tr key={e.id} className="border-b border-border/40 align-top last:border-0">
                      <td className="whitespace-nowrap py-2 pr-3 tabular-nums text-muted-foreground">
                        {formatSgt(e.created_at)}
                      </td>
                      <td className="py-2 pr-3">
                        <KindBadge kind={e.kind} />
                      </td>
                      <td className="max-w-[10rem] break-words py-2 pr-3 font-medium text-foreground">
                        {e.actor_name}
                      </td>
                      <td className="max-w-xs break-words py-2 pr-3 text-muted-foreground [overflow-wrap:anywhere]">
                        {eventDetails(e)}
                      </td>
                      <td
                        className="whitespace-nowrap py-2 font-mono text-[11px] text-muted-foreground"
                        title={e.content_hash}
                      >
                        {e.content_hash.slice(0, 10)}…
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="space-y-2 md:hidden">
              {rows.map((e) => (
                <li key={e.id} className="rounded-lg border border-border/60 px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <KindBadge kind={e.kind} />
                    <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">
                      {formatSgt(e.created_at)}
                    </span>
                  </div>
                  <p className="mt-1 break-words text-sm font-medium text-foreground">{e.actor_name}</p>
                  {eventDetails(e) && (
                    <p className="break-words text-xs text-muted-foreground [overflow-wrap:anywhere]">
                      {eventDetails(e)}
                    </p>
                  )}
                  <p className="mt-1 truncate font-mono text-[10px] text-muted-foreground" title={e.content_hash}>
                    {e.content_hash}
                  </p>
                </li>
              ))}
            </ul>
            {hasMore && (
              <div className="flex justify-center">
                <Button variant="outline" size="sm" onClick={loadMore} disabled={loadingMore} className="gap-1.5">
                  {loadingMore && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Load more
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
