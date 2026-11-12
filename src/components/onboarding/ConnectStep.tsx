import { CheckCircleIcon, CircleNotchIcon, FacebookLogoIcon, InstagramLogoIcon, LinkedinLogoIcon, ThreadsLogoIcon, TiktokLogoIcon, WarningCircleIcon, YoutubeLogoIcon, type Icon } from "@phosphor-icons/react";
import { Actions, PrimaryPill, StepTitle } from "@/components/onboarding/parts";
import { NETWORK_KEYS, type Network } from "@/lib/onboardingFlow";
import { capLine, countLine, PLATFORM_NAME, type SocialStatus } from "@/lib/socialConnect";

const ICONS: Record<Network, Icon> = {
  instagram: InstagramLogoIcon,
  facebook: FacebookLogoIcon,
  tiktok: TiktokLogoIcon,
  linkedin: LinkedinLogoIcon,
  youtube: YoutubeLogoIcon,
  threads: ThreadsLogoIcon,
};

export function ConnectStep({
  networks,
  status,
  statusError,
  justConnected,
  note,
  error,
  busy,
  onConnect,
  onContinue,
  titleId,
}: {
  networks: readonly Network[];
  status: SocialStatus | null;
  statusError: string;
  justConnected: string | null;
  note: { ok: boolean; text: string } | null;
  error: string;
  busy: string;
  onConnect: (n: Network) => void;
  onContinue: () => void;
  titleId: string;
}) {
  const shown = networks.length ? networks : NETWORK_KEYS;
  const cap = status ? capLine(status) : null;
  const loading = !status && !statusError;
  const anyConnected = (status?.accounts.length ?? 0) > 0 || (!status && !!justConnected);
  const problem = error || statusError;
  return (
    <div className="flex w-full max-w-[560px] flex-1 flex-col justify-center gap-8 pb-[6vh] motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-300">
      <StepTitle id={titleId} title="Connect your accounts" lead="So your posts can go out from here when you say so. You can do this later in Settings too." />
      <p role="status" className="sr-only">
        {note?.text ?? ""}
      </p>
      {(note || problem) && (
        <div className="space-y-3">
          {note && (
            <p aria-hidden="true" className={`flex items-start gap-2 rounded-2xl px-4 py-3 text-sm font-medium ${note.ok ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
              {note.ok ? <CheckCircleIcon size={18} weight="fill" className="mt-px shrink-0" /> : <WarningCircleIcon size={18} className="mt-px shrink-0" />}
              <span>{note.text}</span>
            </p>
          )}
          {problem && (
            <p role="alert" className="flex items-start gap-2 rounded-2xl bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
              <WarningCircleIcon size={18} className="mt-px shrink-0" />
              <span>{problem}</span>
            </p>
          )}
        </div>
      )}
      <ul className="divide-y divide-border/70 overflow-hidden rounded-[20px] bg-card shadow-card" aria-busy={loading}>
        {shown.map((n) => {
          const Glyph = ICONS[n];
          const linked = status?.accounts.filter((a) => a.platform === n) ?? [];
          const known = linked.length > 0 || (!status && justConnected === n);
          const line = linked.length
            ? `Connected as ${linked.map((a) => (a.username ? `@${a.username.replace(/^@/, "")}` : a.name)).join(", ")}`
            : loading
              ? "Checking..."
              : status
                ? "Not connected"
                : "";
          return (
            <li key={n} className="flex items-center gap-3 px-4 py-3.5">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                <Glyph size={20} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold text-foreground">{PLATFORM_NAME[n]}</span>
                {line && <span className="block truncate text-[13px] text-muted-foreground">{line}</span>}
              </span>
              {known ? (
                <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-success">
                  <CheckCircleIcon size={16} weight="fill" /> Connected
                </span>
              ) : (
                <button
                  type="button"
                  aria-label={busy === n ? `Opening ${PLATFORM_NAME[n]}` : `Connect ${PLATFORM_NAME[n]}`}
                  disabled={!!busy || !!cap || loading}
                  onClick={() => onConnect(n)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border/70 bg-card px-3.5 text-[13px] font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-50 [@media(pointer:coarse)]:h-11"
                >
                  {busy === n && <CircleNotchIcon size={14} className="animate-spin" />}
                  {busy === n ? "Opening..." : "Connect"}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {status && <p className="-mt-4 text-center text-[13px] text-muted-foreground">{cap ?? countLine(status)}</p>}
      <Actions>
        <PrimaryPill onClick={onContinue} disabled={!!busy}>
          {anyConnected || loading || statusError ? "Continue" : "Continue without connecting"}
        </PrimaryPill>
      </Actions>
    </div>
  );
}
