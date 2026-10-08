import { UserRound } from "lucide-react";

// What a link-in-bio page looks like: the public /l/<slug> page and the
// editor's live preview both draw it.
export default function BioView({
  displayName,
  headline,
  photo,
  links,
  compact = false,
}: {
  displayName: string;
  headline: string;
  photo: string | null;
  links: { key: string; label: string; href?: string }[];
  compact?: boolean;
}) {
  return (
    <div className={`mx-auto flex w-full max-w-md flex-col items-center text-center ${compact ? "gap-3" : "gap-4"}`}>
      <span
        className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-border/70 bg-muted ${
          compact ? "h-16 w-16" : "h-24 w-24"
        }`}
      >
        {photo ? (
          <img src={photo} alt={displayName} className="h-full w-full object-cover" />
        ) : (
          <UserRound className="h-1/2 w-1/2 text-muted-foreground" aria-hidden />
        )}
      </span>
      <div className="space-y-1">
        <h1 className={`break-words font-serif font-semibold leading-tight text-foreground ${compact ? "text-lg" : "text-2xl"}`}>
          {displayName || "Your name"}
        </h1>
        {headline && <p className="break-words text-sm text-muted-foreground">{headline}</p>}
      </div>
      <ul className="w-full space-y-2.5">
        {links.map((l) => (
          <li key={l.key}>
            {l.href ? (
              <a
                href={l.href}
                rel="noopener"
                className="flex min-h-12 w-full items-center justify-center break-words rounded-xl border border-primary/40 bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-card transition-opacity hover:opacity-90 [overflow-wrap:anywhere]"
              >
                {l.label}
              </a>
            ) : (
              <span className="flex min-h-12 w-full items-center justify-center break-words rounded-xl border border-primary/40 bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground [overflow-wrap:anywhere]">
                {l.label}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
