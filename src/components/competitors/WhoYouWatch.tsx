// Who you watch (/competitors?view=list): each competitor as a row (logo or initials, name, site or handle, why
// line) that opens its editor in place (?edit=<id>, push), plus "Suggested for you". Reads and suggestions run
// outside React in src/lib/competitors.ts; this only draws their state.
import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, Loader2, RefreshCw, Sparkles } from "lucide-react";
import CopyLinkButton from "@/components/CopyLinkButton";
import PriceChip from "@/components/PriceChip";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ToastAction } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";
import { useUsesLeft } from "@/lib/aiUsage";
import {
  type Competitor, type EditFields, MAX_COMPETITORS, addCompetitor, brandFacts, dismissName, editFields, fromSuggestion, isSuggesting, loadSuggestions,
  nameKey, noneOfThese, pickChoice, readEdit, readState, removeCompetitor, restoreCompetitor, runRead, runSuggest, updateCompetitor, type CompetitorsState,
} from "@/lib/competitors";
import { links } from "@/lib/links";
import { reasonText } from "@/lib/prices";

const TOUCH = "[@media(pointer:coarse)]:min-h-11";
const initials = (name: string) => name.split(/[\s.@_-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";

function Logo({ c }: { c: Pick<Competitor, "name" | "logo"> }) {
  const [broken, setBroken] = useState(false);
  return c.logo && !broken ? (
    <img src={c.logo} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} className="h-10 w-10 shrink-0 rounded-lg border border-border/60 bg-background object-contain p-1" />
  ) : (
    <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-xs font-semibold text-muted-foreground">{initials(c.name)}</span>
  );
}

/** Where the row points: its site, else its first handle. */
const whereOf = (c: Competitor) => {
  if (c.site) return c.site;
  const [platform, handle] = Object.entries(c.handles).find(([, v]) => v) ?? [];
  if (handle) return platform === "linkedin" ? `linkedin.com/${handle}` : `@${handle} on ${platform![0].toUpperCase()}${platform!.slice(1)}`;
  return c.fbPageId ? "Facebook page" : "";
};

export default function WhoYouWatch({ userId, state, edit, openEdit, closeEdit }: {
  userId: string;
  state: CompetitorsState;
  edit: string | null;
  openEdit: (id: string) => void;
  closeEdit: () => void;
}) {
  const { toast } = useToast();
  const list = state.list;

  const remove = (c: Competitor) => {
    const row = removeCompetitor(userId, c.id);
    closeEdit();
    if (!row) return;
    toast({
      title: `Stopped watching ${row.name}`,
      action: <ToastAction altText="Undo" onClick={() => restoreCompetitor(userId, row)}>Undo</ToastAction>,
    });
  };

  return (
    <section className="space-y-6" aria-labelledby="who-you-watch">
      <div className="space-y-3">
        <div className="flex items-center gap-1.5">
          <h2 id="who-you-watch" className="font-serif text-lg font-semibold tracking-tight">Who you watch</h2>
          <InfoTip label="About Who you watch">Up to 12 per brand. Each brand keeps its own list.</InfoTip>
        </div>
        {list.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nobody yet. Add a competitor above, or let us suggest some from your brand.</p>
        ) : (
          <ul className="divide-y divide-border/60 rounded-2xl border border-border/60">
            {list.map((c) => (
              <Row key={c.id} userId={userId} c={c} open={edit === c.id} onToggle={() => (edit === c.id ? closeEdit() : openEdit(c.id))} onClose={closeEdit} onRemove={() => remove(c)} />
            ))}
          </ul>
        )}
      </div>
      <Suggested userId={userId} state={state} primary={list.length === 0} />
    </section>
  );
}

function Row({ userId, c, open, onToggle, onClose, onRemove }: { userId: string; c: Competitor; open: boolean; onToggle: () => void; onClose: () => void; onRemove: () => void }) {
  const read = readState(userId, c.id);
  const where = whereOf(c);
  return (
    <li className="p-3 sm:p-4">
      <div className="flex items-start gap-3">
        <Logo c={c} />
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
            <span className="font-semibold">{c.name}</span>
            {where && <span className="truncate text-xs text-muted-foreground">{where}</span>}
          </p>
          {read?.status === "running" ? (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground" aria-live="polite"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Finding them...</p>
          ) : c.why ? (
            <p className="line-clamp-2 text-xs text-muted-foreground">{c.why}</p>
          ) : (
            !open && <button type="button" onClick={onToggle} className={`text-xs font-medium text-primary hover:underline ${TOUCH}`}>Add why</button>
          )}
        </div>
        <Button size="icon" variant="ghost" className="h-10 w-10 shrink-0" aria-expanded={open} aria-label={open ? `Close ${c.name}` : `Edit ${c.name}`} onClick={onToggle}>
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
        </Button>
      </div>

      {read?.status === "choices" && (
        <div className="mt-3 space-y-2 pl-[52px]">
          <p className="text-xs font-semibold">Which one?</p>
          <div className="flex flex-wrap gap-2">
            {read.choices.map((ch) => (
              <Button key={ch.site} size="sm" variant="outline" className={`h-auto max-w-full flex-col items-start gap-0 py-1.5 text-left ${TOUCH}`} onClick={() => pickChoice(userId, c.id, ch)}>
                <span className="max-w-[16rem] truncate text-xs font-medium">{ch.title || ch.site}</span>
                <span className="max-w-[16rem] truncate text-[11px] font-normal text-muted-foreground">{ch.site.replace(/^https?:\/\/(www\.)?/, "")}</span>
              </Button>
            ))}
            <Button size="sm" variant="ghost" className={`h-9 ${TOUCH}`} onClick={() => noneOfThese(userId, c.id)}>None of these</Button>
          </div>
        </div>
      )}
      {read?.status === "notFound" && <p className="mt-2 pl-[52px] text-xs text-destructive">We couldn't find their website or pages. Add a link.</p>}
      {read?.status === "failed" && (
        <div role="alert" className="mt-2 flex flex-wrap items-center gap-2 pl-[52px] text-xs text-destructive">
          {read.message}
          <Button size="sm" variant="outline" className={`h-8 gap-1.5 ${TOUCH}`} onClick={() => runRead(userId, c.id, read.input)}><RefreshCw className="h-3.5 w-3.5" /> Try again</Button>
        </div>
      )}

      {open && <Editor key={c.id} userId={userId} c={c} onClose={onClose} onRemove={onRemove} />}
    </li>
  );
}

const FIELDS: { k: Exclude<keyof EditFields, "why" | "adsCountry">; label: string }[] = [
  { k: "name", label: "Name" },
  { k: "site", label: "Website" },
  { k: "facebook", label: "Facebook page or Ad Library link" },
  { k: "instagram", label: "Instagram" },
  { k: "tiktok", label: "TikTok" },
  { k: "linkedin", label: "LinkedIn" },
  { k: "youtube", label: "YouTube" },
];

function Editor({ userId, c, onClose, onRemove }: { userId: string; c: Competitor; onClose: () => void; onRemove: () => void }) {
  const [f, setF] = useState<EditFields>(() => editFields(c));
  const [bad, setBad] = useState<keyof EditFields | null>(null);
  const set = (k: keyof EditFields, v: string) => {
    setF((x) => ({ ...x, [k]: v }));
    if (bad === k) setBad(null);
  };
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const r = readEdit(f);
    if ("field" in r) return setBad(r.field);
    updateCompetitor(userId, c.id, r.patch);
    onClose();
  };
  return (
    <form onSubmit={save} className="mt-3 space-y-3 rounded-xl bg-secondary/40 p-3 sm:ml-[52px]">
      <div className="grid gap-3 sm:grid-cols-2">
        {FIELDS.map(({ k, label }) => (
          <label key={k} className={`space-y-1 text-xs font-medium ${k === "facebook" ? "sm:col-span-2" : ""}`}>
            {label}
            <Input value={f[k]} onChange={(e) => set(k, e.target.value)} aria-invalid={bad === k} className="h-11 text-sm font-normal sm:h-10" />
            {bad === k && <span className="block font-normal text-destructive">Check this field.</span>}
          </label>
        ))}
      </div>
      <label className="block space-y-1 text-xs font-medium">
        Why buyers compare you
        <Textarea value={f.why} onChange={(e) => set("why", e.target.value)} maxLength={200} rows={2} className="text-sm font-normal" />
      </label>
      <fieldset className="space-y-1">
        <legend className="text-xs font-medium">Ads shown in</legend>
        <div className="inline-flex rounded-md border border-border p-0.5" role="group">
          {([["SG", "Singapore"], ["ALL", "Anywhere"]] as const).map(([v, label]) => (
            <button key={v} type="button" aria-pressed={f.adsCountry === v} onClick={() => setF((x) => ({ ...x, adsCountry: v }))}
              className={`h-9 rounded px-3 text-sm font-medium ${TOUCH} ${f.adsCountry === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              {label}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" className={`h-10 ${TOUCH}`}>Save</Button>
        <Button type="button" variant="ghost" className={`h-10 text-muted-foreground hover:text-destructive ${TOUCH}`} onClick={onRemove}>Remove</Button>
        <CopyLinkButton path={links.competitors({ view: "list", edit: c.id })} label={`Copy link to ${c.name}`} className="ml-auto" />
      </div>
    </form>
  );
}

function Suggested({ userId, state, primary }: { userId: string; state: CompetitorsState; primary: boolean }) {
  const { toast } = useToast();
  const busy = isSuggesting();
  const left = useUsesLeft(busy)("competitor-suggest");
  const brand = brandFacts(userId);
  const result = loadSuggestions(userId);
  const hidden = new Set([...state.list.map((c) => nameKey(c.name)), ...state.dismissed]);
  const shown = (result?.suggestions ?? []).filter((s) => !hidden.has(nameKey(s.name)));
  const full = state.list.length >= MAX_COMPETITORS;
  const why = !brand.sells && !brand.serves ? "noBrand" : reasonText({ left, leo: true });

  const add = (s: (typeof shown)[number]) => {
    const r = addCompetitor(userId, fromSuggestion(s));
    if ("reason" in r) return toast({ title: r.reason === "duplicate" ? `You already watch ${r.existing?.name ?? s.name}.` : `${MAX_COMPETITORS} of ${MAX_COMPETITORS}. Remove one to add another.` });
    // a site brings its logo and pages with a free read
    if (r.c.site) void runRead(userId, r.c.id, r.c.site);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="mr-auto font-serif text-lg font-semibold tracking-tight">Suggested for you</h2>
        <div className="flex flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-3">
          <Button variant={primary ? "default" : "outline"} className={`h-10 gap-2 ${TOUCH}`} onClick={() => runSuggest(userId)} disabled={busy || Boolean(why)}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {busy ? "Suggesting..." : "Suggest competitors"}
          </Button>
          {!busy && <PriceChip feature="competitor-suggest" left={left} />}
        </div>
      </div>
      {why === "noBrand" ? (
        <p className="text-xs text-muted-foreground">Say what you sell and who you serve in <Link to="/fads" className="font-medium text-primary hover:underline">F.A.D.S.</Link> first.</p>
      ) : why && <p className="text-xs text-destructive">{why}</p>}
      {result && !busy && (result.suggestions.length === 0 ? (
        <p className="text-sm text-muted-foreground">{result.note ?? "No clear competitors found. Add one you know."}</p>
      ) : shown.length > 0 && (
        <ul className="grid gap-3 lg:grid-cols-2">
          {shown.map((s) => (
            <li key={s.name} className="flex items-start gap-3 rounded-2xl border border-border/60 p-3">
              <Logo c={{ name: s.name, logo: null }} />
              <div className="min-w-0 flex-1 space-y-1">
                <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
                  <span className="font-semibold">{s.name}</span>
                  {s.site && <span className="truncate text-xs text-muted-foreground">{s.site}</span>}
                </p>
                {s.why && <p className="text-xs text-muted-foreground">{s.why}</p>}
                <div className="flex gap-2 pt-1">
                  <Button size="sm" className={`h-9 ${TOUCH}`} onClick={() => add(s)} disabled={full}>Add</Button>
                  <Button size="sm" variant="ghost" className={`h-9 ${TOUCH}`} onClick={() => dismissName(userId, s.name)}>Not them</Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ))}
    </div>
  );
}
