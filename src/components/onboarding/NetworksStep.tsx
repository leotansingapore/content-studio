import { useId } from "react";
import { CaretDownIcon, CheckIcon, FacebookLogoIcon, InstagramLogoIcon, LinkedinLogoIcon, ThreadsLogoIcon, TiktokLogoIcon, YoutubeLogoIcon, type Icon } from "@phosphor-icons/react";
import { Actions, PrimaryPill, QuietPill, StepTitle } from "@/components/onboarding/parts";
import { isPlanNetwork, mainPlatform, NETWORK_KEYS, type Network } from "@/lib/onboardingFlow";
import { PLATFORM_NAME } from "@/lib/socialConnect";

const ICONS: Record<Network, Icon> = {
  instagram: InstagramLogoIcon,
  facebook: FacebookLogoIcon,
  tiktok: TiktokLogoIcon,
  linkedin: LinkedinLogoIcon,
  youtube: YoutubeLogoIcon,
  threads: ThreadsLogoIcon,
};

const LINES: Record<Network, string> = {
  instagram: "Posts, carousels and reels",
  facebook: "Page posts and reels",
  tiktok: "Short videos",
  linkedin: "Posts for work and clients",
  youtube: "Shorts and videos",
  threads: "Short text posts",
};

function PlanLine({ picked, main, onMain }: { picked: readonly Network[]; main: Network | null; onMain: (n: Network) => void }) {
  const id = useId();
  const plan = picked.filter(isPlanNetwork);
  const lead = mainPlatform(picked, main);
  if (!picked.length) return null;
  if (!lead) return <p className="text-center text-[13px] text-muted-foreground">Plans cover Instagram, Facebook, TikTok and LinkedIn for now.</p>;
  if (plan.length === 1) return <p className="text-center text-[13px] text-muted-foreground">Your plan starts on {PLATFORM_NAME[lead]}.</p>;
  return (
    <div className="flex flex-wrap items-center justify-center gap-2 text-[13px] text-muted-foreground">
      <label htmlFor={id}>Your plan starts on</label>
      <span className="relative inline-flex">
        <select
          id={id}
          value={lead}
          onChange={(e) => onMain(e.target.value as Network)}
          className="h-9 appearance-none rounded-full border border-border/70 bg-card pl-3.5 pr-8 text-[13px] font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:coarse)]:h-11"
        >
          {plan.map((n) => (
            <option key={n} value={n}>
              {PLATFORM_NAME[n]}
            </option>
          ))}
        </select>
        <CaretDownIcon size={14} weight="bold" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
      </span>
    </div>
  );
}

export function NetworksStep({
  picked,
  found,
  main,
  onToggle,
  onMain,
  onContinue,
  onUnsure,
  titleId,
}: {
  picked: readonly Network[];
  found: readonly Network[];
  main: Network | null;
  onToggle: (n: Network) => void;
  onMain: (n: Network) => void;
  onContinue: () => void;
  onUnsure: () => void;
  titleId: string;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (picked.length) onContinue();
      }}
      className="flex w-full max-w-[720px] flex-1 flex-col justify-center gap-10 pb-[2vh] motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-300"
    >
      <StepTitle id={titleId} title="Where do you post?" lead="Pick every place you post." />
      <div className="space-y-5">
        <div role="group" aria-labelledby={titleId} className="flex flex-wrap justify-center gap-3 sm:gap-5">
          {NETWORK_KEYS.map((n) => {
            const on = picked.includes(n);
            const Glyph = ICONS[n];
            return (
              <button
                key={n}
                type="button"
                aria-pressed={on}
                onClick={() => onToggle(n)}
                className={`group relative flex w-[calc(50%-6px)] flex-col overflow-hidden rounded-[20px] border-2 text-left transition-colors sm:w-[200px] ${on ? "border-success bg-success/[0.07]" : "border-transparent bg-card hover:border-border"}`}
              >
                {on && (
                  <span className="absolute right-3 top-3 z-10 grid h-6 w-6 place-items-center rounded-full bg-success text-white motion-safe:animate-in motion-safe:zoom-in-50 motion-safe:duration-200">
                    <CheckIcon size={14} weight="bold" />
                  </span>
                )}
                <span className="grid h-[92px] w-full place-items-center bg-gradient-to-br from-primary/10 via-brand/10 to-primary/5">
                  <span className={`grid h-14 w-14 place-items-center rounded-2xl shadow-card transition-transform motion-safe:group-hover:scale-105 ${on ? "bg-success text-white" : "bg-card text-primary"}`}>
                    <Glyph size={28} weight={on ? "fill" : "duotone"} />
                  </span>
                </span>
                <span className="space-y-1 p-3.5">
                  <span className={`block text-lg font-bold leading-snug ${on ? "text-success" : "text-foreground"}`}>{PLATFORM_NAME[n]}</span>
                  <span className={`block text-sm font-medium leading-snug ${on ? "text-success" : "text-muted-foreground"}`}>{found.includes(n) ? "Found on your site" : LINES[n]}</span>
                </span>
              </button>
            );
          })}
        </div>
        <PlanLine picked={picked} main={main} onMain={onMain} />
      </div>
      <Actions className="sm:justify-center">
        <QuietPill onClick={onUnsure}>Not sure yet</QuietPill>
        <PrimaryPill type="submit" disabled={!picked.length}>
          Continue
        </PrimaryPill>
      </Actions>
    </form>
  );
}
