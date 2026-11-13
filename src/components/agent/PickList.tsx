// The formats that suit an ask, under the agent's message (make-pick ranks them with Jev; Fastlane's "Formats for your
// ad" list, 13 Nov comparison): a numbered card each with its example, name and what it shows, then Surprise me. A card,
// or its number typed in the composer, starts that format's questions with the topic already answered.
import { useState } from "react";
import { ShuffleIcon } from "@phosphor-icons/react";
import FormatPreview from "@/components/make/FormatPreview";
import { skillById, type MakeSkill } from "@/lib/makeSkills";

export default function PickList({ ids, disabled, onPick }: { ids: string[]; disabled?: boolean; onPick: (n: number | "surprise") => void }) {
  const list = ids.map(skillById).filter((s): s is MakeSkill => !!s);
  if (!list.length) return null;
  return (
    <div className="w-full max-w-xl space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Formats for this</p>
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {list.map((s, i) => (
          <li key={s.id}>
            <Card s={s} n={i + 1} disabled={disabled} onPick={() => onPick(i)} />
          </li>
        ))}
        <li>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onPick("surprise")}
            className="flex h-full min-h-28 w-full flex-col items-start justify-end gap-1 rounded-2xl bg-muted p-3 text-left ring-1 ring-border/60 transition-shadow hover:ring-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
          >
            <ShuffleIcon className="h-5 w-5 text-muted-foreground" aria-hidden />
            <span className="text-sm font-semibold text-foreground">
              <span className="tabular-nums text-muted-foreground">{list.length + 1} </span>Surprise me
            </span>
          </button>
        </li>
      </ol>
      <p className="text-xs text-muted-foreground">You can also type a number.</p>
    </div>
  );
}

function Card({ s, n, disabled, onPick }: { s: MakeSkill; n: number; disabled?: boolean; onPick: () => void }) {
  const [active, setActive] = useState(false);
  const Icon = s.icon;
  const tile = (
    <span className="flex h-full w-full items-center justify-center text-muted-foreground">
      <Icon className="h-7 w-7" aria-hidden />
    </span>
  );
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onPick}
      onMouseEnter={() => setActive(true)}
      onMouseLeave={() => setActive(false)}
      onFocus={() => setActive(true)}
      onBlur={() => setActive(false)}
      className="flex h-full w-full flex-col gap-1.5 rounded-2xl bg-card p-1.5 text-left shadow-card ring-1 ring-border/60 transition-shadow hover:ring-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
    >
      <span className="relative block aspect-[4/5] w-full overflow-hidden rounded-xl bg-muted">
        {s.poster ? <FormatPreview slug={s.poster.slug} video={s.poster.video} poster={s.poster.src} active={active} fallback={tile} /> : tile}
        <span className="absolute right-1.5 top-1.5 grid h-6 min-w-6 place-items-center rounded-full bg-background/90 px-1.5 text-xs font-semibold tabular-nums text-foreground">{n}</span>
      </span>
      <span className="min-w-0 px-1 pb-1">
        <span className="block text-sm font-semibold leading-snug text-foreground">{s.name}</span>
        <span className="line-clamp-2 block text-xs text-muted-foreground">{s.blurb}</span>
      </span>
    </button>
  );
}
