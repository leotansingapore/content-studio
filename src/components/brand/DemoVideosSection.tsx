// Demo videos (brand-demo-videos, wave 4). After products on /brand, #demo-videos, Leo only (BrandPage mounts it).
// A short clip of the brand's app, site or tool in use, kept in Media (src/lib/demoVideos.ts, which runs the upload
// and the read outside React). One demo opens at ?demo=<key> (push; closing replaces): the looping window, its slider,
// What it shows, Save and Delete with Undo. Also here: DemoThumb and SavedDemos, which hook plus demo and green screen
// use to list the brand's demos.

import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { Film, Loader2, X } from "lucide-react";
import PriceChip from "@/components/PriceChip";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToastAction } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";
import { useUsesLeft } from "@/lib/aiUsage";
import type { CarouselBrand } from "@/lib/carousel";
import {
  ACCEPT_DEMO, DEMOS_FULL, DEMO_WINDOW, MAX_DEMOS, MIN_DEMO_SECONDS, clearRefused, demoFile, demoState, demoVideos, onDemos, removeDemo, restoreDemo,
  saveDemo, setShows, uploadDemo, type DemoVideo,
} from "@/lib/demoVideos";
import { getFile } from "@/lib/deviceFiles";
import { clock } from "@/lib/hookDemo";
import { cleanDemo } from "@/lib/mediaLibrary";
import { scoped } from "@/lib/profiles";
import { cn } from "@/lib/utils";
import { useGoneItem, useUrlItem } from "@/lib/urlState";

const TOUCH = "[@media(pointer:coarse)]:min-h-11";
const LIMITS = "MP4 or MOV | Up to 100 MB | Uses 30 seconds";
const FLAG_TIP = "It may show a named product, a projected return or someone's details. Trim or blur it before posting.";

/** A demo's still (the cimg- key of its id), with how long it plays. */
export function DemoThumb({ demoKey, seconds, className = "h-14 w-14" }: { demoKey: string; seconds?: number; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let made = "";
    let live = true;
    getFile(demoKey.replace(/^cvid-/, "cimg-")).then(
      (b) => live && b && setUrl((made = URL.createObjectURL(b))),
      () => undefined,
    );
    return () => {
      live = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [demoKey]);
  return (
    <span className={cn("relative flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border/60 bg-muted text-muted-foreground", className)}>
      {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : <Film className="h-5 w-5" aria-hidden />}
      {seconds !== undefined && (
        <span className="absolute bottom-0.5 right-0.5 rounded bg-black/70 px-1 text-[10px] font-medium tabular-nums text-white">{clock(seconds)}</span>
      )}
    </span>
  );
}

/** The brand's saved demos as a pick list: hook plus demo and green screen show these before their own upload. */
export function SavedDemos({ list, selected, onPick, disabled }: { list: DemoVideo[]; selected?: string; onPick: (d: DemoVideo) => void; disabled?: boolean }) {
  return (
    <ul className="space-y-1.5" aria-label="Your saved demos">
      {list.map((d) => (
        <li key={d.key}>
          <button
            type="button"
            aria-pressed={selected === d.key}
            disabled={disabled}
            onClick={() => onPick(d)}
            className={cn(
              "flex min-h-11 w-full items-center gap-3 rounded-lg border p-2 text-left transition-colors disabled:opacity-60",
              selected === d.key ? "border-primary/60 bg-primary/5" : "border-border/60 hover:border-primary/40",
            )}
          >
            <DemoThumb demoKey={d.key} seconds={d.end - d.start} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{d.name}</span>
              {d.shows && <span className="line-clamp-2 text-xs text-muted-foreground">{d.shows}</span>}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function FlagChip() {
  return (
    <span className="inline-flex items-center gap-0.5 rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-medium text-warning">
      Check the screen <InfoTip label="About this warning" className="h-4 w-4">{FLAG_TIP}</InfoTip>
    </span>
  );
}

const ReadChip = ({ left }: { left: number | null }) => (
  <p className="text-[11px] text-muted-foreground">
    Reading it: <PriceChip feature="media-sort" left={left} />
  </p>
);

/** setBrand goes through BrandPage's own save, so two writers never race on the kit (phase4-build-brief.md, decision 14). */
export default function DemoVideosSection({ userId }: { userId: string; brand: CarouselBrand; setBrand: (patch: Partial<CarouselBrand>) => void }) {
  const s = useSyncExternalStore(onDemos, demoState);
  const list = demoVideos(userId);
  const left = useUsesLeft(!!s.saving || s.reading.size > 0)("media-sort");
  const input = useRef<HTMLInputElement>(null);
  const [open, openDemo, closeDemo] = useUrlItem("demo");
  const found = open ? list.some((d) => d.key === open) : undefined;
  useGoneItem("demo", found, "demo");
  const full = list.length >= MAX_DEMOS;
  // an upload that ends after this section has gone (another page) opens nothing
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => void (mounted.current = false);
  }, []);

  const pick = async (f: File | undefined) => {
    if (!f) return;
    const r = await uploadDemo(userId, f);
    if (r?.window && mounted.current) openDemo(r.key);
  };

  return (
    <section id="demo-videos" className="scroll-mt-20 space-y-3 rounded-xl border border-border/60 p-4 shadow-card" data-testid="demo-videos">
      <div className="flex items-center gap-1">
        <h2 className="font-serif text-lg font-semibold">Demo videos</h2>
        <InfoTip label="About demo videos">A short clip of your app, site or tool in use. Video hook posts open with a hook, then play it.</InfoTip>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Button className={TOUCH} onClick={() => (clearRefused(), input.current?.click())} disabled={full || !!s.saving}>
          Upload a demo
        </Button>
        <span className="text-xs text-muted-foreground">{LIMITS}</span>
        <input
          ref={input}
          type="file"
          accept={ACCEPT_DEMO}
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            // the same file picked again still fires
            e.target.value = "";
            void pick(f);
          }}
        />
      </div>
      <ReadChip left={left} />
      {full && <p className="text-xs text-muted-foreground">{DEMOS_FULL}</p>}
      {s.refused && <p role="alert" className="text-sm text-destructive">{s.refused}</p>}
      {list.length === 0 && !s.saving ? (
        <p className="text-sm text-muted-foreground">No demo videos yet.</p>
      ) : (
        <ul className="divide-y divide-border/60 border-t border-border/60">
          {s.saving && (
            <li className="flex items-center gap-3 py-3" role="status">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-muted">
                <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden />
              </span>
              <span className="min-w-0 truncate text-sm">Saving {s.saving}</span>
            </li>
          )}
          {list.map((d) => (
            <Row key={d.key} userId={userId} d={d} reading={s.reading.has(d.key)} picking={s.picking.has(d.key)} note={s.notes.get(d.key)} onOpen={() => openDemo(d.key)} />
          ))}
        </ul>
      )}
      {open && found && <DemoEditor key={open} userId={userId} demoKey={open} left={left} picking={s.picking.has(open)} onClose={closeDemo} />}
    </section>
  );
}

function Row({ userId, d, reading, picking, note, onOpen }: { userId: string; d: DemoVideo; reading: boolean; picking: boolean; note?: string; onOpen: () => void }) {
  const [typing, setTyping] = useState(false);
  const field = !reading && !picking && (!d.shows.trim() || typing);
  return (
    <li className="flex gap-3 py-3 last:pb-0">
      <DemoThumb demoKey={d.key} seconds={d.end - d.start} />
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 break-words pt-1 text-sm font-semibold">{d.name}</p>
          <Button size="sm" variant="outline" className={`h-9 shrink-0 ${TOUCH}`} onClick={onOpen}>
            Open
          </Button>
        </div>
        {reading ? (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground" role="status">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Reading what it shows
          </p>
        ) : picking ? (
          <p className="text-xs text-muted-foreground">Pick the 30 seconds to use</p>
        ) : field ? (
          <div className="space-y-1">
            {note && <p className="text-xs text-destructive">{note}</p>}
            <Input
              value={d.shows}
              maxLength={120}
              placeholder="What it shows"
              aria-label={`What ${d.name} shows`}
              onFocus={() => setTyping(true)}
              onBlur={() => setTyping(false)}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
              onChange={(e) => setShows(userId, d.key, e.target.value)}
            />
          </div>
        ) : (
          <p className="line-clamp-2 text-xs text-muted-foreground">Shows: {d.shows}</p>
        )}
        {d.flags.length > 0 && <FlagChip />}
      </div>
    </li>
  );
}

interface Draft {
  start: number;
  end: number;
  shows: string;
}
const draftKey = (userId: string) => `cs-demo-edit-${scoped(userId)}`;

/** What was typed for this demo in this tab: a reload keeps it until Save or close. */
function keptDraft(userId: string, key: string): Draft | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(draftKey(userId)) ?? "null");
    return v?.key === key && typeof v.draft?.shows === "string" && Number.isFinite(v.draft.start) && Number.isFinite(v.draft.end) ? v.draft : null;
  } catch {
    return null;
  }
}

/** One demo in a dialog over /brand: the window playing on a loop, its slider, the line, Save and Delete. */
function DemoEditor({ userId, demoKey, left, picking, onClose }: { userId: string; demoKey: string; left: number | null; picking: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const d = demoVideos(userId).find((x) => x.key === demoKey)!;
  const length = d.seconds || d.end;
  const [draft, setDraft] = useState<Draft>(() => keptDraft(userId, demoKey) ?? { start: d.start, end: d.end, shows: d.shows });
  const [src, setSrc] = useState<string | null>(null);
  const [gone, setGone] = useState(false);
  const player = useRef<HTMLVideoElement>(null);
  const first = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    try {
      sessionStorage.setItem(draftKey(userId), JSON.stringify({ key: demoKey, draft }));
    } catch {
      // storage blocked: the draft lasts this visit
    }
  }, [userId, demoKey, draft]);
  // closed by Close, Escape, Save, Delete or Back: what was typed goes (a reload never runs this, so it keeps it)
  useEffect(() => () => {
    try {
      sessionStorage.removeItem(draftKey(userId));
    } catch {
      // nothing kept
    }
  }, [userId]);
  useEffect(() => {
    let made = "";
    let live = true;
    demoFile(demoKey).then(
      (b) => live && (b ? setSrc((made = URL.createObjectURL(b))) : setGone(true)),
      () => live && setGone(true),
    );
    return () => {
      live = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [demoKey]);
  useEffect(() => first.current?.focus(), []);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  });
  // the preview jumps to the window's start whenever it moves
  useEffect(() => {
    const v = player.current;
    if (v && v.readyState > 0) v.currentTime = draft.start;
  }, [draft.start]);

  const move = (start: number, end: number) => {
    const w = cleanDemo({ start, end }, length);
    if (w) setDraft((x) => ({ ...x, start: w.start, end: w.end }));
  };
  // the start keeps the window's length where it can; the end stays within 3 to 30 seconds of the start
  const span = draft.end - draft.start;
  const reads = !draft.shows.trim() || picking;
  const long = length > DEMO_WINDOW + 0.5;

  const save = (e: FormEvent) => {
    e.preventDefault();
    saveDemo(userId, demoKey, draft);
    onClose();
  };
  const remove = () => {
    const item = removeDemo(userId, demoKey);
    onClose();
    if (!item) return;
    toast({
      title: "Demo removed.",
      action: (
        <ToastAction altText="Undo" onClick={() => restoreDemo(userId, item)}>
          Undo
        </ToastAction>
      ),
    });
  };

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <form role="dialog" aria-modal="true" aria-labelledby="demo-editor-title" onSubmit={save}
        className="flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-background shadow-elegant sm:max-w-lg sm:rounded-2xl">
        <div className="flex items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
          <h2 id="demo-editor-title" className="truncate font-serif text-lg font-semibold">{d.name}</h2>
          <Button ref={first} type="button" variant="ghost" size="icon" className="h-10 w-10 shrink-0" aria-label="Close" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3">
          {gone ? (
            <p className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">This demo isn't on this device. Open it on the device you uploaded it from.</p>
          ) : (
            <video
              ref={player}
              src={src ?? undefined}
              muted
              autoPlay
              playsInline
              aria-label={`${d.name}, the part to use`}
              className="mx-auto max-h-[38vh] w-full rounded-lg bg-black object-contain"
              onLoadedMetadata={(e) => (e.currentTarget.currentTime = draft.start)}
              onTimeUpdate={(e) => {
                const v = e.currentTarget;
                if (v.currentTime >= draft.end || v.currentTime < draft.start - 0.25) v.currentTime = draft.start;
              }}
              onEnded={(e) => {
                e.currentTarget.currentTime = draft.start;
                void e.currentTarget.play().catch(() => undefined);
              }}
            />
          )}
          <fieldset className="space-y-2">
            <legend className="flex w-full items-baseline justify-between gap-2 text-sm font-medium">
              {long ? "Pick the 30 seconds to use" : "The part to use"}
              <span className="text-xs font-normal tabular-nums text-muted-foreground">{clock(draft.start)} to {clock(draft.end)}</span>
            </legend>
            <label className="block space-y-1 text-xs text-muted-foreground">
              Starts at
              <input type="range" min={0} max={Math.max(0, length - MIN_DEMO_SECONDS)} step={0.1} value={draft.start}
                onChange={(e) => {
                  const start = Number(e.target.value);
                  move(start, start + span);
                }}
                className={`h-8 w-full accent-primary ${TOUCH}`} />
            </label>
            <label className="block space-y-1 text-xs text-muted-foreground">
              Ends at
              <input type="range" min={0} max={length} step={0.1} value={draft.end}
                onChange={(e) => move(draft.start, Math.max(Number(e.target.value), draft.start + MIN_DEMO_SECONDS))}
                className={`h-8 w-full accent-primary ${TOUCH}`} />
            </label>
          </fieldset>
          <div className="space-y-1.5">
            <Label htmlFor="demo-shows">What it shows</Label>
            <Input id="demo-shows" value={draft.shows} maxLength={120} placeholder="Like a client's monthly budget being filled in"
              onChange={(e) => setDraft((x) => ({ ...x, shows: e.target.value }))} />
            {d.flags.length > 0 && <FlagChip />}
          </div>
        </div>
        <div className="space-y-2 border-t border-border/60 px-4 py-3">
          {/* Save reads the window when the line is empty or the window was never read: its price shows first */}
          {reads && <ReadChip left={left} />}
          <div className="flex items-center gap-2">
            <Button type="submit" className={TOUCH}>Save</Button>
            <Button type="button" variant="ghost" className={`ml-auto text-muted-foreground ${TOUCH}`} onClick={remove}>Delete</Button>
          </div>
        </div>
      </form>
    </div>,
    document.body,
  );
}
