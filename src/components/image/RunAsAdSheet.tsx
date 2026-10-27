// "Run as an ad" on /image (docs/adlauncher-ads.md, phase 2): the made picture goes to AdLauncher as a paused
// Facebook and Instagram ad in Singapore. Check uploads the picture, runs preflight-launch, then create-campaign with
// dryRun: true, and shows what would be made and any problem in AdLauncher's own words; Create paused sends the same
// call without the dry run. Nothing here switches an ad on: that stays a click in AdLauncher.
// An adviser's brand (speakerFor "person") needs the firm's approval code, kept in the campaign name and the record.
// What is typed stays in this tab (sessionStorage) until Create or Cancel. Leo's sign-ins only; opened by ?ad=1.

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { AlertTriangle, Check, CheckCircle2, ExternalLink, Loader2, X } from "lucide-react";
import ComplianceChips from "@/components/ComplianceChips";
import { Button } from "@/components/ui/button";
import { FilterChip } from "@/components/ui/filter-chip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  COPY_LIMITS,
  CTAS,
  adlCall,
  adlImage,
  adlStatus,
  campaignArgs,
  campaignLink,
  campaignName,
  formProblem,
  lastPrivacyUrl,
  needsReconnect,
  preflightArgs,
  rememberReturn,
  saveLaunch,
  sgDate,
  startOf,
  type AdAccountRow,
  type AdForm,
  type AdlAnswer,
  type AdlStatus,
  type CampaignResult,
  type PageRow,
  type Preflight,
} from "@/lib/adlauncher";
import { scanCompliance } from "@/lib/compliance";
import { links } from "@/lib/links";
import { cn } from "@/lib/utils";

const FIELD = "text-xs font-semibold text-muted-foreground";
const sheetKey = (designId: string) => `cs-ad-sheet-${designId}`;
const message = (e: unknown) => (e instanceof Error ? e.message : "That didn't go through. Try again in a minute.");

const blobDataUrl = (b: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("The picture couldn't be read."));
    r.readAsDataURL(b);
  });

function readSheet(designId: string): Partial<AdForm> | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(sheetKey(designId)) ?? "null");
    return v && typeof v === "object" ? v : null;
  } catch {
    return null;
  }
}

function keepSheet(designId: string, f: AdForm | null): void {
  try {
    if (f) sessionStorage.setItem(sheetKey(designId), JSON.stringify(f));
    else sessionStorage.removeItem(sheetKey(designId));
  } catch {
    // private mode: the fields hold for as long as the sheet is open
  }
}

type Step = "form" | "checking" | "checked" | "problems" | "creating" | "done";
interface Checked {
  args: Record<string, unknown>;
  pre: AdlAnswer<Preflight>;
  dry: AdlAnswer<CampaignResult>;
}

export default function RunAsAdSheet(p: {
  userId: string;
  designId: string;
  draftId?: string;
  /** The design's main words and its caption: the ad's headline and text to start from. */
  headline: string;
  text: string;
  /** The design's preview, shown at the top. */
  preview: string;
  /** The design as a JPEG at its own size. */
  picture: () => Promise<Blob>;
  /** An adviser's brand: the firm's approval code is required. */
  person: boolean;
  /** Jev's MAS question said these words may promise a result or point to a product. */
  masWarn: boolean;
  onClose: () => void;
}) {
  const [form, setForm] = useState<AdForm>(() => ({
    pageId: "",
    adAccountId: "",
    goal: "leads",
    url: "",
    privacyUrl: lastPrivacyUrl(p.userId),
    headline: p.headline.slice(0, COPY_LIMITS.headline),
    primaryText: (p.text || p.headline).slice(0, COPY_LIMITS.primaryText),
    cta: "LEARN_MORE",
    dailyBudget: "",
    days: "7",
    approval: "",
    ...readSheet(p.designId),
  }));
  const [status, setStatus] = useState<AdlStatus | null>(null);
  const [loadError, setLoadError] = useState("");
  const [pages, setPages] = useState<PageRow[] | null>(null);
  const [accounts, setAccounts] = useState<AdAccountRow[] | null>(null);
  const [step, setStep] = useState<Step>("form");
  const [progress, setProgress] = useState("");
  const [checked, setChecked] = useState<Checked | null>(null);
  const [failure, setFailure] = useState<{ error: string; hint?: string } | null>(null);
  const [created, setCreated] = useState<CampaignResult | null>(null);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const closeRef = useRef<HTMLButtonElement>(null);

  const reconnect = () => setStatus((s) => ({ connected: false, reconnect: true, account: s?.account ?? null }));

  // the connection, then the Pages and ad accounts it can use (one after the other: a refresh rotates the token)
  const load = async () => {
    setLoadError("");
    try {
      const s = await adlStatus();
      setStatus(s);
      if (!s.connected) return;
      const pg = await adlCall<{ pages: PageRow[] }>("list-pages");
      const ac = await adlCall<{ adAccounts: AdAccountRow[] }>("list-ad-accounts");
      if (!pg.ok) throw new Error(pg.error);
      if (!ac.ok) throw new Error(ac.error);
      const pl = Array.isArray(pg.data?.pages) ? pg.data.pages : [];
      const al = Array.isArray(ac.data?.adAccounts) ? ac.data.adAccounts : [];
      setPages(pl);
      setAccounts(al);
      // defaults: what was picked before, else AdLauncher's active Page and ad account, else the first
      setForm((f) => ({
        ...f,
        pageId: pl.some((x) => x.pageId === f.pageId) ? f.pageId : (pl.find((x) => x.pageId === s.account?.pageId) ?? pl.find((x) => x.isDefault) ?? pl[0])?.pageId ?? "",
        adAccountId: al.some((x) => x.adAccountId === f.adAccountId) ? f.adAccountId : (al.find((x) => x.adAccountId === s.account?.adAccountId) ?? al[0])?.adAccountId ?? "",
      }));
    } catch (e) {
      if (needsReconnect(e)) reconnect();
      else setLoadError(message(e));
    }
  };
  useEffect(() => {
    void load();
    closeRef.current?.focus();
    // once, on open
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // what is typed is kept in this tab until Create or Cancel
  useEffect(() => {
    if (step !== "done") keepSheet(p.designId, form);
  }, [form, step, p.designId]);

  const set = (patch: Partial<AdForm>) => {
    setForm((f) => ({ ...f, ...patch }));
    // a change after Check is checked again before anything is made
    if (step === "checked" || step === "problems") setStep("form");
  };

  const cancel = () => {
    keepSheet(p.designId, null);
    p.onClose();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && step !== "checking" && step !== "creating" && p.onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, p]);

  const account = accounts?.find((a) => a.adAccountId === form.adAccountId);
  const currency = account?.currency ?? status?.account?.currency ?? "";
  const problem = formProblem(form, p.person);
  const flags = useMemo(() => scanCompliance([form.headline, form.primaryText].join("\n\n")), [form.headline, form.primaryText]);
  const total = Number(form.dailyBudget) > 0 && Number(form.days) > 0 ? Math.round(Number(form.dailyBudget) * Number(form.days) * 100) / 100 : null;
  const start = startOf(Date.now());

  const check = async () => {
    if (problem || step === "checking") return;
    setStep("checking");
    setFailure(null);
    setProgress("Uploading the picture...");
    try {
      const { url } = await adlImage(await blobDataUrl(await p.picture()));
      setProgress("Checking with AdLauncher...");
      const pre = await adlCall<Preflight>("preflight-launch", preflightArgs(form));
      const now = Date.now();
      const args = campaignArgs(form, { name: campaignName(form, p.person, now), imageUrl: url, now });
      const dry = await adlCall<CampaignResult>("create-campaign", args);
      setChecked({ args, pre, dry });
      setStep(pre.ok && pre.data.passed && dry.ok ? "checked" : "problems");
    } catch (e) {
      if (needsReconnect(e)) reconnect();
      setFailure({ error: message(e) });
      setStep("problems");
    }
  };

  const create = async () => {
    if (!checked || step !== "checked") return;
    setStep("creating");
    setFailure(null);
    try {
      const res = await adlCall<CampaignResult>("create-campaign", { ...checked.args, dryRun: false });
      if (!res.ok) {
        setFailure({ error: res.error, hint: res.hint });
        setStep("problems");
        return;
      }
      const id = res.data.campaignId ?? res.data.duplicateOf;
      if (id) {
        const kept = saveLaunch(p.userId, {
          id: `al-${Date.now().toString(36)}`,
          at: new Date().toISOString(),
          campaignId: id,
          metaCampaignId: res.data.externalCampaignId ?? null,
          name: String(checked.args.name),
          goal: form.goal,
          approval: p.person ? form.approval.trim() : undefined,
          designId: p.designId,
          draftId: p.draftId,
          dailyBudget: Number(form.dailyBudget),
          days: Number(form.days),
          currency: res.data.currency ?? (currency || null),
          url: form.goal === "website" ? String(checked.args.destinationUrl ?? "") : undefined,
          privacyUrl: form.goal === "leads" ? String(checked.args.privacyPolicyUrl ?? "") : undefined,
        });
        if (!kept) setFailure({ error: "Made in AdLauncher, but this device's storage is full, so it won't show under Ads here." });
      }
      keepSheet(p.designId, null);
      setCreated(res.data);
      setStep("done");
    } catch (e) {
      if (needsReconnect(e)) reconnect();
      setFailure({ error: message(e) });
      setStep("problems");
    }
  };

  const busy = step === "checking" || step === "creating";
  const ready = !!status?.connected && !!pages && !!accounts;
  const body = (() => {
    if (step === "done" && created) return <Done created={created} person={p.person} onClose={p.onClose} />;
    if (loadError)
      return (
        <div className="space-y-3" role="alert">
          <p className="text-sm text-destructive">{loadError}</p>
          <Button variant="outline" className="h-11 sm:h-9" onClick={() => void load()}>
            Try again
          </Button>
        </div>
      );
    if (!status || (status.connected && !ready))
      return (
        <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {status ? "Loading your Pages and ad accounts..." : "Loading..."}
        </p>
      );
    if (!status.connected)
      return (
        <div className="space-y-3">
          <p className="text-sm">{status.reconnect ? "AdLauncher stopped taking this connection. Connect again to make the ad." : "Connect AdLauncher first. What you typed here stays."}</p>
          <Button asChild className="h-11 sm:h-10">
            <Link to={links.adlauncher()} onClick={() => rememberReturn(window.location.pathname + window.location.search)}>
              {status.reconnect ? "Reconnect AdLauncher" : "Connect AdLauncher"}
            </Link>
          </Button>
        </div>
      );
    if (!pages?.length || !accounts?.length)
      return (
        <div className="space-y-3">
          <p className="text-sm">{!pages?.length ? "AdLauncher has no Facebook Page this connection can use." : "AdLauncher has no ad account this connection can use."} Add one in AdLauncher, then try again.</p>
          <Button variant="outline" className="h-11 sm:h-9" onClick={() => void load()}>
            Try again
          </Button>
        </div>
      );
    return (
      <div className="space-y-4">
        <Field label="Goal">
          <div className="flex flex-wrap gap-1.5">
            <FilterChip active={form.goal === "leads"} disabled={busy} onClick={() => set({ goal: "leads" })}>
              Leads
            </FilterChip>
            <FilterChip active={form.goal === "website"} disabled={busy} onClick={() => set({ goal: "website" })}>
              Website visits
            </FilterChip>
          </div>
          <p className="text-xs text-muted-foreground">
            {form.goal === "leads" ? "People fill a short form on Facebook: name, email and phone." : "People tap through to your website."}
          </p>
        </Field>
        {form.goal === "website" ? (
          <Field label="Website address" htmlFor="ad-url">
            <Input id="ad-url" inputMode="url" value={form.url} disabled={busy} placeholder="yoursite.com/book" onChange={(e) => set({ url: e.target.value })} />
          </Field>
        ) : (
          <Field label="Privacy policy address" htmlFor="ad-privacy">
            <Input id="ad-privacy" inputMode="url" value={form.privacyUrl} disabled={busy} placeholder="yoursite.com/privacy" onChange={(e) => set({ privacyUrl: e.target.value })} />
          </Field>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Facebook Page">
            <Pick label="Facebook Page" value={form.pageId} disabled={busy} onChange={(v) => set({ pageId: v })} items={pages.map((x) => ({ id: x.pageId, label: x.name }))} />
          </Field>
          <Field label="Ad account">
            <Pick
              label="Ad account"
              value={form.adAccountId}
              disabled={busy}
              onChange={(v) => set({ adAccountId: v })}
              items={accounts.map((x) => ({ id: x.adAccountId, label: [x.name || x.adAccountId, x.currency].filter(Boolean).join(", ") }))}
            />
          </Field>
        </div>
        <Field label="Headline" htmlFor="ad-headline" count={`${form.headline.length}/${COPY_LIMITS.headline}`} over={form.headline.length > COPY_LIMITS.headline}>
          <Input id="ad-headline" value={form.headline} disabled={busy} onChange={(e) => set({ headline: e.target.value })} />
        </Field>
        <Field label="Text" htmlFor="ad-text" count={`${form.primaryText.length}/${COPY_LIMITS.primaryText}`} over={form.primaryText.length > COPY_LIMITS.primaryText}>
          <Textarea id="ad-text" rows={4} value={form.primaryText} disabled={busy} onChange={(e) => set({ primaryText: e.target.value })} />
        </Field>
        <Field label="Button">
          <Pick label="Button" value={form.cta} disabled={busy} onChange={(v) => set({ cta: v as AdForm["cta"] })} items={CTAS.map((c) => ({ id: c.id, label: c.label }))} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label={`Daily budget${currency ? `, ${currency}` : ""}`} htmlFor="ad-budget">
            <Input id="ad-budget" type="number" inputMode="decimal" min={0} step="any" value={form.dailyBudget} disabled={busy} onChange={(e) => set({ dailyBudget: e.target.value })} />
          </Field>
          <Field label="Days" htmlFor="ad-days">
            <Input id="ad-days" type="number" inputMode="numeric" min={1} max={90} step={1} value={form.days} disabled={busy} onChange={(e) => set({ days: e.target.value })} />
          </Field>
        </div>
        <p className="text-xs text-muted-foreground">
          {total !== null ? `Up to ${currency ? `${currency} ` : ""}${total} in all. ` : ""}Runs in Singapore from {sgDate(start)} once you switch it on.
        </p>
        {p.person && (
          <Field label="Firm approval code" htmlFor="ad-approval">
            <Input id="ad-approval" value={form.approval} maxLength={40} disabled={busy} placeholder="As the firm gave it" onChange={(e) => set({ approval: e.target.value })} />
            <p className="text-xs text-muted-foreground">Kept in the campaign name and in your records here.</p>
          </Field>
        )}
        <ComplianceChips flags={flags.filter((f) => !dismissed.includes(f.id))} onDismiss={(id) => setDismissed((d) => [...d, id])} />
        {p.masWarn && (
          <p className="flex items-start gap-1.5 rounded-lg border border-amber-500/50 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-900 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-600" /> These words may promise a result or point to a product. Check them before you run the ad.
          </p>
        )}
        {(step === "checked" || step === "problems" || step === "creating") && <CheckResult checked={checked} failure={failure} currency={currency} />}
      </div>
    );
  })();

  const footer = ready && step !== "done" && !loadError && (
    <footer className="space-y-1.5 border-t border-border/70 px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3">
      {step === "checked" || step === "creating" ? (
        <Button className="h-11 w-full gap-2" disabled={step === "creating"} onClick={() => void create()}>
          {step === "creating" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {step === "creating" ? "Creating in AdLauncher..." : "Create paused"}
        </Button>
      ) : (
        <Button className="h-11 w-full gap-2" disabled={!!problem || step === "checking"} onClick={() => void check()}>
          {step === "checking" && <Loader2 className="h-4 w-4 animate-spin" />}
          {step === "checking" ? progress : step === "problems" ? "Check again" : "Check"}
        </Button>
      )}
      {problem && step === "form" && <p className="text-center text-xs text-muted-foreground">{problem}</p>}
      {step === "form" && !problem && <p className="text-center text-xs text-muted-foreground">Check makes nothing. It shows what AdLauncher would make.</p>}
      {step === "checked" && <p className="text-center text-xs text-muted-foreground">Made paused. Nothing spends until you switch it on in AdLauncher.</p>}
    </footer>
  );

  return createPortal(
    <div className="fixed inset-0 z-[80] flex justify-end" role="dialog" aria-modal="true" aria-labelledby="ad-sheet-title">
      <button type="button" tabIndex={-1} aria-label="Close" onClick={busy ? undefined : p.onClose} className="absolute inset-0 bg-black/50 animate-in fade-in-0 motion-reduce:animate-none" />
      <div className="relative flex h-full w-full flex-col bg-background shadow-xl animate-in slide-in-from-right duration-200 motion-reduce:animate-none sm:max-w-[480px] sm:border-l sm:border-border/70">
        <header className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-2">
          <h2 id="ad-sheet-title" className="text-base font-semibold text-foreground">
            Run as an ad
          </h2>
          <div className="flex items-center gap-1">
            {step !== "done" && (
              <Button variant="ghost" size="sm" className="h-9 text-muted-foreground [@media(pointer:coarse)]:h-11" disabled={busy} onClick={cancel}>
                Cancel
              </Button>
            )}
            <button
              ref={closeRef}
              type="button"
              onClick={p.onClose}
              disabled={busy}
              aria-label="Close"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>
        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <img src={p.preview} alt="" className="h-20 w-16 shrink-0 rounded-md border border-border/60 bg-muted object-cover" />
            <p className="min-w-0 text-sm font-medium [overflow-wrap:anywhere]">{p.headline || "Your image"}</p>
          </div>
          {body}
        </div>
        {footer}
      </div>
    </div>,
    document.body,
  );
}

function Field({ label, htmlFor, count, over, children }: { label: string; htmlFor?: string; count?: string; over?: boolean; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        {htmlFor ? (
          <Label htmlFor={htmlFor} className={FIELD}>
            {label}
          </Label>
        ) : (
          <p className={FIELD}>{label}</p>
        )}
        {count && <span className={cn("text-[11px] tabular-nums", over ? "font-semibold text-destructive" : "text-muted-foreground")}>{count}</span>}
      </div>
      {children}
    </div>
  );
}

function Pick({ label, value, items, disabled, onChange }: { label: string; value: string; items: { id: string; label: string }[]; disabled: boolean; onChange: (v: string) => void }) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger aria-label={label} className="h-10 text-left [@media(pointer:coarse)]:h-11">
        <SelectValue placeholder="Pick one" />
      </SelectTrigger>
      {/* over the sheet (z-80) */}
      <SelectContent className="z-[90]">
        {items.map((i) => (
          <SelectItem key={i.id} value={i.id}>
            {i.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const QUESTION_WORDS: Record<string, string> = { full_name: "name", email: "email", phone_number: "phone" };

/** What the check found: the preflight's failed gates with their fix, the dry run's refusal, or what would be made. */
function CheckResult({ checked, failure, currency }: { checked: Checked | null; failure: { error: string; hint?: string } | null; currency: string }) {
  const pre = checked?.pre;
  const dry = checked?.dry;
  const failed = pre?.ok ? pre.data.checks.filter((c) => c.outcome === "fail") : [];
  const problems: { text: string; fix?: string | null }[] = [
    ...(failure ? [{ text: failure.error, fix: failure.hint }] : []),
    ...(pre && !pre.ok ? [{ text: pre.error, fix: pre.hint }] : []),
    ...failed.map((c) => ({ text: `${c.name}: ${c.detail}`, fix: c.fix })),
    ...(dry && !dry.ok ? [{ text: dry.error, fix: dry.hint }] : []),
  ];
  const d = dry?.ok ? dry.data : null;
  const args = checked?.args ?? {};
  return (
    <section aria-label="What the check found" className="space-y-2" role="status">
      {problems.length > 0 && (
        <div className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-destructive">
            <AlertTriangle className="h-4 w-4" aria-hidden /> {problems.length === 1 ? "One thing to fix" : `${problems.length} things to fix`}
          </p>
          <ul className="space-y-1.5 text-xs">
            {problems.map((x, i) => (
              <li key={i} className="[overflow-wrap:anywhere]">
                {x.text}
                {x.fix && <span className="block text-muted-foreground">{x.fix}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {d && (
        <div className="space-y-1.5 rounded-lg border border-border/60 p-3 text-xs">
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <CheckCircle2 className="h-4 w-4 text-success" aria-hidden /> AdLauncher would make
          </p>
          <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1">
            <dt className="text-muted-foreground">Campaign</dt>
            <dd className="[overflow-wrap:anywhere]">{String(args.name ?? "")}, paused</dd>
            <dt className="text-muted-foreground">Page</dt>
            <dd className="[overflow-wrap:anywhere]">{d.pageName ?? String(args.pageId ?? "")}</dd>
            <dt className="text-muted-foreground">Budget</dt>
            <dd>
              {d.currency ?? currency} {d.budget?.amount ?? String(args.dailyBudget ?? "")} a day
            </dd>
            <dt className="text-muted-foreground">Runs</dt>
            <dd>
              {/* the end is midnight after the last day */}
              {sgDate(new Date(String(args.startDate)))} to {sgDate(new Date(Date.parse(String(args.endDate)) - 1))}, Singapore
            </dd>
            {args.destinationType === "ON_AD" ? (
              <>
                <dt className="text-muted-foreground">Form asks</dt>
                <dd>{(d.leadForm?.questions?.length ? d.leadForm.questions : (args.formQuestions as string[]) ?? []).map((q) => QUESTION_WORDS[q] ?? q).join(", ")}</dd>
              </>
            ) : (
              <>
                <dt className="text-muted-foreground">Opens</dt>
                <dd className="[overflow-wrap:anywhere]">{String(args.destinationUrl ?? "")}</dd>
              </>
            )}
          </dl>
          {(d.warnings ?? []).map((w, i) => (
            <p key={i} className="text-amber-800 [overflow-wrap:anywhere] dark:text-amber-200">
              {w}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}

function Done({ created, person, onClose }: { created: CampaignResult; person: boolean; onClose: () => void }) {
  const id = created.campaignId ?? created.duplicateOf;
  return (
    <div className="space-y-4 py-2" role="status">
      <p className="flex items-center gap-2 text-lg font-semibold">
        <CheckCircle2 className="h-5 w-5 text-success" aria-hidden /> Created, paused in AdLauncher
      </p>
      {created.duplicateOf && <p className="text-sm text-muted-foreground">The same ad was made a few minutes ago, so AdLauncher kept that one and made nothing new.</p>}
      <p className="text-sm">{person ? "Switch it on in AdLauncher once the firm has approved it." : "Switch it on in AdLauncher when you're ready."} Its results show under Ads on this page.</p>
      <div className="flex flex-wrap gap-2">
        {id && (
          <Button asChild className="h-11 gap-2 sm:h-10">
            <a href={campaignLink(id)} target="_blank" rel="noreferrer">
              Open in AdLauncher <ExternalLink className="h-4 w-4" />
            </a>
          </Button>
        )}
        <Button variant="ghost" className="h-11 sm:h-10" onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  );
}
