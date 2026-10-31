// /design/campaigns/:id: one campaign's studio. The hook, content and CTA tabs (?tab=) set what each slide says, which
// library its picture comes from and how its words look; Style sets one look and overlay for every slide; Settings
// sets the TikTok account, the posting times and where posts go. Generate makes an example post; Start runs it.
// Edits save half a second after the last one.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ChevronLeft, Loader2, Pause, Play, Plus, Sparkles, Trash2, X } from "lucide-react";
import LibraryDialog, { type Library } from "@/components/design/LibraryDialog";
import { ColorField, Segmented, field } from "@/components/design/fields";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { LOOKS } from "@/lib/design";
import { EdgeError, callFn } from "@/lib/edgeFn";
import { socialConnectShown } from "@/lib/socialConnect";
import { supabase } from "@/lib/supabase";
import { useSignedInUser } from "@/lib/useLeoOnly";
import NotFoundPage from "@/pages/NotFoundPage";
import { STATUS_LABEL, cadence, when, type CampaignRowView } from "@/pages/SlideCampaignsPage";
import { MAX_HOOKS, MAX_TIMES, sanitizeSchedule, sanitizeSpec, type CampaignSpec, type Role, type Schedule } from "../../supabase/functions/_shared/slideCampaign.ts";
import { CAMPAIGN_FONTS, type TextStyle } from "../../supabase/functions/_shared/slideStyle.ts";

type Run = { id: string; hook: string; caption: string; slides: { role: Role; text: string }[]; urls: (string | null)[]; kind?: string; status?: string; scheduled_for?: string | null; error?: string | null; created_at?: string };
const TABS = [
  { value: "hook", label: "Hook" },
  { value: "content", label: "Content" },
  { value: "cta", label: "CTA" },
] as const;
const DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function StyleControls({ s, set }: { s: TextStyle; set: (p: Partial<TextStyle>) => void }) {
  const row = "grid grid-cols-[5rem_1fr] items-center gap-2 text-xs text-muted-foreground";
  return (
    <div className="space-y-2">
      <label className={row}>
        Font
        <select className={field} value={s.font} onChange={(e) => set({ font: e.target.value as TextStyle["font"] })}>
          {CAMPAIGN_FONTS.map((f) => (
            <option key={f}>{f}</option>
          ))}
        </select>
      </label>
      <div role="group" aria-label="Style" className={row}>
        Style
        <Segmented value={s.bg} options={[{ value: "none", label: "Plain" }, { value: "bar", label: "Bar" }, { value: "soft", label: "Soft" }, { value: "outline", label: "Outline" }, { value: "snap", label: "Snap" }] as const} onChange={(bg) => set({ bg })} />
      </div>
      <div role="group" aria-label="Size" className={row}>
        Size
        <Segmented value={s.size} options={[{ value: "sm", label: "Small" }, { value: "md", label: "Medium" }, { value: "lg", label: "Large" }] as const} onChange={(size) => set({ size })} />
      </div>
      <div role="group" aria-label="Position" className={row}>
        Position
        <Segmented value={s.v} options={[{ value: "top", label: "Top" }, { value: "middle", label: "Middle" }, { value: "bottom", label: "Bottom" }] as const} onChange={(v) => set({ v })} />
      </div>
      <div role="group" aria-label="Align" className={row}>
        Align
        <Segmented value={s.h} options={[{ value: "left", label: "Left" }, { value: "center", label: "Center" }, { value: "right", label: "Right" }] as const} onChange={(h) => set({ h })} />
      </div>
      <label className={row}>
        Colour
        <ColorField value={s.color} onChange={(color) => /^#[0-9a-f]{6}$/i.test(color) && set({ color })} swatches={["#ffffff", "#000000", "#ffd21f"]} />
      </label>
      <div className="flex gap-4 text-xs">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" className="accent-primary" checked={s.caps} onChange={(e) => set({ caps: e.target.checked })} /> ALL CAPS
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" className="accent-primary" checked={s.italic} onChange={(e) => set({ italic: e.target.checked })} /> Italic
        </label>
      </div>
    </div>
  );
}

export default function SlideCampaignPage() {
  const user = useSignedInUser();
  const { id } = useParams();
  const [row, setRow] = useState<CampaignRowView | null | undefined>(undefined);
  useEffect(() => {
    if (!user || !id) return;
    void supabase.from("cs_slide_campaigns").select("*").eq("id", id).maybeSingle().then(({ data }) => setRow((data as CampaignRowView) ?? null));
  }, [user, id]);
  if (user === undefined || row === undefined) return null;
  if (!user || !row) return <NotFoundPage />;
  return <Studio key={row.id} initial={row} />;
}

function Studio({ initial }: { initial: CampaignRowView }) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [params, setParams] = useSearchParams();
  const tab = (TABS.find((t) => t.value === params.get("tab"))?.value ?? "hook") as Role;
  const [row, setRow] = useState(initial);
  const [name, setName] = useState(initial.name);
  const [spec, setSpec] = useState<CampaignSpec>(() => sanitizeSpec(initial.spec));
  const [schedule, setSchedule] = useState<Schedule>(() => sanitizeSchedule(initial.schedule));
  const [saved, setSaved] = useState(true);
  const [libraries, setLibraries] = useState<Library[]>([]);
  const [dialog, setDialog] = useState<Library | "new" | null>(null);
  const [accounts, setAccounts] = useState<{ id: string; name: string; needsReconnection: boolean }[] | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [preview, setPreview] = useState<Run | null>(null);
  const [busy, setBusy] = useState<"generate" | "start" | "pause" | "delete" | null>(null);
  const [hookDraft, setHookDraft] = useState("");
  const first = useRef(true);
  const canPost = socialConnectShown();

  // ---- load: libraries, accounts, recent runs ----
  useEffect(() => {
    void supabase
      .from("cs_image_libraries")
      .select("id, name")
      .eq("profile_id", initial.profile_id)
      .order("name")
      .then(({ data }) => setLibraries((data ?? []) as Library[]));
    void callFn<{ runs: Run[] }>("slide-campaigns", { action: "runs", id: initial.id })
      .then((r) => {
        setRuns(r.runs);
        setPreview(r.runs[0] ?? null);
      })
      .catch(() => undefined);
    if (canPost)
      void callFn<{ accounts: { id: string; name: string; needsReconnection: boolean }[] }>("slide-campaigns", { action: "accounts", profile_id: initial.profile_id })
        .then((r) => setAccounts(r.accounts))
        .catch(() => setAccounts([]));
  }, [initial.id, initial.profile_id, canPost]);

  // ---- autosave ----
  useEffect(() => {
    if (first.current) return void (first.current = false);
    setSaved(false);
    const t = setTimeout(() => {
      void callFn<{ campaign: CampaignRowView }>("slide-campaigns", { action: "save", campaign: { id: row.id, name, spec, schedule } })
        .then((r) => (setRow(r.campaign), setSaved(true)))
        .catch((e) => toast({ title: "Couldn't save", description: (e as Error).message, variant: "destructive" }));
    }, 500);
    return () => clearTimeout(t);
  }, [name, spec, schedule]); // eslint-disable-line react-hooks/exhaustive-deps

  const setStyle = (role: Role, p: Partial<TextStyle>) => setSpec((s) => ({ ...s, text_style: { ...s.text_style, [role]: { ...s.text_style[role], ...p } } }));
  const addHooks = (text: string) => {
    const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
    if (lines.length) setSpec((s) => ({ ...s, hooks: [...new Set([...s.hooks, ...lines])].slice(0, MAX_HOOKS) }));
    setHookDraft("");
  };
  const act = useCallback(
    async (kind: "generate" | "start" | "pause", body: Record<string, unknown>) => {
      setBusy(kind);
      try {
        const r = await callFn<{ run?: Run; status?: CampaignRowView["status"]; next_run_at?: string }>("slide-campaigns", body);
        if (r.run) {
          setPreview(r.run);
          setRuns((x) => [r.run!, ...x].slice(0, 12));
        }
        if (r.status) setRow((x) => ({ ...x, status: r.status!, next_run_at: r.next_run_at ?? null }));
      } catch (e) {
        toast({ title: kind === "generate" ? "Couldn't make the example" : kind === "start" ? "Couldn't start it" : "Couldn't pause it", description: (e as Error).message, variant: "destructive" });
      } finally {
        setBusy(null);
      }
    },
    [toast],
  );
  const setAccount = async (account_id: string | null) => {
    try {
      await callFn("slide-campaigns", { action: "account", id: row.id, account_id });
      setRow((x) => ({ ...x, account_id, account_name: accounts?.find((a) => a.id === account_id)?.name ?? null }));
    } catch (e) {
      toast({ title: "Couldn't pick that account", description: (e as EdgeError).message, variant: "destructive" });
    }
  };
  const lib = (role: Role) => libraries.find((l) => l.id === spec.images[role]) ?? null;
  const startWhy = !canPost
    ? "Posting isn't switched on for your account yet."
    : !spec.hooks.length
      ? "Add a hook first."
      : !row.account_id
        ? "Pick the TikTok account it posts to."
        : !schedule.times.length
          ? "Add a posting time."
          : null;
  const shown = preview ?? null;
  const tzs = useMemo(() => {
    const all = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf;
    const list = all ? all("timeZone") : [];
    return list.includes(schedule.tz) ? list : [schedule.tz, ...list];
  }, [schedule.tz]);

  return (
    <div className="space-y-4">
      <h1 className="sr-only">{name}</h1>
      <header className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" asChild className="-ml-2 gap-1 text-muted-foreground">
          <Link to="/design/campaigns">
            <ChevronLeft className="h-4 w-4" /> Campaigns
          </Link>
        </Button>
        <input value={name} maxLength={120} aria-label="Campaign name" onChange={(e) => setName(e.target.value)} className="min-w-0 flex-1 basis-40 rounded-md border border-transparent bg-transparent px-1.5 py-1 text-lg font-semibold hover:border-border focus:border-input focus:outline-none" />
        <span className={`rounded-full px-2 py-0.5 text-xs ${row.status === "live" ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-muted text-muted-foreground"}`}>{STATUS_LABEL[row.status]}</span>
        <span className="text-xs text-muted-foreground" aria-live="polite">
          {saved ? "Saved" : "Saving"}
        </span>
        <Button variant="outline" size="sm" disabled={!!busy || !spec.hooks.length} onClick={() => void act("generate", { action: "preview", id: row.id })} className="gap-1.5" title={spec.hooks.length ? undefined : "Add a hook first."}>
          {busy === "generate" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} {shown ? "Regenerate" : "Generate"}
        </Button>
        {row.status === "live" ? (
          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => void act("pause", { action: "pause", id: row.id })} className="gap-1.5">
            {busy === "pause" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pause className="h-4 w-4" />} Pause
          </Button>
        ) : (
          <Button size="sm" disabled={!!busy || !!startWhy} title={startWhy ?? undefined} onClick={() => void act("start", { action: "start", id: row.id })} className="gap-1.5">
            {busy === "start" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Start
          </Button>
        )}
      </header>
      {startWhy && row.status !== "live" && <p className="text-xs text-muted-foreground">{startWhy}</p>}
      {row.status === "live" && row.next_run_at && <p className="text-sm text-muted-foreground">Next post goes to your TikTok drafts {when(row.next_run_at)}.</p>}
      {row.last_error && <p className="text-sm text-destructive">{row.last_error}</p>}

      {/* the example post */}
      <section aria-label="Example post" className="space-y-2">
        {busy === "generate" && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Writing and drawing the slides</p>}
        {shown ? (
          <>
            <ol className="flex gap-2 overflow-x-auto pb-1">
              {shown.urls.map((u, i) => (
                <li key={i} className="w-36 shrink-0">
                  {u ? <img src={u} alt={shown.slides[i]?.text ?? ""} className="aspect-[9/16] w-full rounded-md border border-border object-cover" /> : <div className="aspect-[9/16] rounded-md bg-muted" />}
                  <span className="text-[11px] text-muted-foreground">{i === 0 ? "Hook" : shown.slides[i]?.role === "cta" ? "CTA" : `Slide ${i + 1}`}</span>
                </li>
              ))}
            </ol>
            <p className="max-w-3xl whitespace-pre-wrap text-sm">{shown.caption}</p>
          </>
        ) : (
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Add a hook, then Generate to see an example post.</p>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-4 rounded-lg border border-border p-4">
          <Segmented value={tab} options={TABS} onChange={(t) => setParams((p) => (p.set("tab", t), p), { replace: true })} />
          {tab === "hook" && (
            <div className="space-y-2">
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                Every post opens with one of these, picked at random
                <InfoTip>Add a few: over a few weeks you see which ones land.</InfoTip>
              </span>
              <form
                className="flex gap-1.5"
                onSubmit={(e) => {
                  e.preventDefault();
                  addHooks(hookDraft);
                }}
              >
                <input value={hookDraft} onChange={(e) => setHookDraft(e.target.value)} onPaste={(e) => {
                  const t = e.clipboardData.getData("text");
                  if (t.includes("\n")) (e.preventDefault(), addHooks(t));
                }} maxLength={200} placeholder="Type a hook, press Enter. Paste a list to add many." aria-label="Add a hook" className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm" />
                <Button type="submit" size="icon" variant="outline" aria-label="Add the hook" disabled={!hookDraft.trim()} className="h-9 w-9">
                  <Plus className="h-4 w-4" />
                </Button>
              </form>
              <ul className="flex flex-wrap gap-1.5">
                {spec.hooks.map((h) => (
                  <li key={h} className="flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs">
                    {h}
                    <button type="button" aria-label={`Remove ${h}`} onClick={() => setSpec((s) => ({ ...s, hooks: s.hooks.filter((x) => x !== h) }))} className="text-muted-foreground hover:text-foreground">
                      <X className="h-3 w-3" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {tab === "content" && (
            <div className="space-y-3">
              <label className="block space-y-1 text-xs text-muted-foreground">
                What the posts are about
                <Textarea value={spec.topic} maxLength={1200} rows={3} placeholder="Ways a golfer can improve, unconventional rather than standard teaching, with numbers wherever possible." onChange={(e) => setSpec((s) => ({ ...s, topic: e.target.value }))} />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid grid-cols-[5rem_1fr] items-center gap-2 text-xs text-muted-foreground">
                  Slides
                  <input type="number" min={1} max={10} className={field} value={spec.content.slides} onChange={(e) => setSpec((s) => ({ ...s, content: { ...s.content, slides: Math.min(10, Math.max(1, e.target.valueAsNumber || 1)) } }))} />
                </label>
                <div role="group" aria-label="Format" className="grid grid-cols-[5rem_1fr] items-center gap-2 text-xs text-muted-foreground">
                  Format
                  <Segmented value={spec.content.style} options={[{ value: "plain", label: "Plain" }, { value: "numbered", label: "Numbered" }, { value: "steps", label: "Steps" }] as const} onChange={(style) => setSpec((s) => ({ ...s, content: { ...s.content, style } }))} />
                </div>
                <div role="group" aria-label="Length" className="grid grid-cols-[5rem_1fr] items-center gap-2 text-xs text-muted-foreground">
                  Length
                  <Segmented value={spec.content.length} options={[{ value: "short", label: "5-7 words" }, { value: "medium", label: "10-12" }, { value: "long", label: "15-20" }] as const} onChange={(length) => setSpec((s) => ({ ...s, content: { ...s.content, length } }))} />
                </div>
                <div role="group" aria-label="Tone" className="grid grid-cols-[5rem_1fr] items-center gap-2 text-xs text-muted-foreground">
                  Tone
                  <Segmented value={spec.content.tone} options={[{ value: "plain", label: "Plain" }, { value: "punchy", label: "Punchy" }, { value: "expert", label: "Expert" }, { value: "warm", label: "Warm" }] as const} onChange={(tone) => setSpec((s) => ({ ...s, content: { ...s.content, tone } }))} />
                </div>
              </div>
              <div role="group" aria-label="Pictures" className="grid grid-cols-[5rem_1fr] items-center gap-2 text-xs text-muted-foreground">
                Pictures
                <Segmented value={spec.images.per_slide ? "each" : "same"} options={[{ value: "each", label: "Different every slide" }, { value: "same", label: "Same on every slide" }] as const} onChange={(v) => setSpec((s) => ({ ...s, images: { ...s.images, per_slide: v === "each" } }))} />
              </div>
            </div>
          )}
          {tab === "cta" && (
            <div className="space-y-3">
              <div role="group" aria-label="Lands" className="grid grid-cols-[5rem_1fr] items-center gap-2 text-xs text-muted-foreground">
                CTA slide
                <Segmented value={spec.cta.placement} options={[{ value: "end", label: "At the end" }, { value: "none", label: "No CTA slide" }] as const} onChange={(placement) => setSpec((s) => ({ ...s, cta: { ...s.cta, placement } }))} />
              </div>
              {spec.cta.placement === "end" && (
                <>
                  <Textarea value={spec.cta.text} maxLength={200} rows={2} placeholder="Optional. Leave it blank and each post gets its own, pointing to you." onChange={(e) => setSpec((s) => ({ ...s, cta: { ...s.cta, text: e.target.value } }))} />
                  <label className="flex items-center gap-1.5 text-xs">
                    <input type="checkbox" className="accent-primary" checked={spec.cta.badge} onChange={(e) => setSpec((s) => ({ ...s, cta: { ...s.cta, badge: e.target.checked } }))} /> App Store badge under the words
                  </label>
                </>
              )}
            </div>
          )}
          {/* this role's pictures and words */}
          <div className="grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{TABS.find((t) => t.value === tab)?.label} pictures</h3>
              <select
                className={field}
                aria-label="Image library"
                value={spec.images[tab] ?? ""}
                onChange={(e) => (e.target.value === "new" ? setDialog("new") : setSpec((s) => ({ ...s, images: { ...s.images, [tab]: e.target.value || null } })))}
              >
                <option value="">No pictures (plain background)</option>
                {libraries.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
                <option value="new">New library…</option>
              </select>
              {lib(tab) && (
                <button type="button" className="text-xs text-primary hover:underline" onClick={() => setDialog(lib(tab))}>
                  Add or remove pictures in {lib(tab)!.name}
                </button>
              )}
            </div>
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{TABS.find((t) => t.value === tab)?.label} words</h3>
              <StyleControls s={spec.text_style[tab]} set={(p) => setStyle(tab, p)} />
            </div>
          </div>
          <div className="space-y-2 border-t border-border pt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Look on every slide</h3>
            <div className="flex flex-wrap gap-1.5">
              {LOOKS.map((k) => (
                <button key={k.value} type="button" aria-pressed={spec.look === k.value} onClick={() => setSpec((s) => ({ ...s, look: k.value }))} className={`rounded-md border px-2 py-1 text-xs ${spec.look === k.value ? "border-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
                  {k.label}
                </button>
              ))}
            </div>
            <div role="group" aria-label="Overlay" className="grid grid-cols-[5rem_1fr] items-center gap-2 text-xs text-muted-foreground">
              Overlay
              <Segmented value={spec.overlay.kind} options={[{ value: "none", label: "None" }, { value: "dim", label: "Dim" }, { value: "bottom", label: "Bottom fade" }, { value: "top", label: "Top fade" }] as const} onChange={(kind) => setSpec((s) => ({ ...s, overlay: { ...s.overlay, kind } }))} />
            </div>
            {spec.overlay.kind !== "none" && (
              <label className="grid grid-cols-[5rem_1fr] items-center gap-2 text-xs text-muted-foreground">
                Strength
                <input type="range" min={0} max={100} value={spec.overlay.strength} onChange={(e) => setSpec((s) => ({ ...s, overlay: { ...s.overlay, strength: e.target.valueAsNumber } }))} className="accent-primary" />
              </label>
            )}
          </div>
        </div>

        <aside aria-label="Settings" className="space-y-4 rounded-lg border border-border p-4 text-sm">
          <section className="space-y-1.5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Post from</h3>
            {!canPost ? (
              <p className="text-xs text-muted-foreground">Posting isn't switched on for your account yet. You can build and preview the campaign now.</p>
            ) : accounts === null ? (
              <p className="text-xs text-muted-foreground">Loading your TikTok accounts</p>
            ) : accounts.length ? (
              <select className={field} aria-label="TikTok account" value={row.account_id ?? ""} onChange={(e) => void setAccount(e.target.value || null)}>
                <option value="">Pick a TikTok account</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    @{a.name}
                    {a.needsReconnection ? " (reconnect it)" : ""}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-xs text-muted-foreground">
                No TikTok account on this brand yet. <Link to="/accounts" className="text-primary hover:underline">Connect one</Link>.
              </p>
            )}
          </section>
          <section className="space-y-2">
            <h3 className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Posting times
              <InfoTip>Spread posts a few hours apart.</InfoTip>
            </h3>
            <select className={field} aria-label="Time zone" value={schedule.tz} onChange={(e) => setSchedule((s) => ({ ...s, tz: e.target.value }))}>
              {tzs.map((z) => (
                <option key={z}>{z}</option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">{cadence(schedule)}</p>
            {schedule.times.map((t, i) => (
              <div key={i} className="space-y-1.5 rounded-md border border-border p-2">
                <span className="flex items-center gap-2">
                  <input type="time" aria-label="Posting time" value={t.at} onChange={(e) => e.target.value && setSchedule((s) => ({ ...s, times: s.times.map((x, j) => (j === i ? { ...x, at: e.target.value } : x)) }))} className={`${field} w-32`} />
                  <button type="button" aria-label="Remove this time" onClick={() => setSchedule((s) => ({ ...s, times: s.times.filter((_, j) => j !== i) }))} className="ml-auto text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </span>
                <span className="flex gap-1">
                  {DAYS.map((d, k) => (
                    <button
                      key={d}
                      type="button"
                      aria-pressed={t.days.includes(k)}
                      aria-label={["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][k]}
                      onClick={() => setSchedule((s) => ({ ...s, times: s.times.map((x, j) => (j === i ? { ...x, days: x.days.includes(k) ? x.days.filter((y) => y !== k) : [...x.days, k].sort() } : x)) }))}
                      className={`h-7 w-7 rounded-full text-[11px] ${t.days.includes(k) ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground"}`}
                    >
                      {d}
                    </button>
                  ))}
                </span>
              </div>
            ))}
            {schedule.times.length < MAX_TIMES && (
              <button type="button" className="flex items-center gap-1 text-xs text-primary hover:underline" onClick={() => setSchedule((s) => ({ ...s, times: [...s.times, { at: "18:00", days: [0, 1, 2, 3, 4, 5, 6] }] }))}>
                <Plus className="h-3.5 w-3.5" /> Add a posting time
              </button>
            )}
          </section>
          <section className="space-y-1">
            <h3 className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Posts go
              <InfoTip>To your TikTok drafts: you add a sound and post each one in the TikTok app.</InfoTip>
            </h3>
            <p>To your TikTok drafts</p>
          </section>
          {runs.length > 1 && (
            <section className="space-y-1">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recent</h3>
              <ul className="space-y-1 text-xs">
                {runs.slice(0, 8).map((r) => (
                  <li key={r.id}>
                    <button type="button" className="w-full truncate text-left hover:underline" onClick={() => setPreview(r)}>
                      {r.kind === "post" ? (r.status === "scheduled" && r.scheduled_for ? `To drafts ${when(r.scheduled_for)}` : r.status === "failed" ? "Failed" : "Made") : "Example"}: {r.hook}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {confirmDelete ? (
            <p className="flex flex-wrap items-center gap-2 text-xs">
              Delete it and its posts' pictures? Posts already in your TikTok drafts stay there.
              <button
                type="button"
                disabled={!!busy}
                className="font-medium text-destructive hover:underline"
                onClick={async () => {
                  setBusy("delete");
                  try {
                    await callFn("slide-campaigns", { action: "delete", id: row.id });
                    navigate("/design/campaigns");
                  } catch (e) {
                    toast({ title: "Couldn't delete it", description: (e as Error).message, variant: "destructive" });
                    setBusy(null);
                  }
                }}
              >
                Delete
              </button>
              <button type="button" className="text-muted-foreground hover:underline" onClick={() => setConfirmDelete(false)}>
                Keep
              </button>
            </p>
          ) : (
            <button type="button" className="text-xs text-muted-foreground hover:text-destructive" onClick={() => setConfirmDelete(true)}>
              Delete this campaign
            </button>
          )}
        </aside>
      </div>

      {dialog && (
        <LibraryDialog
          profileId={row.profile_id}
          library={dialog === "new" ? null : dialog}
          onClose={() => setDialog(null)}
          onSaved={(l) => {
            setLibraries((ls) => [...ls.filter((x) => x.id !== l.id), l].sort((a, b) => a.name.localeCompare(b.name)));
            if (dialog === "new") setSpec((s) => ({ ...s, images: { ...s.images, [tab]: l.id } }));
          }}
        />
      )}
    </div>
  );
}
