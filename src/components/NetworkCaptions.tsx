// Step 3's caption tabs (publish-per-network, Leo only): one "Caption | <Network>" tab per ticked network. The first tab
// holds the shared caption; the others show it ("Same as <first>") until typed in, and "Use the shared caption" undoes
// that. Under each: its counter, hashtags, limit warnings, compliance flags and the network's own options. The
// versions ride on the draft (DraftEntry.versions); the server reads them for listed uids only (social/posts.ts).

import { Loader2, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { scanCompliance, hasComplianceErrors } from "@/lib/compliance";
import { checkLimits, countHashtags, type PlatformId } from "@/lib/platformCounters";
import { platformName, type SocialPlatform } from "@/lib/socialConnect";
import type { NetworkVersion } from "@/lib/draftHistory";
import { CAPTION_MAX } from "@/lib/autoPost";
import type { Placement, ScheduleInput } from "../../supabase/functions/social/posts.ts";

export type Versions = Partial<Record<SocialPlatform, NetworkVersion>>;
/** What the post carries: pictures and videos. */
export interface Media {
  pictures: number;
  videos: number;
}

const TOUCH = "[@media(pointer:coarse)]:min-h-11";
const pill = (on: boolean) =>
  `min-h-9 rounded-full border px-3 text-xs font-semibold transition-colors disabled:opacity-50 ${TOUCH} ${
    on ? "border-primary/60 bg-primary/10 text-primary" : "border-border/60 text-muted-foreground hover:border-primary/40 hover:text-foreground"
  }`;
const LIMITED: string[] = ["linkedin", "instagram", "facebook", "tiktok"];
const PLACEMENT_LABEL: Record<Placement, string> = { feed: "Feed", reel: "Reel", story: "Story" };
const POLL_DAYS: [1 | 3 | 7 | 14, string][] = [[1, "1 day"], [3, "3 days"], [7, "1 week"], [14, "2 weeks"]];
const IG_USERNAME = /^[A-Za-z0-9._]{1,30}$/;

// ---- the rules (pure, NetworkCaptions.test.ts) ----

/** A tab's caption: the first tab's is the shared caption (`base` until typed in); the others follow it until typed in. */
export function captionOf(tabs: string[], versions: Versions, base: string, p: string): string {
  const shared = versions[tabs[0] as SocialPlatform]?.caption ?? base;
  return p === tabs[0] ? shared : (versions[p as SocialPlatform]?.caption ?? shared);
}

/** Whether a tab other than the first has its own caption. */
export const ownCaption = (tabs: string[], versions: Versions, p: string) => p !== tabs[0] && typeof versions[p as SocialPlatform]?.caption === "string";

/** The versions with one tab's caption set (null: back to the shared one). A caption equal to the one it would show anyway is not stored. */
export function withCaption(tabs: string[], versions: Versions, base: string, p: string, text: string | null): Versions {
  const same = p === tabs[0] ? base : captionOf(tabs, versions, base, tabs[0]);
  return withVersion(versions, p, (v) => {
    if (text === null || text === same) delete v.caption;
    else v.caption = text;
  });
}

/** The versions with one network's entry changed; an entry left empty is dropped. */
export function withVersion(versions: Versions, p: string, change: (v: NetworkVersion) => void): Versions {
  const v: NetworkVersion = { ...versions[p as SocialPlatform] };
  change(v);
  const out = { ...versions };
  if (Object.keys(v).length) out[p as SocialPlatform] = v;
  else delete out[p as SocialPlatform];
  return out;
}

/** What the server takes: the shared caption as content, and a caption for each network whose own differs. */
export function sendCaptions(tabs: string[], versions: Versions, base: string): { content: string; captions: Record<string, string> } {
  const content = captionOf(tabs, versions, base, tabs[0]);
  const captions: Record<string, string> = {};
  for (const p of tabs.slice(1)) {
    const c = captionOf(tabs, versions, base, p);
    if (c !== content) captions[p] = c;
  }
  return { content, captions };
}

/** Where a post can go on Instagram or Facebook with this media, the default first. */
export function placementsFor(platform: string, m: Media): Placement[] {
  const oneVideo = m.videos === 1 && m.pictures === 0;
  const any = m.videos + m.pictures > 0;
  if (platform === "instagram") return oneVideo ? ["reel", "story"] : any ? ["feed", "story"] : [];
  if (platform === "facebook") return ["feed", ...(oneVideo ? (["reel"] as const) : []), ...(any ? (["story"] as const) : [])];
  return [];
}

/** The placement picked, while the media still allows it; else the default. */
export function placementOf(platform: string, versions: Versions, m: Media): Placement | null {
  const ok = placementsFor(platform, m);
  const v = versions[platform as SocialPlatform];
  const picked = platform === "instagram" ? v?.instagram?.placement : platform === "facebook" ? v?.facebook?.placement : undefined;
  return picked && ok.includes(picked) ? picked : (ok[0] ?? null);
}

/** Instagram's, Facebook's and LinkedIn's options for the server, for the ticked networks only. */
export function networkFields(tabs: string[], versions: Versions, m: Media): Pick<ScheduleInput, "instagram" | "facebook" | "linkedin"> {
  const out: Pick<ScheduleInput, "instagram" | "facebook" | "linkedin"> = {};
  const ig = tabs.includes("instagram") ? placementOf("instagram", versions, m) : null;
  if (ig) {
    const o = versions.instagram?.instagram;
    const collaborators = (o?.collaborators ?? []).map((c) => c.trim().replace(/^@/, "")).filter(Boolean);
    out.instagram = {
      placement: ig,
      ...(ig === "reel" && o?.shareToFeed === false ? { shareToFeed: false as const } : {}),
      ...(ig === "reel" && o?.trial ? { trial: true as const } : {}),
      ...(ig !== "story" && collaborators.length ? { collaborators } : {}),
      ...(ig !== "story" && o?.commentsOff ? { commentsOff: true as const } : {}),
    };
  }
  const fb = tabs.includes("facebook") ? placementOf("facebook", versions, m) : null;
  if (fb) out.facebook = { placement: fb };
  const poll = versions.linkedin?.linkedin?.poll;
  if (tabs.includes("linkedin") && poll && m.pictures + m.videos === 0) out.linkedin = { poll: { ...poll, options: poll.options.map((o) => o.trim()).filter(Boolean) } };
  return out;
}

/** Why the network options can't go, in the server's own words (checkSchedule), or null. */
export function optionsProblem(tabs: string[], versions: Versions, m: Media): string | null {
  const f = networkFields(tabs, versions, m);
  const c = f.instagram?.collaborators ?? [];
  if (c.length > 3) return "Add up to 3 collaborators.";
  if (c.some((x) => !IG_USERNAME.test(x))) return "Check the collaborators: an Instagram username has letters, numbers, dots and underscores.";
  const poll = f.linkedin?.poll;
  if (poll) {
    if (!poll.question.trim() || poll.question.trim().length > 140) return "Write the poll question in 140 characters or fewer.";
    if (poll.options.length < 2) return "Give the poll 2 to 4 options.";
  }
  return null;
}

// "#money #cpf" at the very end of the text, on its own line or after the last sentence
// a tag starts at the text's start or after a space, so "word#tag" is never split
const TRAILING_TAGS = /(?:^|\s)((?:#[\p{L}\p{N}_]+\s*)+)$/u;

/** The caption's trailing hashtags moved onto the end of the first comment, or null when it ends in none. */
export function moveHashtags(text: string, comment = ""): { body: string; comment: string } | null {
  const m = TRAILING_TAGS.exec(text);
  const body = m ? text.slice(0, m.index).trimEnd() : "";
  if (!m || !body) return null;
  const tags = m[1].trim().split(/\s+/).join(" ");
  return { body, comment: comment.trim() ? `${comment.trim()}\n\n${tags}` : tags };
}

/** Over its network's limit, or a red compliance flag: the tab's label turns red. */
export function tabFlagged(p: string, caption: string): boolean {
  return caption.length > (CAPTION_MAX[p as keyof typeof CAPTION_MAX] ?? Infinity) || hasComplianceErrors(scanCompliance(caption));
}

// ---- the tabs ----

export function NetworkCaptions({
  tabs,
  open,
  onOpen,
  versions,
  base,
  onVersions,
  media,
  write,
  extra,
}: {
  /** The ticked networks, in row order. */
  tabs: string[];
  open: string;
  onOpen: (p: string) => void;
  versions: Versions;
  /** The shared caption before anything was typed: postText(draft, brand). */
  base: string;
  onVersions: (v: Versions) => void;
  media: Media;
  /** "Write a version for each network": shown with two networks or more. */
  write: { busy: boolean; error: string; chip: ReactNode; disabled: boolean; run: () => void };
  /** The network's own fields inside its tab (TikTok's settings, YouTube's title). */
  extra?: (p: string) => ReactNode;
}) {
  const p = tabs.includes(open) ? open : tabs[0];
  const caption = captionOf(tabs, versions, base, p);
  const story = placementOf(p, versions, media) === "story";
  const flags = scanCompliance(caption);
  const limits = LIMITED.includes(p) ? checkLimits(caption, p as PlatformId) : null;
  const max = CAPTION_MAX[p as keyof typeof CAPTION_MAX] ?? 63206;
  const tags = countHashtags(caption);
  const setCaption = (text: string | null) => onVersions(withCaption(tabs, versions, base, p, text));
  const set = (change: (v: NetworkVersion) => void) => onVersions(withVersion(versions, p, change));
  const placements = placementsFor(p, media);
  const ig = versions.instagram?.instagram;
  const poll = versions.linkedin?.linkedin?.poll;
  const hasMedia = media.pictures + media.videos > 0;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Captions" className="-mx-1 flex min-w-0 max-w-full flex-1 gap-1.5 overflow-x-auto px-1 py-0.5">
          {tabs.map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={t === p}
              onClick={() => onOpen(t)}
              className={`${pill(t === p)} shrink-0 whitespace-nowrap ${tabFlagged(t, captionOf(tabs, versions, base, t)) ? "!border-destructive/60 !text-destructive" : ""}`}
            >
              Caption | {platformName(t)}
            </button>
          ))}
        </div>
        {tabs.length > 1 && (
          <span className="flex flex-wrap items-center gap-1.5">
            <Button size="sm" variant="outline" disabled={write.busy || write.disabled} onClick={write.run} className={`h-9 gap-1.5 ${TOUCH}`}>
              {write.busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              {write.busy ? "Writing..." : "Write a version for each network"}
            </Button>
            {!write.busy && write.chip}
          </span>
        )}
      </div>
      {write.error && <p className="text-destructive">{write.error}</p>}

      <div role="tabpanel" aria-label={`Caption | ${platformName(p)}`} className="space-y-1.5">
        {story ? (
          <p className="text-muted-foreground">Stories show no caption, and no first comment is posted.</p>
        ) : (
          <>
            <Textarea id={`caption-${p}`} aria-label={`Caption | ${platformName(p)}`} value={caption} onChange={(e) => setCaption(e.target.value)} rows={5} className="text-xs" />
            {p !== tabs[0] &&
              (ownCaption(tabs, versions, p) ? (
                <button type="button" onClick={() => setCaption(null)} className={`font-semibold text-primary hover:underline ${TOUCH}`}>Use the shared caption</button>
              ) : (
                <p className="text-muted-foreground">Same as {platformName(tabs[0])}</p>
              ))}
            <p className={caption.length > max ? "text-destructive" : "text-muted-foreground"}>
              {caption.length} / {max}
              {tags ? `. ${tags} hashtag${tags === 1 ? "" : "s"}` : ""}
              {limits?.warnings.length ? `. ${limits.warnings.map((w) => w.message).join(" ")}` : ""}
            </p>
            {flags.map((f) => (
              <p key={f.id} className={f.severity === "error" ? "text-destructive" : "text-amber-700 dark:text-amber-300"}>
                <span className="font-semibold">{f.match}</span>: {f.message}
              </p>
            ))}
          </>
        )}

        {placements.length > 1 && (
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Post as">
            <span className="font-semibold text-foreground">Post as</span>
            {placements.map((x) => (
              <button
                key={x}
                type="button"
                aria-pressed={placementOf(p, versions, media) === x}
                onClick={() => set((v) => (p === "instagram" ? (v.instagram = { ...v.instagram, placement: x }) : (v.facebook = { placement: x })))}
                className={pill(placementOf(p, versions, media) === x)}
              >
                {PLACEMENT_LABEL[x]}
              </button>
            ))}
          </div>
        )}
        {p === "instagram" && placements.length > 0 && !story && (
          <div className="space-y-1">
            {placementOf(p, versions, media) === "reel" && (
              <>
                <Check on={ig?.shareToFeed !== false} label="Also show in the feed" onChange={(on) => set((v) => (v.instagram = { placement: "reel", ...v.instagram, shareToFeed: on }))} />
                <Check on={!!ig?.trial} label="Trial reel: show it to non-followers first" onChange={(on) => set((v) => (v.instagram = { placement: "reel", ...v.instagram, trial: on }))} />
                {ig?.trial && <p className="text-muted-foreground">Instagram needs a business or creator account; Planable reports 200+ followers.</p>}
              </>
            )}
            <label className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-foreground">Collaborators</span>
              <Input
                value={(ig?.collaborators ?? []).join(" ")}
                onChange={(e) => set((v) => (v.instagram = { placement: placementOf(p, versions, media)!, ...v.instagram, collaborators: e.target.value.split(/[\s,]+/).filter(Boolean) }))}
                placeholder="@username (up to 3)"
                className={`h-9 w-full max-w-xs text-xs ${TOUCH}`}
              />
            </label>
            <Check on={!!ig?.commentsOff} label="Turn off comments" onChange={(on) => set((v) => (v.instagram = { placement: placementOf(p, versions, media)!, ...v.instagram, commentsOff: on }))} />
          </div>
        )}
        {p === "linkedin" && (
          <div className="space-y-1">
            <Check
              on={!!poll && !hasMedia}
              disabled={hasMedia}
              label="Add a poll"
              onChange={(on) => set((v) => (on ? (v.linkedin = { poll: { question: "", options: ["", ""], days: 7 } }) : delete v.linkedin))}
            />
            {hasMedia && <p className="text-muted-foreground">A LinkedIn poll can't carry pictures or a video.</p>}
            {poll && !hasMedia && (
              <div className="space-y-1.5">
                <Input aria-label="Question" placeholder="Question" maxLength={140} value={poll.question} onChange={(e) => set((v) => (v.linkedin = { poll: { ...poll, question: e.target.value } }))} className={`h-9 text-xs ${TOUCH}`} />
                {[0, 1, 2, 3].map((i) => (
                  <Input
                    key={i}
                    aria-label={`Option ${i + 1}`}
                    placeholder={`Option ${i + 1}`}
                    maxLength={30}
                    value={poll.options[i] ?? ""}
                    onChange={(e) => set((v) => (v.linkedin = { poll: { ...poll, options: [0, 1, 2, 3].map((j) => (j === i ? e.target.value : (poll.options[j] ?? ""))) } }))}
                    className={`h-9 text-xs ${TOUCH}`}
                  />
                ))}
                <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Runs for">
                  <span className="font-semibold text-foreground">Runs for</span>
                  {POLL_DAYS.map(([d, label]) => (
                    <button key={d} type="button" aria-pressed={poll.days === d} onClick={() => set((v) => (v.linkedin = { poll: { ...poll, days: d } }))} className={pill(poll.days === d)}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        {extra?.(p)}
      </div>
    </div>
  );
}

function Check({ on, label, onChange, disabled }: { on: boolean; label: string; onChange: (on: boolean) => void; disabled?: boolean }) {
  return (
    <label className={`flex min-h-9 items-center gap-2 ${TOUCH} ${disabled ? "text-muted-foreground" : ""}`}>
      <input type="checkbox" checked={on} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-primary" />
      {label}
    </label>
  );
}
