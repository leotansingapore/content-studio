import { useId, type ReactNode } from "react";
import { GlobeIcon } from "@phosphor-icons/react";
import { Actions, PrimaryPill, QuietPill, StepTitle } from "@/components/onboarding/parts";

export function SiteStep({
  title,
  onSkip,
  address,
  error,
  blocked,
  appLink,
  below,
  onAddress,
  onRead,
  onNoSite,
}: {
  title?: string;
  onSkip?: () => void;
  address: string;
  error: string;
  blocked: boolean;
  appLink: boolean;
  below?: ReactNode;
  onAddress: (v: string) => void;
  onRead: () => void;
  onNoSite: () => void;
}) {
  const id = useId();
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        onRead();
      }}
      className="flex w-full max-w-[560px] flex-1 flex-col justify-center gap-9 pb-[8vh] motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-300"
    >
      <div className="flex flex-col items-center gap-6">
        <StepTitle
          title={title ?? "Start with your website"}
          lead={appLink ? "We'll read the App Store listing, the app's own site and reviews of apps like it. Nothing is posted." : "Paste your website and we'll pick up your logo, colours and how you sound, usually in under a minute. Nothing is posted."}
        />
        <div className="w-full space-y-1.5">
          <label htmlFor={`${id}-site`} className="sr-only">
            Your website or App Store link
          </label>
          <div
            className={`flex h-12 w-full items-center gap-2 rounded-2xl border bg-card px-3.5 shadow-card transition-shadow focus-within:shadow-[inset_0_0_0_3px_hsl(var(--primary)/0.22)] ${error ? "border-destructive shadow-[inset_0_0_0_1px_hsl(var(--destructive))]" : "border-border/70"}`}
          >
            <GlobeIcon size={18} className={`shrink-0 ${error ? "text-destructive" : "text-muted-foreground"}`} aria-hidden="true" />
            <input
              id={`${id}-site`}
              value={address}
              onChange={(e) => onAddress(e.target.value)}
              placeholder="yourbusiness.com"
              inputMode="url"
              autoComplete="url"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoFocus
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${id}-error` : undefined}
              className={`min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground/80 focus-visible:shadow-none focus-visible:outline-none ${error ? "text-destructive" : "text-foreground"}`}
            />
          </div>
          {error && (
            <p id={`${id}-error`} role="alert" className="px-1 pt-0.5 text-sm font-medium text-destructive">
              {error}
            </p>
          )}
          {below}
        </div>
      </div>
      <div className="flex flex-col gap-4">
        <Actions>
          <QuietPill onClick={onNoSite}>I don't have a website</QuietPill>
          <PrimaryPill type="submit" disabled={!address.trim() || blocked}>
            {appLink ? "Read the app" : "Read my website"}
          </PrimaryPill>
        </Actions>
        {onSkip && (
          <button type="button" onClick={onSkip} className="mx-auto text-sm font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline [@media(pointer:coarse)]:min-h-11">
            Skip set-up for now
          </button>
        )}
      </div>
    </form>
  );
}
