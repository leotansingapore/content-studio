// The saved snapshot of a remix source: header, cover, caption excerpt and numbers (docs/north-star/items/remix-compare.md).
// Kept apart from RemixCompare so a page can show it without loading the top posts, advisors and ads drops.

import { ExternalLink, Facebook, Globe, Instagram, Linkedin, Video, Youtube } from "lucide-react";
import { sourceNoun, type RemixSource } from "@/lib/remixSource";

const ICONS: Record<string, typeof Globe> = { instagram: Instagram, linkedin: Linkedin, facebook: Facebook, youtube: Youtube, tiktok: Video };

const COMPACT = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
/** 141900 -> "141.9K", as topPosts' compactNum, without loading the top posts. */
const compact = (n: number) => COMPACT.format(Math.max(0, n || 0));

const PLATFORM_NAME: Record<string, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
  linkedin: "LinkedIn",
  x: "X",
  facebook: "Facebook",
  "meta-ad": "Meta",
};

/** "Instagram reel", "Meta ad", "YouTube Short"; "Your post" for the adviser's own. */
export function kindLabel(s: Pick<RemixSource, "kind" | "format" | "platform">): string {
  if (s.kind === "own") return "Your post";
  const noun = sourceNoun(s);
  const name = s.platform && Object.prototype.hasOwnProperty.call(PLATFORM_NAME, s.platform) ? PLATFORM_NAME[s.platform] : undefined;
  return name ? `${name} ${noun}` : noun.charAt(0).toUpperCase() + noun.slice(1);
}

/** ["32.6K views", "249 likes", "2.4x their usual"]: only the numbers the source has. */
export function numberParts(n: RemixSource["numbers"]): string[] {
  if (!n) return [];
  const parts: string[] = [];
  if (n.views) parts.push(`${compact(n.views)} views`);
  if (n.likes) parts.push(`${compact(n.likes)} likes`);
  if (n.comments) parts.push(`${compact(n.comments)} comments`);
  if (n.daysRunning) parts.push(`${n.daysRunning} ${n.daysRunning === 1 ? "day" : "days"} running`);
  if (n.ratio) parts.push(`${Math.round(n.ratio * 10) / 10}x their usual`);
  return parts;
}

/** The saved snapshot of a source: header, cover, caption excerpt and numbers. Formats reuse it as their Original tab. */
export function OriginalPane({
  source,
  label = "Remixed from",
  linkText = "Open original",
}: {
  source: RemixSource;
  /** The header line: a formats page shows the source before anything is remixed from it. */
  label?: string;
  linkText?: string;
}) {
  const Icon = ICONS[source.platform ?? ""] ?? Globe;
  const numbers = numberParts(source.numbers);
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          {source.author && <span className="min-w-0 break-words font-semibold text-foreground">{source.author}</span>}
          <span className="text-muted-foreground">{kindLabel(source)}</span>
          {source.url && (
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline [@media(pointer:coarse)]:min-h-11"
            >
              {linkText} <ExternalLink className="h-3 w-3" aria-hidden />
            </a>
          )}
        </div>
      </div>
      {source.cover && <img src={source.cover} alt="" loading="lazy" className="mx-auto block max-h-64 w-auto max-w-full rounded-lg bg-muted" />}
      {source.caption ? (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-muted-foreground">What they wrote, for reference only</p>
          <p className="whitespace-pre-line break-words border-l-2 border-border pl-3 text-sm leading-relaxed text-foreground/85">{source.caption}</p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No text was saved with this source.</p>
      )}
      {numbers.length > 0 && (
        <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {numbers.map((n) => (
            <span key={n}>{n}</span>
          ))}
        </p>
      )}
    </div>
  );
}
