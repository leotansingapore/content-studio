// /t/report/:slug - public. A campaign's tracked-link report: the campaign
// name, clicks and people, the last 7 days and each link's label and host.
// Data comes from the tracked-link edge function; nothing about the adviser.
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";

import { TrendChart } from "@/components/charts/TrendChart";
import { dayLabel, fetchPublicReport, type PublicReport } from "@/lib/trackedLinks";

const n = (v: number) => v.toLocaleString("en-SG");

export default function TrackedReportPublicPage() {
  const { slug = "" } = useParams();
  const [state, setState] = useState<"loading" | "ready" | "gone" | "error">("loading");
  const [report, setReport] = useState<PublicReport | null>(null);

  useEffect(() => {
    // A report is for the people it is shared with, not for search.
    const robots = document.createElement("meta");
    robots.name = "robots";
    robots.content = "noindex";
    document.head.appendChild(robots);
    return () => robots.remove();
  }, []);

  useEffect(() => {
    let active = true;
    fetchPublicReport(slug).then((r) => {
      if (!active) return;
      if (r.ok && r.data) {
        setReport(r.data);
        setState("ready");
        document.title = `${r.data.campaign} - campaign report`;
      } else {
        setState(r.gone ? "gone" : "error");
      }
    });
    return () => {
      active = false;
    };
  }, [slug]);

  return (
    <main className="min-h-screen bg-background px-4 py-10 text-foreground sm:py-16">
      {state === "loading" ? (
        <div role="status" className="flex justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="sr-only">Loading</span>
        </div>
      ) : state === "ready" && report ? (
        <div className="mx-auto max-w-2xl space-y-6">
          <header className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Campaign report</p>
            <h1 className="break-words font-serif text-2xl font-semibold leading-tight sm:text-3xl">{report.campaign}</h1>
          </header>

          <dl className="grid grid-cols-2 gap-3">
            <div className="flex flex-col-reverse rounded-xl border border-border/60 p-4 shadow-card">
              <dt className="text-xs text-muted-foreground">clicks so far</dt>
              <dd className="text-2xl font-semibold tabular-nums">{n(report.clicks)}</dd>
            </div>
            <div className="flex flex-col-reverse rounded-xl border border-border/60 p-4 shadow-card">
              <dt className="text-xs text-muted-foreground">people so far</dt>
              <dd className="text-2xl font-semibold tabular-nums">{n(report.people)}</dd>
            </div>
          </dl>

          <section className="space-y-2 rounded-xl border border-border/60 p-4 shadow-card">
            <h2 className="font-serif text-lg font-semibold">Last 7 days</h2>
            <div className="max-w-[360px]">
              <TrendChart
                points={report.days.map((d) => ({ id: d.day, label: dayLabel(d.day), value: d.clicks, detail: `${n(d.people)} new people` }))}
                format={n}
                measure="clicks"
                title="Clicks per day, last 7 days"
                width={360}
                height={140}
              />
            </div>
          </section>

          {report.links.length > 0 && (
            <section className="space-y-2 rounded-xl border border-border/60 p-4 shadow-card">
              <h2 className="font-serif text-lg font-semibold">Links</h2>
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border/60 text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                    <th scope="col" className="py-2 pr-3 font-semibold">Link</th>
                    <th scope="col" className="py-2 pr-3 text-right font-semibold">Clicks</th>
                    <th scope="col" className="py-2 text-right font-semibold">People</th>
                  </tr>
                </thead>
                <tbody>
                  {report.links.map((l, i) => (
                    <tr key={i} className="border-b border-border/40 last:border-0">
                      <td className="py-2 pr-3">
                        <span className="block break-words [overflow-wrap:anywhere]">{l.label}</span>
                        <span className="block break-all text-xs text-muted-foreground">{l.host}</span>
                      </td>
                      <td className="py-2 pr-3 text-right align-top tabular-nums">{n(l.clicks)}</td>
                      <td className="py-2 text-right align-top tabular-nums">{n(l.people)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </div>
      ) : (
        <div className="mx-auto max-w-md space-y-2 text-center">
          <h1 className="font-serif text-xl font-semibold">
            {state === "gone" ? "This report isn't available" : "Couldn't load this report"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {state === "gone" ? "It may have been switched off. Ask the person who shared it." : "Check your connection and try again."}
          </p>
        </div>
      )}
    </main>
  );
}
