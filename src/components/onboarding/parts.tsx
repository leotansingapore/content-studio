import { forwardRef, useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { logoIsLight } from "@/lib/logoImage";
import { ArrowRightIcon, CaretLeftIcon } from "@phosphor-icons/react";

export function OnboardingCanvas({ progress, onBack, backLabel = "Back", children }: { progress: number | null; onBack?: () => void; backLabel?: string; children: ReactNode }) {
  return (
    <div className="onboard-font min-h-[100dvh] bg-background sm:p-3 lg:p-5">
      <div className="onboard-canvas relative flex min-h-[100dvh] flex-col overflow-hidden sm:min-h-[calc(100dvh-1.5rem)] sm:rounded-[20px] lg:min-h-[calc(100dvh-2.5rem)]">
        <div className="relative z-10 flex flex-1 flex-col items-center gap-8 px-4 pb-12 pt-5 sm:gap-10 sm:px-8 sm:pt-8 lg:px-10 lg:pt-10">
          <header className="flex w-full max-w-[800px] items-center gap-3">
            {onBack ? (
              <button
                type="button"
                onClick={onBack}
                aria-label={backLabel}
                className="-ml-1 grid h-9 w-9 shrink-0 place-items-center rounded-full text-foreground transition-opacity hover:opacity-70 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11"
              >
                <CaretLeftIcon size={22} weight="bold" />
              </button>
            ) : (
              <span className="-ml-1 h-9 w-9 shrink-0 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11" aria-hidden="true" />
            )}
            {progress === null ? (
              <div className="h-[15px] w-full" aria-hidden="true" />
            ) : (
              <div
                role="progressbar"
                aria-label="Brand set up"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progress}
                className="relative h-[15px] w-full overflow-hidden rounded-full bg-primary/10"
              >
                <div
                  className="onboard-bar h-full rounded-full bg-gradient-primary transition-[width] duration-700 ease-out motion-reduce:transition-none"
                  style={{ width: `${Math.max(4, Math.min(100, progress))}%` }}
                />
              </div>
            )}
          </header>
          {children}
        </div>
      </div>
    </div>
  );
}

export function StepTitle({ title, lead, id }: { title: string; lead?: ReactNode; id?: string }) {
  return (
    <div className="flex w-full flex-col items-center gap-2.5 text-center">
      <h1 id={id} tabIndex={-1} className="max-w-full text-[24px] font-bold leading-8 text-foreground outline-none [overflow-wrap:anywhere] focus-visible:shadow-none focus-visible:outline-none sm:text-[26px]">
        {title}
      </h1>
      {lead && <p className="max-w-[30rem] text-base font-medium leading-6 text-muted-foreground [overflow-wrap:anywhere]">{lead}</p>}
    </div>
  );
}

type PillProps = ButtonHTMLAttributes<HTMLButtonElement> & { arrow?: boolean };

export const PrimaryPill = forwardRef<HTMLButtonElement, PillProps>(function PrimaryPill({ arrow = true, className = "", children, type = "button", ...rest }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      className={`onboard-primary relative inline-flex h-[37px] min-w-0 items-center justify-center gap-[5px] overflow-hidden rounded-full bg-gradient-primary px-[15px] text-base font-medium text-primary-foreground transition-[filter,opacity] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:brightness-100 [@media(pointer:coarse)]:h-11 ${className}`}
      {...rest}
    >
      <span className="truncate">{children}</span>
      {arrow && <ArrowRightIcon size={16} weight="bold" className="shrink-0" />}
    </button>
  );
});

export function QuietPill({ className = "", children, type = "button", ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      className={`inline-flex h-[37px] items-center justify-center gap-[5px] rounded-full bg-card px-[15px] text-base font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50 [@media(pointer:coarse)]:h-11 ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Actions({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`flex w-full flex-col-reverse gap-3 sm:w-auto sm:flex-row sm:items-center sm:justify-end sm:gap-5 [&>button]:w-full sm:[&>button]:w-auto ${className}`}>{children}</div>;
}

export function StatusPill({ state }: { state: "required" | "done" }) {
  return state === "done" ? (
    <span className="rounded-full bg-success/10 px-2.5 py-[5px] text-xs font-medium tracking-[0.02em] text-success">Done</span>
  ) : (
    <span className="rounded-full bg-destructive/10 px-2.5 py-[5px] text-xs font-medium tracking-[0.02em] text-destructive">Required</span>
  );
}

export function ScoreRing({ value }: { value: number }) {
  const r = 24.5;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative grid h-[55px] w-[55px] shrink-0 place-items-center" role="img" aria-label={`Brand set up ${value}%`}>
      <svg width="55" height="55" className="absolute inset-0 -rotate-90" aria-hidden="true">
        <circle cx="27.5" cy="27.5" r={r} fill="none" className="stroke-muted" strokeWidth="6" />
        <circle
          cx="27.5"
          cy="27.5"
          r={r}
          fill="none"
          className="stroke-success transition-[stroke-dashoffset] duration-500 ease-in-out motion-reduce:transition-none"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - value / 100)}
        />
      </svg>
      <span className="text-xs font-bold tabular-nums text-success">{value}%</span>
    </div>
  );
}

export function FieldLabel({ children, htmlFor, hint }: { children: ReactNode; htmlFor?: string; hint?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <label htmlFor={htmlFor} className="text-base font-medium text-foreground">
        {children}
      </label>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}

export const fieldClass =
  "w-full min-h-[37px] rounded-[30px] border-0 bg-muted px-[14px] py-[6px] text-base font-medium text-foreground outline-none transition-shadow focus-visible:outline-none focus-visible:shadow-[inset_0_0_0_3px_hsl(var(--foreground)/0.12)] placeholder:font-medium placeholder:text-muted-foreground/80 focus:shadow-[inset_0_0_0_3px_hsl(var(--foreground)/0.12)] [@media(pointer:coarse)]:min-h-11";

export const areaClass =
  "w-full rounded-[20px] border-0 bg-muted p-[12px] text-base font-medium text-foreground outline-none transition-shadow focus-visible:outline-none focus-visible:shadow-[inset_0_0_0_3px_hsl(var(--foreground)/0.12)] placeholder:font-medium placeholder:text-muted-foreground/80 focus:shadow-[inset_0_0_0_3px_hsl(var(--foreground)/0.12)]";

export function useLogoTile(logo: string | null | undefined): string {
  const [light, setLight] = useState(false);
  useEffect(() => {
    let alive = true;
    setLight(false);
    if (logo) void logoIsLight(logo).then((v) => alive && setLight(v));
    return () => {
      alive = false;
    };
  }, [logo]);
  return light ? "onboard-checker-dark" : "onboard-checker";
}

export const RoundLogo = ({ src }: { src: string }) => {
  const [square, setSquare] = useState(true);
  return (
    <img
      src={src}
      alt=""
      onLoad={(e) => {
        const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
        setSquare(h > 0 && w / h > 0.8 && w / h < 1.25);
      }}
      className={square ? "h-full w-full object-cover" : "max-h-12 max-w-12 object-contain"}
    />
  );
};

export function LogoTile({ src, alt, className = "" }: { src: string; alt: string; className?: string }) {
  const tile = useLogoTile(src);
  return (
    <span className={`${tile} flex items-center justify-center ${className}`}>
      <img src={src} alt={alt} className="max-h-full max-w-full object-contain" />
    </span>
  );
}
