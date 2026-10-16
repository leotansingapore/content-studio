import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Copy, Loader2, MessageCircle, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  ROLE_HELP,
  ROLE_NAMES,
  checkMe,
  errorText,
  fetchBoard,
  inviteMember,
  listTeam,
  reinviteMember,
  revokeMember,
  updateMember,
  type Board,
  type Role,
  type TeamMember,
} from "@/lib/reelsBoard";

// /reels/team: Leo invites people to his posts board and sets what each one sees and may do (docs/team-roles.md).
// The server checks every request; this page is only reachable in practice for Leo.

const ROLES = Object.keys(ROLE_NAMES) as Role[];
const STATUS: Record<TeamMember["status"], [string, string]> = {
  joined: ["Joined", "bg-success/15 text-success"],
  invited: ["Invite sent", "bg-primary/10 text-primary"],
  expired: ["Invite expired", "bg-warning/20"],
  revoked: ["Removed", "bg-muted text-muted-foreground"],
};

function ShareLink({ link, name, onDone }: { link: string; name: string; onDone: () => void }) {
  const { toast } = useToast();
  const text = `Hi ${name}, here's your link to review posts on my board. It works once, for 7 days: ${link}`;
  return (
    <div className="space-y-2 rounded-xl border border-primary/40 bg-primary/5 p-3" role="status">
      <p className="text-sm font-semibold">Invite link for {name}</p>
      <p className="break-all rounded-md bg-background px-2 py-1.5 font-mono text-xs">{link}</p>
      <p className="text-xs text-muted-foreground">Shown once. It works for one account, for 7 days.</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => navigator.clipboard.writeText(link).then(() => toast({ title: "Link copied" }), () => toast({ title: "Copy failed", variant: "destructive" }))}>
          <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy link
        </Button>
        <Button size="sm" variant="outline" asChild>
          <a href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer">
            <MessageCircle className="mr-1.5 h-3.5 w-3.5" /> Send on WhatsApp
          </a>
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>Done</Button>
      </div>
    </div>
  );
}

function BrandBoxes({ brands, value, onChange, disabled }: { brands: Board["brands"]; value: string[]; onChange: (v: string[]) => void; disabled?: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      {brands.map((b) => {
        const on = value.includes(b.id);
        return (
          <label key={b.id} className={`inline-flex h-9 cursor-pointer items-center gap-2 rounded-full border px-3 text-xs font-semibold ${on ? "border-primary bg-primary/10" : "border-border/60 text-muted-foreground"}`}>
            <input type="checkbox" className="h-4 w-4 accent-primary" checked={on} disabled={disabled}
              onChange={(e) => onChange(e.target.checked ? [...value, b.id] : value.filter((x) => x !== b.id))} />
            {b.name}
          </label>
        );
      })}
    </div>
  );
}

export default function ReelsTeamPage() {
  const { toast } = useToast();
  const [owner, setOwner] = useState<boolean | null>(null);
  const [brands, setBrands] = useState<Board["brands"]>([]);
  const [members, setMembers] = useState<TeamMember[] | null>(null);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("commenter");
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [shared, setShared] = useState<{ link: string; name: string } | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Team - Reels - Content Studio";
    checkMe(true)
      .then(async (me) => {
        setOwner(me.owner);
        if (!me.owner) return;
        const [b, m] = await Promise.all([fetchBoard(), listTeam()]);
        setBrands(b.brands);
        setMembers(m);
      })
      .catch((e) => setError(errorText(e, "Check your connection and try again.")));
  }, []);

  const fail = (e: unknown, what: string) => toast({ title: errorText(e, `Couldn't ${what}. Try again.`), variant: "destructive" });
  const put = (m: TeamMember) => setMembers((list) => list && list.map((x) => (x.id === m.id ? { ...x, ...m, email: m.email ?? x.email } : x)));

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await inviteMember({ label: name.trim(), role, brands: picked });
      setMembers((list) => [...(list ?? []), r.member]);
      setShared({ link: r.link, name: name.trim() });
      setName("");
      setPicked([]);
    } catch (err) {
      fail(err, "create the invite");
    } finally {
      setBusy(false);
    }
  };

  if (owner === false) {
    return <p className="text-sm text-muted-foreground">Only Leo manages who sees the posts board. <Link to="/reels" className="font-semibold text-primary">Back to Reels</Link></p>;
  }

  const live = (members ?? []).filter((m) => m.status !== "revoked");
  const gone = (members ?? []).filter((m) => m.status === "revoked");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-1">
        <Link to="/reels" className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Reels
        </Link>
        <h1 className="font-serif text-2xl font-semibold tracking-tight sm:text-3xl">Team</h1>
      </header>

      {error && <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm">The team didn't load ({error}).</div>}
      {!members && !error && <div className="h-40 animate-pulse rounded-xl bg-muted/50" aria-busy="true" aria-label="Loading the team" />}

      {members && (
        <>
          <section className="space-y-3 rounded-2xl border border-border/60 bg-card p-4 shadow-card">
            <h2 className="flex items-center gap-2 text-base font-semibold"><UserPlus className="h-4 w-4" /> Invite someone</h2>
            {shared ? (
              <ShareLink link={shared.link} name={shared.name} onDone={() => setShared(null)} />
            ) : (
              <form onSubmit={invite} className="space-y-4">
                <label className="block space-y-1 text-xs font-semibold text-muted-foreground">
                  Name, as it shows on their notes
                  <Input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Mei Ling" className="text-sm font-normal text-foreground" />
                </label>
                <fieldset className="space-y-1.5">
                  <legend className="text-xs font-semibold text-muted-foreground">What they can do</legend>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {ROLES.map((r) => (
                      <label key={r} className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 ${role === r ? "border-primary bg-primary/5" : "border-border/60"}`}>
                        <input type="radio" name="role" className="mt-0.5 h-4 w-4 accent-primary" checked={role === r} onChange={() => setRole(r)} />
                        <span><span className="block text-sm font-semibold">{ROLE_NAMES[r]}</span><span className="block text-xs text-muted-foreground">{ROLE_HELP[r]}</span></span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <fieldset className="space-y-1.5">
                  <legend className="text-xs font-semibold text-muted-foreground">Which brands they see</legend>
                  <BrandBoxes brands={brands} value={picked} onChange={setPicked} />
                </fieldset>
                {role === "approver" && (
                  <p className="text-xs font-semibold text-warning">An approver's approval posts to Instagram at the scheduled time.</p>
                )}
                <Button type="submit" disabled={busy || !name.trim() || picked.length === 0}>
                  {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Create invite link
                </Button>
                {(!name.trim() || picked.length === 0) && <p className="text-xs text-muted-foreground">Add a name and at least one brand.</p>}
              </form>
            )}
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold">On the team <span className="font-normal text-muted-foreground">{live.length}</span></h2>
            {live.length === 0 && <p className="rounded-xl border border-dashed border-border/70 py-6 text-center text-sm text-muted-foreground">Nobody yet.</p>}
            <ul className="space-y-2">
              {live.map((m) => (
                <li key={m.id} className="space-y-3 rounded-xl border border-border/60 bg-card p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{m.label}</span>
                    {m.email && <span className="text-xs text-muted-foreground">{m.email}</span>}
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS[m.status][1]}`}>{STATUS[m.status][0]}</span>
                    <select value={m.role} aria-label={`${m.label}'s role`}
                      onChange={(e) => updateMember(m.id, { role: e.target.value as Role }).then(put, (err) => fail(err, "change the role"))}
                      className="ml-auto h-9 rounded-md border border-input bg-background px-2 text-sm">
                      {ROLES.map((r) => <option key={r} value={r}>{ROLE_NAMES[r]}</option>)}
                    </select>
                  </div>
                  <BrandBoxes brands={brands} value={m.brands}
                    onChange={(v) => v.length ? updateMember(m.id, { brands: v }).then(put, (err) => fail(err, "change the brands")) : toast({ title: "Keep at least one brand, or remove them" })} />
                  <div className="flex flex-wrap gap-2">
                    {m.status !== "joined" && (
                      <Button size="sm" variant="outline" onClick={() => reinviteMember(m.id).then((link) => setShared({ link, name: m.label }), (err) => fail(err, "make a new link"))}>
                        New invite link
                      </Button>
                    )}
                    {confirming === m.id ? (
                      <>
                        <Button size="sm" variant="destructive"
                          onClick={() => revokeMember(m.id).then(() => { put({ ...m, status: "revoked" }); setConfirming(null); toast({ title: `${m.label} can no longer see the board` }); }, (err) => fail(err, "remove them"))}>
                          Remove {m.label}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>Keep</Button>
                      </>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => setConfirming(m.id)}>Remove</Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            {gone.length > 0 && (
              <p className="text-xs text-muted-foreground">Removed: {gone.map((m) => m.label).join(", ")}. Invite them again to give access back.</p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
