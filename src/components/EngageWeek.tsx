import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Check, Loader2 } from "lucide-react";
import {
  engageList, fetchClients, isoWeek, loadEngage, saveEngage, sizedCreators,
  type ClientPick, type EngagePerson, type EngageState,
} from "@/lib/engage";

const fmt = (n: number) => (n >= 10_000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
const profileOf = (c: ClientPick) => (c.platform === "tiktok" ? `https://www.tiktok.com/@${c.user}` : `https://www.instagram.com/${c.user}/`);

/** Discover > Following: 10 people to comment on or reply to this week, ticked off as you go. */
export default function EngageWeek({ userId }: { userId: string | null }) {
  const week = isoWeek();
  const [state, setState] = useState<EngageState>({ week, done: [] });
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState("");
  const creators = useMemo(() => sizedCreators(), []);

  useEffect(() => {
    if (!userId) return;
    const s = loadEngage(userId, week);
    setState(s);
    if (s.clients) return;
    setLoading(true);
    fetchClients()
      .then((r) => setState(saveEngage(userId, { ...loadEngage(userId, week), clients: r.clients, usualViews: r.usualViews, audited: r.audited, kept: r.kept })))
      .catch((e) => setFailed((e as Error).message))
      .finally(() => setLoading(false));
  }, [userId, week]);

  const { bigger, peers } = useMemo(() => engageList(creators, state.usualViews ?? null, week), [creators, state.usualViews, week]);
  const clients = state.clients ?? [];
  const total = bigger.length + peers.length + clients.length;
  const done = state.done.length;
  const toggle = (key: string) => {
    if (!userId) return;
    setState((s) => saveEngage(userId, { ...s, done: s.done.includes(key) ? s.done.filter((k) => k !== key) : [...s.done, key] }));
  };
  const creatorRow = (p: EngagePerson) => (
    <Row key={p.key} on={state.done.includes(`c:${p.key}`)} onToggle={() => toggle(`c:${p.key}`)} name={p.name} href={p.url}
      why={`${p.handle}, about ${fmt(p.usual)} ${p.unit} a post`} />
  );

  return (
    <section className="space-y-4 rounded-2xl border border-border/60 p-4" aria-labelledby="engage-week">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="engage-week" className="text-base font-semibold">Engage this week</h2>
        <span className="text-xs tabular-nums text-muted-foreground" aria-live="polite">{done} of {total} done</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-muted-foreground">Bigger accounts</h3>
          <ul className="space-y-2">{bigger.map(creatorRow)}</ul>
        </div>
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-muted-foreground">Peers</h3>
          <ul className="space-y-2">{peers.map(creatorRow)}</ul>
        </div>
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-muted-foreground">Likely clients</h3>
          {loading ? (
            <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading your comments...</p>
          ) : failed ? (
            <p role="alert" className="text-xs text-destructive">{failed}</p>
          ) : clients.length ? (
            <ul className="space-y-2">
              {clients.map((c) => (
                <Row key={`${c.platform}:${c.user}`} on={state.done.includes(`p:${c.platform}:${c.user}`)} onToggle={() => toggle(`p:${c.platform}:${c.user}`)}
                  name={`@${c.user}`} href={profileOf(c)}
                  why={<>{c.why === "likely" ? "Sounds interested: " : "Commented: "}"{c.text}"</>} />
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">
              {state.audited === false
                ? <>Run your <Link to="/analytics" className="font-medium text-primary hover:underline">account audit</Link> to find people who comment on your posts.</>
                : state.kept === false
                  ? "Your account audit starts keeping who comments from its next weekly refresh."
                  : "No one has commented on your posts in the last 45 days."}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function Row({ on, onToggle, name, href, why }: { on: boolean; onToggle: () => void; name: string; href: string; why: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3">
      <button type="button" role="checkbox" aria-checked={on} aria-label={`Done with ${name}`} onClick={onToggle}
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-colors ${on ? "border-primary bg-primary text-primary-foreground" : "border-border hover:border-primary/60"}`}>
        {on && <Check className="h-4 w-4" />}
      </button>
      <div className="min-w-0">
        <a href={href} target="_blank" rel="noreferrer" className={`block truncate text-sm font-semibold hover:underline [@media(pointer:coarse)]:relative [@media(pointer:coarse)]:-my-3 [@media(pointer:coarse)]:py-3 ${on ? "text-muted-foreground line-through" : ""}`}>{name}</a>
        <span className="line-clamp-1 text-xs text-muted-foreground">{why}</span>
      </div>
    </li>
  );
}
