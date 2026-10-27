// Ad versions on the Image page (docs/adlauncher-ads.md, "Ad versions"): with Versions on 6, the footer's one press is
// one remix make as "ads" for the open headline ad, quote card or stat card, six versions each on a different hook
// formula from AD_FORMULAS (the ones that need no number and no story the brand's facts don't hold). Jev drops any
// that say more than the facts or, for an adviser, fail the MAS question, and marks the one the audience would most
// stop for "Best". The run lives outside React, so leaving the page keeps it, and mirrors its step into formatJob for
// /library's Making now. The kept set is saved in the design (images.ts, synced) with Best's words in its fields; each
// version is drawn small by the page's own drawing code, so looking costs nothing, and tapping one puts its words in
// the fields, so Download, Post it for me and Run as an ad work on it as on any design. Each is launched on its own
// through Run as an ad: an adviser's ad needs its own firm approval code.

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { renderSvg } from "@/lib/carouselLayout";
import type { Measure } from "@/lib/carouselLayout";
import { svgDataUrl } from "@/lib/carouselRender";
import { setFormatJob } from "@/lib/formatJob";
import { hookFormula } from "@/lib/hookFormulas";
import { layoutImage, mainWords, type ImageInput, type ImageSize } from "@/lib/imageLayout";
import { chosenVersion, imageById, saveImage, versionSet, versionWords, type AdVersionSet, type SavedImage, type VersionLayout } from "@/lib/images";
import { links } from "@/lib/links";
import { requestMake, type Flags } from "@/lib/remix";
import type { RemixSource } from "@/lib/remixSource";
import { failure, makeBody } from "@/lib/slideshowJob";
import { cn } from "@/lib/utils";

/** The hook formulas a static ad can open on with no number and no personal story, in the order they are used. */
export const AD_FORMULAS = ["myth-bust", "dilemma", "warning", "permission", "good-great", "callout", "side-by-side", "contrarian", "blunt", "curiosity"] as const;
export const VERSIONS = 6;
export const VERSIONS_STEP = "Writing 6 versions...";
export const VERSIONS_FAILED = "Couldn't write the versions right now. Try again in a minute.";

/** The next press's formulas: the 6 after the last one written, round the list, so Write 6 more opens differently. */
export function nextFormulas(prev: string[] = []): string[] {
  const at = prev.length ? (AD_FORMULAS as readonly string[]).indexOf(prev[prev.length - 1]) + 1 : 0;
  return Array.from({ length: VERSIONS }, (_, k) => AD_FORMULAS[(at + k) % AD_FORMULAS.length]);
}

/** A version's label: its hook formula's name. */
export const hookName = (id: string) => hookFormula(id)?.name ?? id;

// ---- Write 6 versions ---------------------------------------------------------------------------

export interface AdVersionsAsk {
  designId: string;
  layout: VersionLayout;
  source: RemixSource | null;
  topic: string;
  note: string;
  size: ImageSize;
  /** What a swipe ad's picture shows, when it was read before on this device; versions never read it. */
  shows: string;
}

export interface AdVersionsRun {
  id: number;
  designId: string;
  state: "writing" | "done" | "failed";
  error?: string;
  /** The writer or Jev said no (422): the use is kept. */
  refused?: boolean;
  capped?: boolean;
  flags?: Flags;
}

let run: AdVersionsRun | null = null;
let runs = 0;
const listeners = new Set<(r: AdVersionsRun | null) => void>();
const setRun = (next: AdVersionsRun) => {
  run = next;
  listeners.forEach((l) => l({ ...next }));
  const state = next.state === "done" ? "ready" : next.state === "failed" ? "failed" : "working";
  setFormatJob({
    slug: "static-ad",
    label: "Static ad",
    format: "image",
    state,
    ...(state === "working" ? { step: VERSIONS_STEP } : {}),
    ...(next.error ? { error: next.error } : {}),
    href: links.image({ image: next.designId, versions: VERSIONS }),
  });
};
export const adVersionsRun = () => run;
export const adVersionsBusy = () => run?.state === "writing";

export async function startAdVersions(userId: string, ask: AdVersionsAsk): Promise<void> {
  if (adVersionsBusy()) return;
  const base = { id: ++runs, designId: ask.designId };
  setRun({ ...base, state: "writing" });
  try {
    const versions = nextFormulas(imageById(userId, ask.designId)?.versions?.list.map((v) => v.formula));
    const body = makeBody(userId, { source: ask.source, topic: ask.topic, mention: true, note: ask.note, size: ask.size === "9x16" ? "9x16" : "4x5" }, "ads", {
      layout: ask.layout,
      versions,
      ...(ask.shows ? { shows: ask.shows } : {}),
    });
    const res = await requestMake(body);
    if (res?.result?.as !== "ads") throw new Error(VERSIONS_FAILED);
    const set = versionSet(res.result);
    const design = imageById(userId, ask.designId);
    // Best goes in the fields, else the first one kept
    if (design) saveImage(userId, { ...design, layout: set.layout, versions: set, words: versionWords(design.words, set, set.best ?? 0) });
    setRun({ ...base, state: "done", flags: res.flags });
  } catch (e) {
    setRun({ ...base, state: "failed", ...failure(e, VERSIONS_FAILED) });
  }
}

export function useAdVersionsRun(): AdVersionsRun | null {
  const [r, setR] = useState(adVersionsRun);
  useEffect(() => {
    listeners.add(setR);
    return () => void listeners.delete(setR);
  }, []);
  return r;
}

// ---- the versions, drawn small ----------------------------------------------------------------

/** Each kept version as a small picture with its hook's name, Jev's pick tagged Best; picking one puts its words in the design. */
export function AdVersions(p: {
  set: AdVersionSet;
  img: SavedImage;
  input: ImageInput;
  size: ImageSize;
  measure: Measure;
  disabled: boolean;
  onPick: (words: Record<string, string>) => void;
}) {
  const chosen = chosenVersion(p.img.words, p.set);
  const w = p.img.words;
  // drawn again only when something a version shows changes, never on each key typed in its own fields
  const previews = useMemo(
    () => p.set.list.map((_, i) => svgDataUrl(renderSvg(layoutImage({ ...p.input, layout: p.set.layout, words: versionWords(w, p.set, i), samples: true }, p.size, p.measure)))),
    [p.set, p.size, p.measure, p.input.brand, p.input.font, p.input.paper, p.input.align, p.input.picture, w.number, w.statSource, w.who], // eslint-disable-line react-hooks/exhaustive-deps
  );
  return (
    <fieldset className="space-y-2" disabled={p.disabled}>
      <legend className="mb-1.5 text-xs font-semibold text-muted-foreground">Pick a version</legend>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {p.set.list.map((v, i) => (
          <label
            key={`${v.formula}-${i}`}
            className={cn(
              "min-w-0 cursor-pointer space-y-1.5 rounded-lg border p-1.5 focus-within:ring-2 focus-within:ring-primary/40",
              chosen === i ? "border-primary bg-primary/5" : "border-border/60 hover:bg-muted/50",
            )}
          >
            <input type="radio" name="ad-version" checked={chosen === i} onChange={() => p.onPick(versionWords(w, p.set, i))} className="sr-only" />
            <img src={previews[i]} alt={mainWords(p.set.layout, v.words as Record<string, string>)} className="block h-auto w-full rounded border border-border/60" />
            <span className="flex min-h-6 items-center justify-between gap-1 px-0.5">
              <span className="min-w-0 truncate text-xs font-medium">{hookName(v.formula)}</span>
              {p.set.best === i && <span className="shrink-0 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">Best</span>}
            </span>
          </label>
        ))}
      </div>
      {p.set.out > 0 && <p className="text-xs text-muted-foreground">{p.set.out === 1 ? "One more was" : `${p.set.out} more were`} left out as not safe to run.</p>}
      {!p.set.checked && (
        <p className="flex items-start gap-1.5 rounded-lg border border-amber-500/50 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-900 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden /> These weren't checked against your brand facts. Read each one before you run it.
        </p>
      )}
    </fieldset>
  );
}
