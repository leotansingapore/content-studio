// One email box with an Invite button, and the people already on the brand or invited below it (docs/shared-brands.md).
// The owner's view, on the onboarding step "Invite your team" and on Brand > Team. Every rule is the server's.
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { CircleNotchIcon, EnvelopeSimpleIcon, UserIcon } from "@phosphor-icons/react";
import { EdgeError } from "@/lib/edgeFn";
import { brandTeam, fetchMyBrands, inviteToBrand, removeMember, revokeInvite, teamLines, type TeamLine } from "@/lib/sharedBrands";
import { invitesAllowed } from "@/lib/subscription";

const PILL = "inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-full px-4 text-sm font-medium transition-colors disabled:opacity-50";

export function TeamInvite({ profileId, brandName, onboarding = false }: { profileId: string; brandName: string; onboarding?: boolean }) {
  const allowed = invitesAllowed();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [rowBusy, setRowBusy] = useState("");
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [brand, setBrand] = useState<string | null>(null);
  const [lines, setLines] = useState<TeamLine[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const mine = await fetchMyBrands();
      const b = mine?.find((x) => x.role === "owner" && x.profile === profileId)?.brand ?? null;
      setBrand(b);
      setLines(b ? teamLines(await brandTeam(b), Date.now()).filter((l) => l.kind !== "owner") : []);
    } catch (e) {
      setNote({ ok: false, text: e instanceof Error ? e.message : "Couldn't load the team." });
    } finally {
      setLoading(false);
    }
  }, [profileId]);

  useEffect(() => {
    void load();
  }, [load]);

  const send = async (to: string) => {
    setNote(null);
    setBusy(true);
    try {
      const { email: sent } = await inviteToBrand(profileId, brandName, to);
      setEmail("");
      setNote({ ok: true, text: `Invite sent to ${sent}.` });
      await load();
    } catch (e) {
      setNote({ ok: false, text: e instanceof EdgeError || e instanceof Error ? e.message : "Couldn't send the invite. Try again in a minute." });
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const to = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return setNote({ ok: false, text: "That doesn't look like an email address." });
    void send(to);
  };

  const act = async (line: TeamLine) => {
    if (!brand) return;
    if (line.kind === "member" && !window.confirm(`Remove ${line.email}? They lose this brand at once.`)) return;
    setNote(null);
    setRowBusy(line.id);
    try {
      if (line.kind === "member") await removeMember(brand, line.id);
      else if (line.status === "Expired") await inviteToBrand(profileId, brandName, line.email);
      else await revokeInvite(line.id);
      await load();
    } catch (e) {
      setNote({ ok: false, text: e instanceof Error ? e.message : "That didn't go through. Try again in a minute." });
    } finally {
      setRowBusy("");
    }
  };

  const field = onboarding
    ? "min-h-11 w-full min-w-0 flex-1 rounded-[30px] border-0 bg-muted px-[14px] text-base font-medium text-foreground outline-none placeholder:text-muted-foreground/80 focus-visible:shadow-[inset_0_0_0_3px_hsl(var(--foreground)/0.12)] disabled:opacity-60"
    : "min-h-11 w-full min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-base text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 sm:text-sm";
  const primary = onboarding ? "bg-gradient-primary text-primary-foreground hover:brightness-110" : "bg-primary text-primary-foreground hover:bg-primary/90";

  return (
    <div className="w-full space-y-4">
      <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row" noValidate>
        <label htmlFor="team-invite-email" className="sr-only">
          Email address
        </label>
        <input
          id="team-invite-email"
          type="email"
          inputMode="email"
          autoComplete="off"
          placeholder="name@company.com"
          value={email}
          disabled={!allowed || busy}
          onChange={(e) => setEmail(e.target.value)}
          className={field}
        />
        <button type="submit" disabled={!allowed || busy || !email.trim()} className={`${PILL} ${primary}`}>
          {busy ? <CircleNotchIcon size={16} className="animate-spin" /> : <EnvelopeSimpleIcon size={16} />}
          {busy ? "Sending..." : "Invite"}
        </button>
      </form>
      {!allowed && <p className="text-sm text-muted-foreground">Team invites need an active Postmosis plan.</p>}
      <p role="status" aria-live="polite" className={note ? `text-sm font-medium ${note.ok ? "text-success" : "text-destructive"}` : "sr-only"}>
        {note?.text ?? ""}
      </p>
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading the team...</p>
      ) : (
        lines.length > 0 && (
          <ul className="divide-y divide-border/70 overflow-hidden rounded-[20px] bg-card" aria-label="People on this brand">
            {lines.map((l) => (
              <li key={l.id} className="flex items-center gap-3 p-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                  <UserIcon size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-foreground">{l.email}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {l.status}
                    {l.note ? `. ${l.note}` : ""}
                  </span>
                </span>
                <button
                  type="button"
                  disabled={!!rowBusy}
                  onClick={() => void act(l)}
                  aria-label={`${l.kind === "member" ? "Remove" : l.status === "Expired" ? "Invite again" : "Revoke the invite for"} ${l.email}`}
                  className={`${PILL} bg-muted text-foreground hover:bg-muted/70`}
                >
                  {rowBusy === l.id && <CircleNotchIcon size={14} className="animate-spin" />}
                  {l.kind === "member" ? "Remove" : l.status === "Expired" ? "Invite again" : "Revoke"}
                </button>
              </li>
            ))}
          </ul>
        )
      )}
    </div>
  );
}
