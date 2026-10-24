// /links - tracked short links (members only): make a /t/ link for any web
// address, see clicks and people per link for 7 or 30 days, and switch on a
// public report per campaign. Server side: 019 and the tracked-link function.
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useUrlState } from "@/lib/urlState";
import { Check, Copy, ExternalLink, Loader2, Pencil, Trash2 } from "lucide-react";

import { TrendChart } from "@/components/charts/TrendChart";
import { Button } from "@/components/ui/button";
import { FilterChip } from "@/components/ui/filter-chip";
import { InfoTip } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { brandOffers } from "@/lib/brandRules";
import { loadBrand } from "@/lib/carousel";
import { supabase } from "@/lib/supabase";
import { scoped } from "@/lib/profiles";
import {
  MAX_CAMPAIGN,
  MAX_LABEL,
  MAX_URL,
  canTrack,
  countsByLink,
  dailyClicks,
  dayLabel,
  deleteTrackedLink,
  fetchMine,
  isTrackedUrl,
  linkInputProblem,
  reportLostBy,
  reportUrl,
  saveTrackedLink,
  setReport,
  trackedUrl,
  type LinkInput,
  type Mine,
} from "@/lib/trackedLinks";
import { sgDay } from "@/lib/bioPage";

const EMPTY: LinkInput = { slug: "", label: "", url: "", campaign: "" };
const DRAFT_PREFIX = "cs-track-draft-"; // the half-made link, this device only
const TOUCH = "h-10 sm:h-9 [@media(pointer:coarse)]:h-11";

function host(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function readDraft(key: string): LinkInput | null {
  try {
    const d = JSON.parse(localStorage.getItem(key) ?? "null");
    return d && typeof d === "object" && typeof d.url === "string" ? { ...EMPTY, ...d } : null;
  } catch {
    return null;
  }
}

function writeDraft(key: string, d: LinkInput | null) {
  try {
    if (d && (d.url || d.label || d.campaign || d.slug)) localStorage.setItem(key, JSON.stringify(d));
    else localStorage.removeItem(key);
  } catch {
    // storage blocked: the form still holds it until the page closes
  }
}

export default function TrackedLinksPage() {
  const { toast } = useToast();
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [loadError, setLoadError] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [member, setMember] = useState(false);
  const [mine, setMine] = useState<Mine>({ links: [], campaigns: [], days: [] });
  const [form, setForm] = useState<LinkInput>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  // ?period=7d (docs/deep-links.md); 30 days is the default and stays out of the URL.
  const [periodParam, setPeriodParam] = useUrlState<"7d" | "30d">("period", "30d", { allowed: ["7d"] });
  const period = periodParam === "7d" ? 7 : 30;
  const setPeriod = (d: 7 | 30) => setPeriodParam(`${d}d`);
  const [editing, setEditing] = useState<{ id: string; label: string; campaign: string; warned: boolean } | null>(null);
  const [rowError, setRowError] = useState<{ id: string; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // The report switch shows its new position at once, while the server catches up.
  const [pending, setPending] = useState<{ id: string; on: boolean } | null>(null);

  const draftKey = userId ? DRAFT_PREFIX + scoped(userId) : "";
  const offers = useMemo(() => (userId ? brandOffers(loadBrand(userId)).filter((o) => !isTrackedUrl(o.url)) : []), [userId]);

  const load = async () => {
    setState("loading");
    try {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id;
      if (!uid) throw new Error("Your session has expired. Sign in again.");
      setUserId(uid);
      const [ok, all] = await Promise.all([canTrack(), fetchMine()]);
      setMember(ok);
      setMine(all);
      setForm(readDraft(DRAFT_PREFIX + scoped(uid)) ?? EMPTY);
      setState("ready");
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Couldn't load your links.");
      setState("error");
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const edit = (patch: Partial<LinkInput>) => {
    setForm((prev) => {
      const next = { ...prev, ...patch };
      if (draftKey) writeDraft(draftKey, next);
      return next;
    });
    setFormError("");
  };

  const refresh = async () => setMine(await fetchMine());

  const make = async () => {
    const problem = linkInputProblem(form);
    if (problem) return setFormError(problem);
    setSaving(true);
    try {
      const made = await saveTrackedLink(null, form);
      setForm(EMPTY);
      writeDraft(draftKey, null);
      toast({ title: "Link made", description: trackedUrl(window.location.origin, made.slug) });
      await refresh();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Couldn't make the link. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: "Link copied", description: url });
    } catch {
      toast({ title: "Copy failed", description: url, variant: "destructive" });
    }
  };

  const saveEdit = async () => {
    if (!editing) return;
    const link = mine.links.find((l) => l.id === editing.id);
    if (!link) return;
    const input = { slug: "", label: editing.label, url: link.url, campaign: editing.campaign };
    const problem = linkInputProblem(input);
    if (problem) return setRowError({ id: link.id, text: problem });
    if (!editing.warned && reportLostBy(mine.links, mine.campaigns, link.id, editing.campaign)) {
      return setEditing({ ...editing, warned: true });
    }
    setBusy(link.id);
    try {
      await saveTrackedLink(link.id, input);
      setEditing(null);
      setRowError(null);
      await refresh();
    } catch (e) {
      setRowError({ id: link.id, text: e instanceof Error ? e.message : "Couldn't save. Try again." });
    } finally {
      setBusy(null);
    }
  };

  const remove = async (id: string) => {
    if (confirmDelete !== id) return setConfirmDelete(id);
    setBusy(id);
    try {
      const link = mine.links.find((l) => l.id === id);
      await deleteTrackedLink(id);
      setConfirmDelete(null);
      toast({ title: "Link deleted", description: link ? `/t/${link.slug} is held for you for 30 days.` : undefined });
      await refresh();
    } catch (e) {
      setRowError({ id, text: e instanceof Error ? e.message : "Couldn't delete. Try again." });
    } finally {
      setBusy(null);
    }
  };

  const toggleReport = async (campaignId: string, on: boolean) => {
    setBusy(campaignId);
    setPending({ id: campaignId, on });
    try {
      const slug = await setReport(campaignId, on);
      setMine((m) => ({ ...m, campaigns: m.campaigns.map((c) => (c.id === campaignId ? { ...c, report_slug: slug } : c)) }));
    } catch (e) {
      toast({ title: "Couldn't change the report", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    } finally {
      setBusy(null);
      setPending(null);
    }
  };

  const now = useMemo(() => new Date(), [mine]);
  const counts = useMemo(() => countsByLink(mine.days, sgDay(now, period - 1)), [mine.days, now, period]);
  const points = useMemo(
    () => dailyClicks(mine.days, period, now).map((d) => ({ id: d.day, label: dayLabel(d.day), value: d.clicks, detail: "all links" })),
    [mine.days, now, period],
  );
  const campaignOf = (id: string | null) => mine.campaigns.find((c) => c.id === id) ?? null;

  return (
    <div className="space-y-6">
      <h1 className="font-serif text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">Tracked links</h1>

      {state === "loading" ? (
        <div role="status" className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading your links...
        </div>
      ) : state === "error" ? (
        <div role="alert" className="space-y-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <p>{loadError}</p>
          <Button size="sm" variant="outline" onClick={() => void load()}>
            Try again
          </Button>
        </div>
      ) : (
        <>
          {!member ? (
            <p className="rounded-xl border border-border/60 p-4 text-sm">
              Tracked links come with a Members Hub membership.{" "}
              <Link to="/hub" className="inline-flex items-center font-medium text-primary hover:underline [@media(pointer:coarse)]:min-h-11">
                See membership
              </Link>
            </p>
          ) : (
            <section className="space-y-4 rounded-xl border border-border/60 p-4 shadow-card" data-testid="new-link">
              <h2 className="font-serif text-lg font-semibold">New link</h2>
              {offers.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground">Brand kit offers</span>
                  {offers.map((o) => (
                    <FilterChip key={o.url} active={form.url === o.url} onClick={() => edit({ url: o.url, label: form.label.trim() ? form.label : o.name.slice(0, MAX_LABEL) })}>
                      {o.name}
                    </FilterChip>
                  ))}
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="min-w-0 space-y-1.5">
                  <Label htmlFor="tl-url">Goes to</Label>
                  <Input id="tl-url" value={form.url} maxLength={MAX_URL} inputMode="url" autoCapitalize="none" autoCorrect="off" placeholder="yoursite.sg/review" onChange={(e) => edit({ url: e.target.value })} />
                </div>
                <div className="min-w-0 space-y-1.5">
                  <Label htmlFor="tl-label">Label</Label>
                  <Input id="tl-label" value={form.label} maxLength={MAX_LABEL} placeholder="Free retirement review" onChange={(e) => edit({ label: e.target.value })} />
                </div>
                <div className="min-w-0 space-y-1.5">
                  <Label htmlFor="tl-campaign">
                    Campaign <span className="font-normal text-muted-foreground">(optional)</span>
                  </Label>
                  <Input id="tl-campaign" list="tl-campaigns" value={form.campaign} maxLength={MAX_CAMPAIGN} placeholder="CNY 2027" onChange={(e) => edit({ campaign: e.target.value })} />
                  <datalist id="tl-campaigns">
                    {mine.campaigns.map((c) => (
                      <option key={c.id} value={c.name} />
                    ))}
                  </datalist>
                </div>
                <div className="min-w-0 space-y-1.5">
                  <Label htmlFor="tl-slug">
                    Short address <span className="font-normal text-muted-foreground">(optional)</span>
                  </Label>
                  <div className="flex min-w-0 items-center rounded-md border border-input bg-background focus-within:ring-2 focus-within:ring-ring">
                    <span className="shrink-0 pl-3 text-sm text-muted-foreground">/t/</span>
                    <input
                      id="tl-slug"
                      value={form.slug}
                      maxLength={40}
                      placeholder="picked for you"
                      onChange={(e) => edit({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })}
                      className="h-10 min-w-0 flex-1 bg-transparent px-1 text-sm text-foreground focus:outline-none [@media(pointer:coarse)]:min-h-11"
                    />
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <Button onClick={() => void make()} disabled={saving} className="h-11 w-full gap-1.5 sm:h-10 sm:w-auto">
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  Make link
                </Button>
                {formError && (
                  <p role="alert" className="break-words text-sm text-destructive">
                    {formError}
                  </p>
                )}
              </div>
            </section>
          )}

          {mine.links.length > 0 && (
            <section className="space-y-3 rounded-xl border border-border/60 p-4 shadow-card" data-testid="links">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-serif text-lg font-semibold">Clicks</h2>
                <div role="group" aria-label="Period" className="flex gap-1.5">
                  <FilterChip active={period === 7} onClick={() => setPeriod(7)}>
                    7 days
                  </FilterChip>
                  <FilterChip active={period === 30} onClick={() => setPeriod(30)}>
                    30 days
                  </FilterChip>
                </div>
              </div>
              <div className="max-w-[360px]">
                <TrendChart points={points} format={(v) => v.toLocaleString("en-SG")} measure="clicks" title="Clicks per day on your tracked links" width={360} height={130} />
              </div>
              <ul className="divide-y divide-border/50">
                {mine.links.map((l) => {
                  const c = counts.get(l.id) ?? { clicks: 0, people: 0 };
                  const camp = campaignOf(l.campaign_id);
                  const address = trackedUrl(window.location.origin, l.slug);
                  const isEditing = editing?.id === l.id;
                  const lost = confirmDelete === l.id ? reportLostBy(mine.links, mine.campaigns, l.id) : null;
                  return (
                    <li key={l.id} data-slug={l.slug} className="space-y-2 py-3">
                      {isEditing ? (
                        <div className="grid gap-2 sm:grid-cols-2">
                          <Input aria-label="Label" value={editing.label} maxLength={MAX_LABEL} onChange={(e) => setEditing({ ...editing, label: e.target.value, warned: false })} />
                          <Input aria-label="Campaign" list="tl-campaigns" value={editing.campaign} maxLength={MAX_CAMPAIGN} placeholder="No campaign" onChange={(e) => setEditing({ ...editing, campaign: e.target.value, warned: false })} />
                        </div>
                      ) : (
                        <div className="flex items-start gap-3">
                          <div className="min-w-0 flex-1 space-y-0.5">
                            <p className="break-words font-medium [overflow-wrap:anywhere]">{l.label}</p>
                            <p className="break-all text-xs text-muted-foreground">
                              /t/{l.slug} goes to {host(l.url)}
                            </p>
                            {camp && <p className="text-xs font-medium text-primary">{camp.name}</p>}
                          </div>
                          <dl className="flex shrink-0 gap-4 text-right">
                            <div className="flex flex-col-reverse">
                              <dt className="text-[11px] text-muted-foreground">clicks</dt>
                              <dd className="text-sm font-semibold tabular-nums">{c.clicks.toLocaleString("en-SG")}</dd>
                            </div>
                            <div className="flex flex-col-reverse">
                              <dt className="text-[11px] text-muted-foreground">people</dt>
                              <dd className="text-sm font-semibold tabular-nums">{c.people.toLocaleString("en-SG")}</dd>
                            </div>
                          </dl>
                        </div>
                      )}
                      {isEditing && editing.warned && (
                        <p role="alert" className="text-sm font-medium text-warning">
                          This is the last link in {campaignOf(l.campaign_id)?.name}: its public report goes too.
                        </p>
                      )}
                      {lost && (
                        <p role="alert" className="text-sm font-medium text-warning">
                          This is the last link in {lost.name}: its public report goes too.
                        </p>
                      )}
                      {rowError?.id === l.id && (
                        <p role="alert" className="break-words text-sm text-destructive">
                          {rowError.text}
                        </p>
                      )}
                      <div className="flex flex-wrap items-center gap-1">
                        {isEditing ? (
                          <>
                            <Button size="sm" onClick={() => void saveEdit()} disabled={busy === l.id} className={`${TOUCH} gap-1.5`}>
                              {busy === l.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                              {editing.warned ? "Save and end report" : "Save"}
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => (setEditing(null), setRowError(null))} className={TOUCH}>
                              Cancel
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button size="sm" variant="outline" onClick={() => void copy(address)} className={`${TOUCH} gap-1.5`}>
                              <Copy className="h-3.5 w-3.5" /> Copy link
                            </Button>
                            {member && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => (setEditing({ id: l.id, label: l.label, campaign: camp?.name ?? "", warned: false }), setConfirmDelete(null), setRowError(null))}
                                className={`${TOUCH} gap-1.5 text-muted-foreground`}
                              >
                                <Pencil className="h-3.5 w-3.5" /> Rename
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => void remove(l.id)}
                              disabled={busy === l.id}
                              className={`${TOUCH} gap-1.5 ${confirmDelete === l.id ? "text-destructive" : "text-muted-foreground"}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" /> {confirmDelete === l.id ? "Confirm delete" : "Delete"}
                            </Button>
                          </>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {mine.campaigns.length > 0 && (
            <section className="space-y-3 rounded-xl border border-border/60 p-4 shadow-card" data-testid="campaigns">
              <div className="flex items-center gap-1">
                <h2 className="font-serif text-lg font-semibold">Campaign reports</h2>
                <InfoTip label="About campaign reports">Anyone with the address sees clicks and people, no sign-in.</InfoTip>
              </div>
              <ul className="divide-y divide-border/50">
                {mine.campaigns.map((c) => {
                  const ids = mine.links.filter((l) => l.campaign_id === c.id).map((l) => l.id);
                  const total = ids.reduce((t, id) => ({ clicks: t.clicks + (counts.get(id)?.clicks ?? 0), people: t.people + (counts.get(id)?.people ?? 0) }), { clicks: 0, people: 0 });
                  const address = c.report_slug ? reportUrl(window.location.origin, c.report_slug) : null;
                  return (
                    <li key={c.id} className="space-y-2 py-3">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <p className="min-w-0 basis-full break-words font-medium sm:flex-1 sm:basis-auto">{c.name}</p>
                        <p className="text-xs tabular-nums text-muted-foreground">
                          {ids.length} {ids.length === 1 ? "link" : "links"}, {total.clicks.toLocaleString("en-SG")} clicks, {total.people.toLocaleString("en-SG")} people
                        </p>
                        <label className="flex min-h-10 items-center gap-2 text-sm font-medium [@media(pointer:coarse)]:min-h-11">
                          <input type="checkbox" role="switch" checked={pending?.id === c.id ? pending.on : Boolean(c.report_slug)} disabled={busy === c.id} onChange={(e) => void toggleReport(c.id, e.target.checked)} className="h-4 w-4" />
                          Public report
                        </label>
                      </div>
                      {address && (
                        <div className="flex flex-wrap items-center gap-2">
                          <a href={address} target="_blank" rel="noopener" className="min-w-0 flex-1 break-all text-sm text-foreground hover:underline">
                            {address}
                          </a>
                          <Button size="sm" variant="outline" onClick={() => void copy(address)} className={`${TOUCH} gap-1.5`}>
                            <Copy className="h-3.5 w-3.5" /> Copy
                          </Button>
                          <Button size="sm" variant="ghost" asChild className={`${TOUCH} gap-1.5`}>
                            <a href={address} target="_blank" rel="noopener">
                              <ExternalLink className="h-3.5 w-3.5" /> Open
                            </a>
                          </Button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
