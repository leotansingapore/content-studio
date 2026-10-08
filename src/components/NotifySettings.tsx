// My Playbook's two reminder switches: the Monday results email and phone
// alerts (src/lib/notify.ts). Both start off.
import { useEffect, useId, useState } from "react";
import { InfoTip } from "@/components/ui/info-tip";
import { cn } from "@/lib/utils";
import {
  browserPushSupport,
  disablePushHere,
  enablePushHere,
  loadNotifyPrefs,
  pushOnHere,
  saveNotifyPrefs,
  type NotifyPrefs,
} from "@/lib/notify";

function SwitchRow({
  label,
  checked,
  disabled,
  busy,
  onChange,
  tip,
  note,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  busy?: boolean;
  onChange: (next: boolean) => void;
  tip?: string;
  note?: string | null;
}) {
  const id = useId();
  return (
    <div className="space-y-1">
      <div className="flex min-h-11 items-center gap-1">
        <label htmlFor={id} className="flex min-h-11 cursor-pointer items-center text-sm font-medium text-foreground">
          {label}
        </label>
        {tip && <InfoTip label={`About ${label.toLowerCase()}`}>{tip}</InfoTip>}
        <button
          id={id}
          type="button"
          role="switch"
          aria-checked={checked}
          aria-describedby={note ? `${id}-note` : undefined}
          aria-busy={busy || undefined}
          disabled={disabled || busy}
          onClick={() => onChange(!checked)}
          className="ml-auto flex h-11 w-14 shrink-0 items-center justify-end rounded-lg disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span
            aria-hidden
            className={cn(
              "relative inline-flex h-6 w-11 rounded-full transition-colors",
              checked ? "bg-primary" : "bg-muted-foreground/30",
              busy && "animate-pulse",
            )}
          >
            <span
              className={cn(
                "absolute top-0.5 h-5 w-5 rounded-full bg-background shadow transition-transform",
                checked ? "translate-x-[22px]" : "translate-x-0.5",
              )}
            />
          </span>
        </button>
      </div>
      {note && (
        <p id={`${id}-note`} className="text-xs text-muted-foreground">
          {note}
        </p>
      )}
    </div>
  );
}

export default function NotifySettings({ userId, email }: { userId: string; email: string }) {
  const [prefs, setPrefs] = useState<NotifyPrefs>(() => loadNotifyPrefs(userId));
  const [here, setHere] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const support = browserPushSupport();

  useEffect(() => {
    setPrefs(loadNotifyPrefs(userId));
    let live = true;
    void pushOnHere().then((on) => live && setHere(on));
    return () => {
      live = false;
    };
  }, [userId]);

  const save = (next: NotifyPrefs) => setPrefs(saveNotifyPrefs(userId, next));

  const togglePush = async (on: boolean) => {
    setProblem(null);
    setBusy(true);
    try {
      if (on) {
        const result = await enablePushHere();
        if (result === "ok") {
          save({ ...loadNotifyPrefs(userId), push: true });
          setHere(true);
        } else {
          setProblem(
            result === "denied"
              ? "Alerts are blocked for this site. Allow them in your browser settings, then try again."
              : "Couldn't switch alerts on. Try again.",
          );
        }
      } else {
        // Off for the account first, so it sticks even if this device can't be reached.
        save({ ...loadNotifyPrefs(userId), push: false });
        setHere(false);
        await disablePushHere().catch((e) => console.error("Could not unsubscribe this device", e));
      }
    } finally {
      setBusy(false);
    }
  };

  const pushNote =
    problem ??
    (support === "ios-install"
      ? "On iPhone, add Content Studio to your Home Screen and open it from there."
      : support === "unsupported"
        ? "This browser can't show alerts."
        : prefs.push && !here
          ? "Not on for this device yet."
          : null);

  return (
    <div className="space-y-3">
      <SwitchRow
        label="Email me my results every Monday"
        checked={prefs.email}
        onChange={(email) => save({ ...loadNotifyPrefs(userId), email })}
        note={prefs.email && email ? `Sent to ${email} at 8am.` : null}
      />
      <SwitchRow
        label="Phone alerts"
        checked={prefs.push && here}
        disabled={support !== "ok"}
        busy={busy}
        onChange={(on) => void togglePush(on)}
        tip="When a post is due, and Thursday if your goal is behind."
        note={pushNote}
      />
    </div>
  );
}
