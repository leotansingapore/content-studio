import { CheckIcon } from "@phosphor-icons/react";
import { Actions, PrimaryPill, QuietPill, useLogoTile } from "@/components/onboarding/parts";
import { readableInk } from "@/lib/onboardingFlow";

export function DoneStep({ id, name, logo, colours, line, titleId }: { id: string; name: string; logo: string | null; colours: string[]; line: string; titleId: string }) {
  const tile = useLogoTile(logo);
  const open = (path: string) => window.location.assign(`${path}?profile=${encodeURIComponent(id)}`);
  const main = colours[0] ?? "#1E3A8A";
  return (
    <div className="flex w-full max-w-[520px] flex-1 flex-col items-center justify-center gap-9 pb-[8vh] text-center">
      <div className="w-full overflow-hidden rounded-[24px] bg-card text-left shadow-card motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-safe:duration-500">
        <div className="relative h-24" style={{ background: `linear-gradient(135deg, ${main}, ${colours[1] ?? main})` }}>
          <span className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full bg-white/90 text-success shadow-card">
            <CheckIcon size={16} weight="bold" />
          </span>
        </div>
        <div className="relative z-10 -mt-10 space-y-3 px-5 pb-5">
          <span className={`${tile} grid h-20 w-20 place-items-center overflow-hidden rounded-2xl border-4 border-card shadow-card`}>
            {logo ? (
              <img src={logo} alt="" className="max-h-16 max-w-16 object-contain" />
            ) : (
              <span className="grid h-full w-full place-items-center font-serif text-3xl font-semibold" style={{ backgroundColor: main, color: readableInk(main) }}>
                {name.trim().charAt(0).toUpperCase() || "?"}
              </span>
            )}
          </span>
          <div className="space-y-1">
            <p className="truncate font-serif text-xl font-semibold text-foreground">{name}</p>
            {line && <p className="line-clamp-2 text-sm text-muted-foreground">{line}</p>}
          </div>
          {colours.length > 0 && (
            <div className="flex gap-1.5" aria-label="Brand colours">
              {colours.map((c) => (
                <span key={c} className="h-5 w-5 rounded-full border border-foreground/20" style={{ backgroundColor: c }} title={c} />
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="flex flex-col items-center gap-2.5">
        <h1 id={titleId} tabIndex={-1} className="font-serif text-[26px] font-semibold tracking-tight text-foreground outline-none focus-visible:shadow-none focus-visible:outline-none sm:text-[30px]">
          {name} is ready
        </h1>
        <p className="max-w-[26rem] text-[15px] text-muted-foreground sm:text-base">It has its own posts, plan, calendar and links, kept apart from your other brands.</p>
      </div>
      <Actions className="sm:justify-center">
        <QuietPill onClick={() => open("/calendar")}>Open its calendar</QuietPill>
        <PrimaryPill onClick={() => open("/generate")}>Write its first post</PrimaryPill>
      </Actions>
    </div>
  );
}
