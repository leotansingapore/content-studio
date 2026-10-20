import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Copy, Link2, Loader2, MessageCircle } from "lucide-react";
import SectionTabs, { BOARD_TABS } from "@/components/SectionTabs";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  ROLE_HELP,
  ROLE_NAMES,
  checkMe,
  createLink,
  errorText,
  fetchBoard,
  linkOff,
  listTeam,
  revokeMember,
  updateMember,
  type Board,
  type Role,
  type TeamLink,
  type TeamMember,
} from "@/lib/reelsBoard";

// /reels/team: Leo makes invite links for his posts board (a role and brands, no names) and manages who
// joined (docs/team-roles.md). The server checks every request; this page is only of use to Leo.

const ROLES = Object.keys(ROLE_NAMES) as Role[];
const day = (iso: string) => new Date(iso).toLocaleDateString([], { day: "numeric", month: "short" });

function ShareLink({ url, role, brands, onDone }: { url: string; role: Role; brands: string; onDone: () => void }) {
  const { toast } = useToast();
  const once = role === "approver";
  const text = `Here's your link to my posts board (${ROLE_NAMES[role].toLowerCase()}, ${brands}). It works for 7 days: ${url}`;
  return (
    <div className="space-y-2 rounded-xl border border-primary/40 bg-primary/5 p-3" role="status">
      <p className="text-sm font-semibold">Link ready: {ROLE_NAMES[role]}, {brands}</p>
      <p className="break-all rounded-md bg-background px-2 py-1.5 font-mono text-xs">{url}</p>
      <p className="text-xs text-muted-foreground">
        {once ? "Works for one person, for 7 days." : "Anyone who opens it in the next 7 days joins. You can turn it off below."} Shown once, so copy it now.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => navigator.clipboard.writeText(url).then(() => toast({ title: "Link copied" }), () => toast({ title: "Copy failed", variant: "destructive" }))}>
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

function BrandBoxes({ brands, value, onChange }: { brands: Board["brands"]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {brands.map((b) => {
        const on = value.includes(b.id);
        return (
          <label key={b.id} className={`inline-flex h-9 cursor-pointer items-center gap-2 rounded-full border px-3 text-xs font-semibold [@media(pointer:coarse)]:h-11 ${on ? "border-primary bg-primary/10" : "border-border/60 text-muted-foreground"}`}>
            <input type="checkbox" className="h-4 w-4 accent-primary" checked={on}
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
  const [links, setLinks] = useState<TeamLink[]>([]);
  const [error, setError] = useState("");
  const [role, setRole] = useState<Role>("commenter");
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [shared, setShared] = useState<{ url: string; role: Role; brands: string } | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Team - Posts board - Content Studio";
    checkMe(true)
      .then(async (me) => {
        setOwner(me.owner);
        if (!me.owner) return;
        const [b, t] = await Promise.all([fetchBoard(), listTeam()]);
        setBrands(b.brands);
        setMembers(t.members);
        setLinks(t.links);
      })
      .catch((e) => setError(errorText(e, "Check your connection and try again.")));
  }, []);

  const names = (ids: string[]) => ids.map((id) => brands.find((b) => b.id === id)?.name ?? id).join(", ");
  const fail = (e: unknown, what: string) => toast({ title: errorText(e, `Couldn't ${what}. Try again.`), variant: "destructive" });
  const put = (m: TeamMember) => setMembers((list) => list && list.map((x) => (x.id === m.id ? { ...x, ...m, email: m.email ?? x.email } : x)));

  const make = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await createLink({ role, brands: picked });
      setLinks((l) => [r.link, ...l]);
      setShared({ url: r.url, role, brands: names(picked) });
      setPicked([]);
    } catch (err) {
      fail(err, "make the link");
    } finally {
      setBusy(false);
    }
  };

  if (owner === false) {
    return <p className="text-sm text-muted-foreground">Only Leo manages who sees the posts board. <Link to="/reels" className="font-semibold text-primary">Back to the posts board</Link></p>;
  }

  const live = (members ?? []).filter((m) => m.status === "joined");
  // people who rejoined through a newer link are on the team, not in the removed line
  const gone = (members ?? []).filter((m) => m.status === "removed" && !live.some((x) => x.email && x.email === m.email));
  const activeLinks = links.filter((l) => l.status === "active");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <SectionTabs tabs={BOARD_TABS} />
      <header className="space-y-1">
        <h1 className="font-serif text-2xl font-semibold tracking-tight sm:text-3xl">Team</h1>
      </header>

      {error && <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm">The team didn't load ({error}).</div>}
      {!members && !error && <div className="h-40 animate-pulse rounded-xl bg-muted/50" aria-busy="true" aria-label="Loading the team" />}

      {members && (
        <>
          <section className="space-y-3 rounded-2xl border border-border/60 bg-card p-4 shadow-card">
            <h2 className="flex items-center gap-2 text-base font-semibold"><Link2 className="h-4 w-4" /> Invite link</h2>
            {shared ? (
              <ShareLink {...shared} onDone={() => setShared(null)} />
            ) : (
              <form onSubmit={make} className="space-y-4">
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
                  <p className="text-xs font-semibold text-warning">An approver link works for one person, and their approvals post to Instagram.</p>
                )}
                <Button type="submit" disabled={busy || picked.length === 0}>
                  {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Create link
                </Button>
                {picked.length === 0 && <p className="text-xs text-muted-foreground">Pick at least one brand.</p>}
              </form>
            )}
          </section>

          {activeLinks.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-base font-semibold">Links that work <span className="font-normal text-muted-foreground">{activeLinks.length}</span></h2>
              <ul className="space-y-2">
                {activeLinks.map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-border/60 bg-card p-3 text-sm">
                    <span className="font-semibold">{ROLE_NAMES[l.role]}</span>
                    <span className="text-muted-foreground">{names(l.brands)}</span>
                    <span className="text-xs text-muted-foreground">
                      {l.uses} joined{l.max_uses ? ` of ${l.max_uses}` : ""}, until {day(l.expires_at)}
                    </span>
                    {confirming === l.id ? (
                      <span className="ml-auto flex gap-2">
                        <Button size="sm" variant="destructive"
                          onClick={() => linkOff(l.id).then(() => { setLinks((x) => x.map((y) => (y.id === l.id ? { ...y, status: "off" } : y))); setConfirming(null); toast({ title: "Link turned off. People who joined keep access." }); }, (err) => fail(err, "turn it off"))}>
                          Turn off
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>Keep</Button>
                      </span>
                    ) : (
                      <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setConfirming(l.id)}>Turn off</Button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="space-y-2">
            <h2 className="text-base font-semibold">On the team <span className="font-normal text-muted-foreground">{live.length}</span></h2>
            {live.length === 0 && <p className="rounded-xl border border-dashed border-border/70 py-6 text-center text-sm text-muted-foreground">Nobody yet.</p>}
            <ul className="space-y-2">
              {live.map((m) => (
                <li key={m.id} className="space-y-3 rounded-xl border border-border/60 bg-card p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{m.label}</span>
                    {m.email && <span className="text-xs text-muted-foreground">{m.email}</span>}
                    <select value={m.role} aria-label={`${m.label}'s role`}
                      onChange={(e) => updateMember(m.id, { role: e.target.value as Role }).then(put, (err) => fail(err, "change the role"))}
                      className="ml-auto h-9 rounded-md border border-input bg-background px-2 text-sm [@media(pointer:coarse)]:h-11">
                      {ROLES.map((r) => <option key={r} value={r}>{ROLE_NAMES[r]}</option>)}
                    </select>
                  </div>
                  <BrandBoxes brands={brands} value={m.brands}
                    onChange={(v) => v.length ? updateMember(m.id, { brands: v }).then(put, (err) => fail(err, "change the brands")) : toast({ title: "Keep at least one brand, or remove them" })} />
                  <div className="flex flex-wrap gap-2">
                    {confirming === m.id ? (
                      <>
                        <Button size="sm" variant="destructive"
                          onClick={() => revokeMember(m.id).then(() => { put({ ...m, status: "removed" }); setConfirming(null); toast({ title: `${m.label} can no longer see the board` }); }, (err) => fail(err, "remove them"))}>
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
              <p className="text-xs text-muted-foreground">Removed: {gone.map((m) => m.label).join(", ")}. Send them a new link to give access back.</p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
