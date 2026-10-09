// /bio - build the link-in-bio page for the open profile (prefilled from the
// brand kit), publish it at /l/<slug>, and see clicks per link.
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowDown, ArrowUp, Copy, ExternalLink, Loader2, Plus, Trash2 } from "lucide-react";

import SectionTabs, { PLAYBOOK_TABS } from "@/components/SectionTabs";
import BioView from "@/components/bio/BioView";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { loadBrand } from "@/lib/carousel";
import { scoped } from "@/lib/profiles";
import { supabase } from "@/lib/supabase";
import {
  MAX_HEADLINE,
  MAX_LABEL,
  MAX_LINKS,
  MAX_NAME,
  MAX_URL,
  clickTotals,
  currentProfileId,
  deleteBioPage,
  fetchClicks,
  fetchMyBioPages,
  linkProblem,
  normalizeSlug,
  publicPageUrl,
  saveBioPage,
  sgDay,
  slugProblem,
  type BioLink,
  type BioPage,
  type ClickRow,
} from "@/lib/bioPage";

type Form = { slug: string; name: string; headline: string; showPhoto: boolean; links: BioLink[]; published: boolean };

const DRAFT_PREFIX = "cs-bio-draft-"; // unsaved edits, this device only

function readDraft(key: string): Form | null {
  try {
    const f = JSON.parse(localStorage.getItem(key) ?? "null");
    return f && typeof f === "object" && Array.isArray(f.links) ? (f as Form) : null;
  } catch {
    return null;
  }
}

function writeDraft(key: string, form: Form | null) {
  try {
    if (form) localStorage.setItem(key, JSON.stringify(form));
    else localStorage.removeItem(key);
  } catch {
    // storage blocked: edits still live in the form until the page closes
  }
}

export default function LinkInBioPage() {
  const { toast } = useToast();
  const [userId, setUserId] = useState<string | null>(null);
  const [pages, setPages] = useState<BioPage[]>([]);
  const [form, setForm] = useState<Form | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [clicks, setClicks] = useState<ClickRow[]>([]);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const profileId = userId ? currentProfileId(userId) : "me";
  const brand = useMemo(() => (userId ? loadBrand(userId) : null), [userId]);
  const mine = pages.find((p) => p.profile_id === profileId) ?? null;
  const others = pages.filter((p) => p.profile_id !== profileId);
  const draftKey = userId ? DRAFT_PREFIX + scoped(userId) : "";
  const photo = form?.showPhoto ? brand?.photo ?? mine?.photo ?? null : null;

  const load = async () => {
    setState("loading");
    try {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id;
      if (!uid) throw new Error("Your session has expired. Sign in again.");
      setUserId(uid);
      const all = await fetchMyBioPages();
      setPages(all);
      const page = all.find((p) => p.profile_id === currentProfileId(uid)) ?? null;
      const b = loadBrand(uid);
      setForm(
        readDraft(DRAFT_PREFIX + scoped(uid)) ??
          (page
            ? {
                slug: page.slug,
                name: page.display_name,
                headline: page.headline,
                showPhoto: page.photo !== null,
                links: page.links,
                published: page.published,
              }
            : {
                slug: normalizeSlug(b?.name ?? ""),
                name: b?.name ?? "",
                headline: b?.role ?? "",
                showPhoto: Boolean(b?.photo),
                links: [{ label: "", url: "" }],
                published: true,
              }),
      );
      if (page) setClicks(await fetchClicks(page.id, sgDay(new Date(), 29)).catch(() => []));
      setState("ready");
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Couldn't load your page.");
      setState("error");
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const edit = (patch: Partial<Form>) => {
    setForm((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...patch };
      if (draftKey) writeDraft(draftKey, next);
      return next;
    });
    setError("");
  };
  const editLink = (i: number, patch: Partial<BioLink>) =>
    form && edit({ links: form.links.map((l, j) => (j === i ? { ...l, ...patch } : l)) });
  const moveLink = (i: number, by: number) => {
    if (!form) return;
    const links = [...form.links];
    const [l] = links.splice(i, 1);
    links.splice(i + by, 0, l);
    edit({ links });
  };

  const save = async () => {
    if (!form || !userId) return;
    const links = form.links.filter((l) => l.label.trim() || l.url.trim());
    const problem =
      slugProblem(form.slug) ??
      (!form.name.trim() ? "Add your name." : null) ??
      links.map(linkProblem).find(Boolean) ??
      null;
    if (problem) return setError(problem);
    setSaving(true);
    setError("");
    try {
      const page = await saveBioPage({
        profileId,
        slug: form.slug,
        displayName: form.name,
        headline: form.headline,
        photo,
        links,
        published: form.published,
      });
      setPages((prev) => [...prev.filter((p) => p.id !== page.id), page]);
      const saved = { ...form, slug: page.slug, links: page.links };
      setForm(saved);
      writeDraft(draftKey, null);
      toast({
        title: page.published ? "Page saved and live" : "Page saved (not live)",
        description: page.published ? publicPageUrl(window.location.origin, page.slug) : "Switch on Page is live to publish it.",
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (page: BioPage) => {
    if (confirmDelete !== page.id) return setConfirmDelete(page.id);
    try {
      await deleteBioPage(page.profile_id);
      setPages((prev) => prev.filter((p) => p.id !== page.id));
      setConfirmDelete(null);
      if (page.profile_id === profileId) {
        writeDraft(draftKey, null);
        setClicks([]);
      }
      toast({ title: "Page deleted", description: `${page.slug} is held for you for 30 days.` });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't delete. Try again.");
    }
  };

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: "Link copied", description: "Paste it into your Instagram bio." });
    } catch {
      toast({ title: "Copy failed", description: url, variant: "destructive" });
    }
  };

  const week = useMemo(() => clickTotals(clicks, sgDay(new Date(), 6)), [clicks]);
  const month = useMemo(() => clickTotals(clicks, sgDay(new Date(), 29)), [clicks]);
  const liveUrl = mine?.published ? publicPageUrl(window.location.origin, mine.slug) : null;

  return (
    <div className="space-y-6">
      <SectionTabs tabs={PLAYBOOK_TABS} />
      <h1 className="font-serif text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">Link in bio</h1>

      {state === "loading" ? (
        <div role="status" className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading your page…
        </div>
      ) : state === "error" || !form ? (
        <div role="alert" className="space-y-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <p>{loadError}</p>
          <Button size="sm" variant="outline" onClick={() => void load()}>
            Try again
          </Button>
        </div>
      ) : (
        <>
          {liveUrl && (
            <section className="flex flex-wrap items-center gap-2 rounded-xl border border-success/40 bg-success/10 p-3">
              <a href={liveUrl} target="_blank" rel="noopener" className="min-w-0 flex-1 break-all text-sm font-semibold text-foreground hover:underline">
                {liveUrl}
              </a>
              <Button size="sm" onClick={() => void copy(liveUrl)} className="h-10 gap-1.5 sm:h-9 [@media(pointer:coarse)]:h-11">
                <Copy className="h-3.5 w-3.5" /> Copy
              </Button>
              <Button size="sm" variant="outline" asChild className="h-10 gap-1.5 sm:h-9 [@media(pointer:coarse)]:h-11">
                <a href={liveUrl} target="_blank" rel="noopener">
                  <ExternalLink className="h-3.5 w-3.5" /> Open
                </a>
              </Button>
            </section>
          )}

          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,320px)]">
            <div className="min-w-0 space-y-6">
              <section className="space-y-4 rounded-xl border border-border/60 p-4 shadow-card">
                <div className="space-y-1.5">
                  <Label htmlFor="bio-slug">Address</Label>
                  <div className="flex min-w-0 items-center rounded-md border border-input bg-background focus-within:ring-2 focus-within:ring-ring">
                    <span className="shrink-0 pl-3 text-sm text-muted-foreground">/l/</span>
                    <input
                      id="bio-slug"
                      value={form.slug}
                      maxLength={40}
                      onChange={(e) => edit({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })}
                      onBlur={() => edit({ slug: normalizeSlug(form.slug) })}
                      placeholder="your-name"
                      className="h-10 min-w-0 flex-1 bg-transparent px-1 text-sm text-foreground focus:outline-none"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border/70 bg-muted">
                    {photo ? <img src={photo} alt="" className="h-full w-full object-cover" /> : null}
                  </span>
                  {brand?.photo || mine?.photo ? (
                    <label className="flex min-h-10 items-center gap-2 text-sm">
                      <input type="checkbox" checked={form.showPhoto} onChange={(e) => edit({ showPhoto: e.target.checked })} className="h-4 w-4" />
                      Show my brand kit photo
                    </label>
                  ) : (
                    <Link to="/brand" className="text-sm font-medium text-primary hover:underline">
                      Add a photo in Brand kit
                    </Link>
                  )}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="min-w-0 space-y-1.5">
                    <Label htmlFor="bio-name">Name</Label>
                    <Input id="bio-name" value={form.name} maxLength={MAX_NAME} onChange={(e) => edit({ name: e.target.value })} />
                  </div>
                  <div className="min-w-0 space-y-1.5">
                    <Label htmlFor="bio-headline">Line under your name</Label>
                    <Input
                      id="bio-headline"
                      value={form.headline}
                      maxLength={MAX_HEADLINE}
                      placeholder="Financial adviser, Singapore"
                      onChange={(e) => edit({ headline: e.target.value })}
                    />
                  </div>
                </div>
              </section>

              <section className="space-y-3 rounded-xl border border-border/60 p-4 shadow-card">
                <h2 className="font-serif text-lg font-semibold">Links</h2>
                <ol className="space-y-3">
                  {form.links.map((l, i) => (
                    <li key={l.id ?? `new-${i}`} className="space-y-2 rounded-lg border border-border/60 p-3">
                      <div className="grid gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
                        <Input
                          aria-label={`Link ${i + 1} label`}
                          value={l.label}
                          maxLength={MAX_LABEL}
                          placeholder="Book a call"
                          onChange={(e) => editLink(i, { label: e.target.value })}
                        />
                        <Input
                          aria-label={`Link ${i + 1} address`}
                          value={l.url}
                          maxLength={MAX_URL}
                          inputMode="url"
                          placeholder="calendly.com/you"
                          onChange={(e) => editLink(i, { url: e.target.value })}
                        />
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="mr-auto text-[11px] text-muted-foreground">
                          {l.id && month.get(l.id) ? `${month.get(l.id)} clicks in 30 days` : ""}
                        </span>
                        <Button size="icon" variant="ghost" aria-label="Move up" disabled={i === 0} onClick={() => moveLink(i, -1)} className="h-10 w-10 sm:h-9 sm:w-9 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11">
                          <ArrowUp className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Move down"
                          disabled={i === form.links.length - 1}
                          onClick={() => moveLink(i, 1)}
                          className="h-10 w-10 sm:h-9 sm:w-9 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11"
                        >
                          <ArrowDown className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Remove link ${i + 1}`}
                          onClick={() => edit({ links: form.links.filter((_, j) => j !== i) })}
                          className="h-10 w-10 text-muted-foreground sm:h-9 sm:w-9 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ol>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={form.links.length >= MAX_LINKS}
                  onClick={() => edit({ links: [...form.links, { label: "", url: "" }] })}
                  className="h-10 gap-1.5 sm:h-9 [@media(pointer:coarse)]:h-11"
                >
                  <Plus className="h-3.5 w-3.5" /> {form.links.length >= MAX_LINKS ? `${MAX_LINKS} links at most` : "Add link"}
                </Button>
              </section>

              <div className="space-y-3">
                <label className="flex min-h-10 items-center gap-2 text-sm font-medium [@media(pointer:coarse)]:min-h-11">
                  <input type="checkbox" checked={form.published} onChange={(e) => edit({ published: e.target.checked })} className="h-4 w-4" />
                  Page is live
                </label>
                <Button onClick={() => void save()} disabled={saving} className="h-11 w-full gap-1.5 sm:h-10 sm:w-auto [@media(pointer:coarse)]:h-11">
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  Save page
                </Button>
                {error && (
                  <p role="alert" className="break-words text-sm text-destructive">
                    {error}
                  </p>
                )}
              </div>
            </div>

            <aside className="min-w-0 space-y-2 lg:sticky lg:top-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Preview</p>
              <div className="rounded-2xl border border-border/60 bg-background p-5 shadow-card">
                <BioView
                  compact
                  displayName={form.name}
                  headline={form.headline}
                  photo={photo}
                  links={form.links
                    .filter((l) => l.label.trim())
                    .map((l, i) => ({ key: l.id ?? `p-${i}`, label: l.label }))}
                />
              </div>
            </aside>
          </div>

          {mine && mine.links.length > 0 && (
            <section className="space-y-3 rounded-xl border border-border/60 p-4 shadow-card">
              <h2 className="font-serif text-lg font-semibold">Clicks</h2>
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border/60 text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                    <th scope="col" className="py-2 pr-3 font-semibold">Link</th>
                    <th scope="col" className="py-2 pr-3 text-right font-semibold">7 days</th>
                    <th scope="col" className="py-2 text-right font-semibold">30 days</th>
                  </tr>
                </thead>
                <tbody>
                  {mine.links.map((l) => (
                    <tr key={l.id} className="border-b border-border/40 last:border-0">
                      <td className="break-words py-2 pr-3 [overflow-wrap:anywhere]">{l.label}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{week.get(l.id ?? "") ?? 0}</td>
                      <td className="py-2 text-right tabular-nums">{month.get(l.id ?? "") ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {(mine || others.length > 0) && (
            <section className="space-y-2">
              {[...(mine ? [mine] : []), ...others].map((p) => (
                <div key={p.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="min-w-0 break-all text-muted-foreground">
                    /l/{p.slug}
                    {p.profile_id !== profileId ? " (another profile)" : ""}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void remove(p)}
                    className={`h-10 gap-1.5 text-xs sm:h-9 ${confirmDelete === p.id ? "text-destructive" : "text-muted-foreground"}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> {confirmDelete === p.id ? "Confirm delete" : "Delete page"}
                  </Button>
                </div>
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}
