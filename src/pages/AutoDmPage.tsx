// Auto-DM (Recruit > Auto-DM, /recruit/auto-dm): when someone comments a keyword on the open brand's
// post, Zernio answers them with a DM (Instagram, Facebook) or a public reply (TikTok, Threads,
// LinkedIn, YouTube). List, switch on or off, see who got it, create, edit and delete.
// ?keyword=GUIDE (from Write) opens a new one with that keyword. Server: supabase/functions/social.

import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Image as ImageIcon, LayoutGrid, MessageCircle, Plus, RotateCw, Trash2, X } from "lucide-react";
import SectionTabs, { RECRUIT_TABS } from "@/components/SectionTabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { InfoTip } from "@/components/ui/info-tip";
import { useToast } from "@/hooks/use-toast";
import { hasComplianceErrors } from "@/lib/compliance";
import { supabase } from "@/lib/supabase";
import { activeProfile, scoped } from "@/lib/profiles";
import { isNotEnabled, platformName, rememberSocialConnect } from "@/lib/socialConnect";
import {
  LIMITS,
  STARTERS,
  accountLabel,
  accountPosts,
  applyStarter,
  autoDmLogs,
  autoDmName,
  deleteAutoDm,
  emptyForm,
  fillName,
  keptForm,
  formFlags,
  listensTo,
  formFromView,
  formProblem,
  hasDm,
  listAutoDms,
  logLine,
  saveAutoDm,
  setAutoDmActive,
  splitKeywords,
  type AccountOption,
  type AutoDmForm,
  type AutomationView,
  type LogView,
  type PostOption,
  type Trigger,
} from "@/lib/autoDm";

// The form while it is open, kept for this tab so leaving the page doesn't throw away what was
// typed. sessionStorage, outside the synced prefix: the auto-DM itself is saved on Save.
const formKey = (userId: string) => `cs-autodm-form-${scoped(userId)}`;
const readKept = (userId: string) => {
  try {
    return sessionStorage.getItem(formKey(userId));
  } catch {
    return null;
  }
};

const message = (e: unknown) => (e instanceof Error ? e.message : "That didn't go through. Try again in a minute.");
const chip = (on: boolean) =>
  `min-h-11 rounded-full border px-3 text-xs font-semibold transition-colors sm:min-h-9 [@media(pointer:coarse)]:min-h-11 ${
    on ? "border-primary/60 bg-primary/10 text-primary" : "border-border/60 text-muted-foreground hover:border-primary/40 hover:text-foreground"
  }`;

function Switch({ on, label, busy, onChange }: { on: boolean; label: string; busy?: boolean; onChange: (on: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      aria-busy={busy || undefined}
      disabled={busy}
      onClick={() => onChange(!on)}
      className="flex h-11 shrink-0 items-center gap-2 rounded-lg px-1 text-xs font-semibold disabled:opacity-60"
    >
      <span aria-hidden className={`relative inline-flex h-6 w-11 rounded-full transition-colors ${on ? "bg-primary" : "bg-muted-foreground/60"}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-background shadow transition-transform ${on ? "translate-x-[22px]" : "translate-x-0.5"}`} />
      </span>
      <span className={`w-12 text-left text-[13px] font-normal ${on ? "text-foreground" : "text-muted-foreground"}`}>{on ? "On" : "Paused"}</span>
    </button>
  );
}

export default function AutoDmPage() {
  const { toast } = useToast();
  const [params, setParams] = useSearchParams();
  const [userId, setUserId] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "off" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [list, setList] = useState<AutomationView[]>([]);
  const [posts, setPosts] = useState<Record<string, PostOption[]>>({});
  const [form, setForm] = useState<AutoDmForm | null>(null);
  // a keyword brought from Write: it stays when a starting point fills the rest
  const [broughtKeyword, setBroughtKeyword] = useState("");
  const [busy, setBusy] = useState("");
  const profileId = activeProfile(userId).id;

  /** False when Zernio couldn't read them. */
  const loadPosts = async (accountId: string): Promise<boolean> => {
    if (posts[accountId]) return true;
    try {
      const { posts: p } = await accountPosts(activeProfile(userId).id, accountId);
      setPosts((m) => ({ ...m, [accountId]: p }));
      return true;
    } catch {
      return false;
    }
  };

  const load = async (uid: string, keyword = "") => {
    try {
      const r = await listAutoDms(activeProfile(uid).id);
      rememberSocialConnect(true);
      setAccounts(r.accounts);
      setList(r.automations);
      setState("ready");
      const kept = keptForm(readKept(uid), r.accounts.map((a) => a.id), r.automations.map((a) => a.id));
      if (keyword && r.accounts.length) setForm(emptyForm(r.accounts[0].id, keyword));
      else if (kept) setForm(kept);
      const bound = new Set(r.automations.filter((a) => a.platformPostId).map((a) => a.accountId));
      for (const id of bound) void accountPosts(activeProfile(uid).id, id).then(({ posts: p }) => setPosts((m) => ({ ...m, [id]: p })), () => {});
    } catch (e) {
      if (isNotEnabled(e)) {
        rememberSocialConnect(false);
        setState("off");
      } else {
        setError(message(e));
        setState("error");
      }
    }
  };

  useEffect(() => {
    const keyword = splitKeywords(params.get("keyword") ?? "")[0]?.slice(0, LIMITS.keyword) ?? "";
    if (keyword) {
      setBroughtKeyword(keyword);
      setParams({}, { replace: true });
    }
    supabase.auth.getUser().then(({ data }) => {
      const id = data.user?.id ?? null;
      setUserId(id);
      if (id) void load(id, keyword);
      else setState("off");
    });
    // once, on arrival
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const accountOf = (id: string) => accounts.find((a) => a.id === id);

  const toggle = async (a: AutomationView) => {
    const next = !a.active;
    setBusy(`t${a.id}`);
    setList((l) => l.map((x) => (x.id === a.id ? { ...x, active: next } : x)));
    try {
      await setAutoDmActive(profileId, a.id, next);
      toast({ title: next ? `Auto-DM for ${autoDmName(a)} is on` : `Auto-DM for ${autoDmName(a)} is paused` });
    } catch (e) {
      setList((l) => l.map((x) => (x.id === a.id ? { ...x, active: a.active } : x)));
      toast({ title: message(e), variant: "destructive" });
    } finally {
      setBusy("");
    }
  };

  const remove = async (a: AutomationView) => {
    const acct = accountOf(a.accountId);
    const where = acct ? ` on ${accountLabel(acct)}` : "";
    if (!window.confirm(`Delete the auto-DM for ${autoDmName(a)}${where}? Who got it goes too.`)) return;
    setBusy(`d${a.id}`);
    try {
      await deleteAutoDm(profileId, a.id);
      setList((l) => l.filter((x) => x.id !== a.id));
      toast({ title: `Deleted the auto-DM for ${autoDmName(a)}` });
      forgetForm();
      setForm(null);
    } catch (e) {
      toast({ title: message(e), variant: "destructive" });
    } finally {
      setBusy("");
    }
  };

  const forgetForm = () => {
    try {
      if (userId) sessionStorage.removeItem(formKey(userId));
    } catch {
      // storage blocked: nothing was kept
    }
  };

  const saved = (wasNew: boolean) => {
    forgetForm();
    setForm(null);
    setBroughtKeyword("");
    toast({ title: wasNew ? "Auto-DM saved and on" : "Auto-DM saved" });
    if (userId) void load(userId);
  };

  return (
    <div className="space-y-5">
      <SectionTabs tabs={RECRUIT_TABS} />
      {!(state === "ready" && form) && (
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0 space-y-1.5">
            <h1 className="font-serif text-2xl font-semibold tracking-tight sm:text-[34px] sm:leading-tight">Auto-DM</h1>
            <p className="text-[15px] text-muted-foreground">When someone comments your keyword, they get your DM.</p>
          </div>
          {state === "ready" && accounts.length > 0 && (
            <Button className="h-11 gap-2 px-[18px] text-[15px] font-semibold" onClick={() => setForm(emptyForm(accounts[0].id, broughtKeyword))}>
              <Plus className="h-[18px] w-[18px]" /> New auto-DM
            </Button>
          )}
        </header>
      )}

      {state === "loading" && (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          Loading your auto-DMs...
        </p>
      )}
      {state === "off" && <p className="text-sm text-muted-foreground">Auto-DM isn't switched on for you yet.</p>}
      {state === "error" && (
        <div className="space-y-2">
          <p className="text-sm text-destructive">{error}</p>
          <Button
            variant="outline"
            className="h-11 gap-2"
            onClick={() => {
              if (!userId) return;
              setState("loading");
              void load(userId);
            }}
          >
            <RotateCw className="h-4 w-4" /> Try again
          </Button>
        </div>
      )}

      {state === "ready" && accounts.length === 0 && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Connect the account people comment on first.</p>
          <Button asChild className="h-11">
            <Link to="/accounts">Connect an account</Link>
          </Button>
        </div>
      )}

      {state === "ready" && form && (
        <Editor
          key={form.id ?? "new"}
          start={form}
          profileId={profileId}
          accounts={accounts}
          posts={posts}
          loadPosts={loadPosts}
          broughtKeyword={broughtKeyword}
          draftKey={userId ? formKey(userId) : ""}
          onCancel={() => {
            forgetForm();
            setForm(null);
          }}
          onSaved={saved}
          deleting={busy === `d${form.id}`}
          onDelete={
            form.id
              ? () => {
                  const a = list.find((x) => x.id === form.id);
                  if (a) void remove(a);
                }
              : undefined
          }
        />
      )}

      {state === "ready" && !form && accounts.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            {accounts.map((a) => (
              <span key={a.id} className="inline-flex min-h-9 items-center gap-2 rounded-full border border-border bg-card px-3">
                {platformName(a.platform)}
                <span className="text-muted-foreground">{accountLabel(a)}</span>
              </span>
            ))}
            <Link to="/accounts" className="inline-flex min-h-11 items-center text-primary hover:underline">
              Social accounts
            </Link>
          </div>

          {list.length === 0 ? (
            <p className="text-sm text-muted-foreground">None yet.</p>
          ) : (
            <>
              <section aria-label="Totals" className="space-y-2">
                <div className="grid grid-cols-3 gap-2 sm:gap-4">
                  {(
                    [
                      ["DMs sent", "sent"],
                      ["Read", "read"],
                      ["Link taps", "clicked"],
                    ] as const
                  ).map(([label, k]) => (
                    <div key={k} className="flex min-w-0 flex-col gap-0.5 rounded-xl border border-border bg-card p-3 sm:gap-1.5 sm:px-5 sm:py-[18px]">
                      <span className="text-xs text-muted-foreground sm:text-[13px]">{label}</span>
                      <span className="text-[22px] font-semibold tabular-nums tracking-tight sm:text-[28px]">{list.reduce((n, a) => n + a.stats[k], 0)}</span>
                    </div>
                  ))}
                </div>
                <p className="text-[13px] text-muted-foreground">Since each one was switched on</p>
              </section>

              <section aria-labelledby="adm-list" className="space-y-3">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 id="adm-list" className="text-lg font-semibold">
                    Your auto-DMs
                  </h2>
                  <span className="text-sm text-muted-foreground">
                    {list.filter((a) => a.active).length} of {list.length} on
                  </span>
                </div>
                <ul className="space-y-3">
                  {list.map((a) => (
                    <Row
                      key={a.id}
                      a={a}
                      account={accounts.length > 1 ? accountOf(a.accountId) : undefined}
                      post={posts[a.accountId]?.find((p) => p.id === a.platformPostId)}
                      profileId={profileId}
                      busy={busy}
                      onToggle={() => toggle(a)}
                      onEdit={() => {
                        setForm(formFromView(a));
                        void loadPosts(a.accountId);
                      }}
                    />
                  ))}
                </ul>
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}

/** The post the auto-DM listens on, a dashed tile for any post, or a story mark. */
function Thumb({ a, post }: { a: AutomationView; post?: PostOption }) {
  const box = "h-16 w-12 shrink-0 rounded-lg sm:h-[88px] sm:w-16";
  if (a.platformPostId && post?.picture) return <img src={post.picture} alt="" loading="lazy" referrerPolicy="no-referrer" className={`${box} object-cover`} />;
  if (a.platformPostId)
    return (
      <span aria-hidden className={`${box} flex items-center justify-center bg-primary/10 text-primary/70`}>
        <ImageIcon className="h-5 w-5" />
      </span>
    );
  return (
    <span aria-hidden className={`${box} flex items-center justify-center border-[1.5px] border-dashed border-muted-foreground/50 text-muted-foreground`}>
      {a.trigger === "comment" ? <LayoutGrid className="h-[22px] w-[22px]" /> : <MessageCircle className="h-[22px] w-[22px]" />}
    </span>
  );
}

/** Two lines about where it listens: the post's caption, or what "any" covers. */
function caption(a: AutomationView, post?: PostOption) {
  if (a.trigger === "story_reply") return "Any story on this account.";
  if (a.trigger === "story_mention") return "Anyone who mentions you in their story.";
  if (!a.platformPostId) return "Every post on this account without its own auto-DM.";
  return post?.caption || a.postTitle || "One of your posts.";
}

function Row({
  a,
  account,
  post,
  profileId,
  busy,
  onToggle,
  onEdit,
}: {
  a: AutomationView;
  /** Named on the card only when there is more than one account. */
  account?: AccountOption;
  post?: PostOption;
  profileId: string;
  busy: string;
  onToggle: () => void;
  onEdit: () => void;
}) {
  const [open, setOpen] = useState(false);
  const dm = hasDm(a.platform);
  // Instagram sends no delivery receipt, so Delivered shows on Facebook only
  const stats: [string, number][] = dm
    ? [["Sent", a.stats.sent], ...(a.platform === "facebook" ? [["Delivered", a.stats.delivered] as [string, number]] : []), ["Read", a.stats.read], ["Link taps", a.stats.clicked]]
    : [["Replied to", a.stats.triggered]];
  return (
    <li className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-xl border border-border bg-card px-4 py-4 sm:px-5 sm:py-[18px]">
      <div className={`flex min-w-0 flex-[1_1_320px] items-center gap-4 transition-opacity ${a.active ? "" : "opacity-60"}`}>
        <Thumb a={a} post={post} />
        <div className="min-w-0 space-y-2">
          <p className="flex flex-wrap items-center gap-x-1.5 text-[13px] text-muted-foreground">
            <span className="font-semibold text-foreground/85">{listensTo(a)}</span>
            {a.alsoMatchInDms && <span>and DMs with the word</span>}
            {account && (
              <span>
                , {accountLabel(account)} on {platformName(a.platform)}
              </span>
            )}
          </p>
          <p className="line-clamp-2 text-sm leading-snug [overflow-wrap:anywhere]">{caption(a, post)}</p>
          <p className="flex flex-wrap gap-1.5">
            {a.keywords.length ? (
              a.keywords.map((k) => (
                <span key={k} className="rounded-md bg-primary/10 px-2 py-1 text-xs font-bold tracking-wide text-primary [overflow-wrap:anywhere]">
                  {k}
                </span>
              ))
            ) : (
              <span className="text-xs font-semibold text-muted-foreground first-letter:uppercase">{autoDmName(a)}</span>
            )}
          </p>
        </div>
      </div>
      <dl className="flex flex-wrap gap-x-6 gap-y-2">
        {stats.map(([label, n]) => (
          <div key={label} className="flex flex-col gap-0.5">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="text-lg font-semibold tabular-nums">{n}</dd>
          </div>
        ))}
        {dm && a.stats.failed > 0 && (
          <div className="flex flex-col gap-0.5 text-destructive">
            <dt className="text-xs">Failed</dt>
            <dd className="text-lg font-semibold tabular-nums">{a.stats.failed}</dd>
          </div>
        )}
      </dl>
      <Switch on={a.active} label={`Auto-DM for ${autoDmName(a)}`} busy={busy === `t${a.id}`} onChange={onToggle} />
      <div className="flex gap-2">
        <Button variant="outline" className="h-11 px-3.5" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          Who got it
        </Button>
        <Button variant="ghost" className="h-11 px-3.5 text-primary hover:text-primary" aria-label={`Edit the auto-DM for ${autoDmName(a)}`} onClick={onEdit} disabled={!!busy}>
          Edit
        </Button>
      </div>
      {open && (
        <div className="basis-full">
          <Log profileId={profileId} a={a} />
        </div>
      )}
    </li>
  );
}

function Log({ profileId, a }: { profileId: string; a: AutomationView }) {
  const [rows, setRows] = useState<LogView[] | null>(null);
  const [more, setMore] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const page = async (skip: number) => {
    setLoading(true);
    setError("");
    try {
      const r = await autoDmLogs(profileId, a.id, skip);
      setRows((old) => [...(skip ? old ?? [] : []), ...r.logs]);
      setMore(r.hasMore);
    } catch (e) {
      setError(message(e));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void page(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="space-y-2 rounded-lg border border-border/60 bg-muted/20 p-2.5" aria-live="polite">
      {rows === null && loading && <p className="text-xs text-muted-foreground">Loading who got it...</p>}
      {rows?.length === 0 && <p className="text-xs text-muted-foreground">No one yet.</p>}
      {rows && rows.length > 0 && (
        <ul className="divide-y divide-border/60">
          {rows.map((l) => {
            const line = logLine(l, a.platform);
            return (
              <li key={l.id} className="py-1.5 text-xs">
                <p className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-semibold">{l.who}</span>
                  {l.at && <span className="text-muted-foreground">{new Date(l.at).toLocaleString("en-SG", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</span>}
                  <span className={`ml-auto font-semibold ${line.ok ? "text-success" : "text-destructive"}`}>{line.text}</span>
                </p>
                {l.said && <p className="mt-0.5 text-muted-foreground [overflow-wrap:anywhere]">"{l.said}"</p>}
              </li>
            );
          })}
        </ul>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
      {(more || error) && (
        <Button variant="outline" size="sm" className="h-11 text-xs sm:h-9" disabled={loading} onClick={() => page(rows?.length ?? 0)}>
          {loading ? "Loading..." : error ? "Try again" : "Show more"}
        </Button>
      )}
    </div>
  );
}

function Editor({
  start,
  profileId,
  accounts,
  posts,
  loadPosts,
  broughtKeyword,
  draftKey,
  onCancel,
  onSaved,
  deleting,
  onDelete,
}: {
  start: AutoDmForm;
  profileId: string;
  accounts: AccountOption[];
  posts: Record<string, PostOption[]>;
  loadPosts: (accountId: string) => Promise<boolean>;
  broughtKeyword: string;
  draftKey: string;
  onCancel: () => void;
  onSaved: (wasNew: boolean) => void;
  deleting: boolean;
  /** Only for one that is saved already. */
  onDelete?: () => void;
}) {
  const { toast } = useToast();
  const [f, setF] = useState<AutoDmForm>(start);
  const [saving, setSaving] = useState(false);
  const [postsState, setPostsState] = useState<"idle" | "loading" | "failed">("idle");
  const dmBox = useRef<HTMLTextAreaElement>(null);
  const account = accounts.find((a) => a.id === f.accountId);
  const platform = account?.platform ?? "";
  const dm = hasDm(platform);
  const story = f.trigger !== "comment";
  const list = posts[f.accountId];
  const problem = formProblem(f, platform);
  const flags = formFlags(f, platform);
  const blocked = hasComplianceErrors(flags);
  const set = (patch: Partial<AutoDmForm>) => setF((x) => ({ ...x, ...patch }));
  useEffect(() => {
    if (!draftKey) return;
    try {
      sessionStorage.setItem(draftKey, JSON.stringify(f));
    } catch {
      // storage blocked: the form just won't survive a page change
    }
  }, [draftKey, f]);

  const fetchPosts = async (id: string) => {
    if (!id || posts[id]) return;
    setPostsState("loading");
    setPostsState((await loadPosts(id)) ? "idle" : "failed");
  };
  useEffect(() => {
    void fetchPosts(f.accountId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.accountId]);

  const insertName = () => {
    const box = dmBox.current;
    const at = box?.selectionStart ?? f.dm.length;
    const next = `${f.dm.slice(0, at)}{{first_name}}${f.dm.slice(box?.selectionEnd ?? at)}`;
    set({ dm: next });
    requestAnimationFrame(() => {
      box?.focus();
      box?.setSelectionRange(at + 14, at + 14);
    });
  };

  const save = async () => {
    if (problem || blocked) return;
    setSaving(true);
    try {
      await saveAutoDm(profileId, f, platform);
      onSaved(!f.id);
    } catch (e) {
      toast({ title: message(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const list3 = (key: "dmVariations" | "replyVariations", max: number, label: string, placeholder: string) => (
    <div className="space-y-1.5">
      {f[key].map((v, i) => (
        <div key={i} className="flex items-start gap-1">
          <Textarea aria-label={`${label} ${i + 2}`} rows={2} value={v} placeholder={placeholder} onChange={(e) => set({ [key]: f[key].map((x, j) => (j === i ? e.target.value : x)) } as Partial<AutoDmForm>)} className="text-sm" />
          <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0" aria-label={`Remove ${label.toLowerCase()} ${i + 2}`} onClick={() => set({ [key]: f[key].filter((_, j) => j !== i) } as Partial<AutoDmForm>)}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      ))}
      {f[key].length < max && (
        <Button variant="ghost" size="sm" className="h-11 gap-1.5 px-2 text-xs sm:h-9" onClick={() => set({ [key]: [...f[key], ""] } as Partial<AutoDmForm>)}>
          <Plus className="h-3.5 w-3.5" /> Another wording
        </Button>
      )}
    </div>
  );

  return (
    <section aria-label={f.id ? "Edit auto-DM" : "New auto-DM"} className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
      <div className="min-w-0 space-y-5">
        <h2 className="font-serif text-lg font-semibold">{f.id ? "Edit auto-DM" : "New auto-DM"}</h2>

        {!f.id && (
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Start from</p>
            <div className="flex flex-wrap gap-1.5">
              {STARTERS.map((s) => (
                <button key={s.id} type="button" className={chip(false)} onClick={() => setF((x) => applyStarter(x, s, platform, broughtKeyword))}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="adm-account">Account</Label>
          <Select
            value={f.accountId}
            disabled={!!f.id}
            onValueChange={(id) => {
              const next = accounts.find((a) => a.id === id);
              set({ accountId: id, platformPostId: null, ...(next?.platform !== "instagram" ? { trigger: "comment" as Trigger, followGate: false } : {}) });
            }}
          >
            <SelectTrigger id="adm-account" className="h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {accounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {accountLabel(a)} on {platformName(a.platform)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!dm && platform && <p className="text-xs text-muted-foreground">{platformName(platform)} can only answer with a public reply.</p>}
        </div>

        {platform === "instagram" && (
          <div role="group" aria-label="Answer" className="flex flex-wrap gap-1.5">
            {(
              [
                ["comment", "Comments"],
                ["story_reply", "Story replies"],
                ["story_mention", "Story mentions"],
              ] as const
            ).map(([t, label]) => (
              <button key={t} type="button" aria-pressed={f.trigger === t} className={chip(f.trigger === t)} onClick={() => set({ trigger: t, ...(t !== "comment" ? { platformPostId: null } : {}) })}>
                {label}
              </button>
            ))}
          </div>
        )}

        {!story && (
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Post</p>
            <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-8">
              <button
                type="button"
                aria-pressed={!f.platformPostId}
                onClick={() => set({ platformPostId: null })}
                className={`flex aspect-square min-h-11 items-center justify-center rounded-md border p-1 text-center text-xs font-semibold ${!f.platformPostId ? "border-primary bg-primary/10 text-primary" : "border-border/60 text-muted-foreground"}`}
              >
                Any post
              </button>
              {(list ?? []).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={f.platformPostId === p.id}
                  aria-label={p.caption ? p.caption.slice(0, 80) : "A post"}
                  title={p.caption.slice(0, 120)}
                  onClick={() => set({ platformPostId: p.id })}
                  className={`relative aspect-square min-h-11 overflow-hidden rounded-md border text-left ${f.platformPostId === p.id ? "border-primary ring-2 ring-primary" : "border-border/60"}`}
                >
                  {p.picture ? (
                    <img src={p.picture} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
                  ) : (
                    <span className="line-clamp-4 p-1 text-[10px] leading-tight text-muted-foreground">{p.caption || "A post"}</span>
                  )}
                </button>
              ))}
            </div>
            {postsState === "loading" && <p className="text-xs text-muted-foreground">Loading your latest posts...</p>}
            {postsState === "failed" && (
              <p className="text-xs text-muted-foreground">
                Couldn't load your posts, so Any post is the choice for now.{" "}
                <button type="button" className="-my-2 py-2 font-semibold text-primary hover:underline" onClick={() => void fetchPosts(f.accountId)}>
                  Try again
                </button>
              </p>
            )}
          </div>
        )}

        {f.trigger !== "story_mention" && (
          <div className="space-y-1.5">
            <Label htmlFor="adm-keywords">Keywords</Label>
            <Input
              id="adm-keywords"
              value={f.keywordsText}
              disabled={f.everyComment && !story}
              placeholder="GUIDE, INFO"
              onChange={(e) => set({ keywordsText: e.target.value })}
              className="h-11"
            />
            {!story && (
              <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm sm:min-h-9 [@media(pointer:coarse)]:min-h-11">
                <input type="checkbox" checked={f.everyComment} onChange={(e) => set({ everyComment: e.target.checked, ...(e.target.checked ? { alsoMatchInDms: false } : {}) })} className="h-4 w-4 accent-primary" />
                Every comment
              </label>
            )}
          </div>
        )}

        {dm && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="adm-dm">DM</Label>
              <Button variant="ghost" size="sm" className="h-11 px-2 text-xs sm:h-8" onClick={insertName}>
                Insert first name
              </Button>
            </div>
            <Textarea id="adm-dm" ref={dmBox} rows={4} value={f.dm} onChange={(e) => set({ dm: e.target.value })} placeholder="Hi {{first_name}}, here's the guide." className="text-sm" />
            {list3("dmVariations", LIMITS.dmVariations, "DM", "Another way to say it")}
            <div className="space-y-1.5 pt-1">
              <p className="flex items-center gap-1 text-sm font-medium">
                Link buttons
                <InfoTip label="About link buttons">Each one opens your own link. Zernio counts the clicks.</InfoTip>
              </p>
              {f.buttons.map((b, i) => (
                <div key={i} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto] gap-1">
                  <Input aria-label={`Button ${i + 1} title`} value={b.title} maxLength={LIMITS.buttonTitle} placeholder="Get the guide" onChange={(e) => set({ buttons: f.buttons.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} className="h-11" />
                  <Input aria-label={`Button ${i + 1} link`} type="url" inputMode="url" value={b.url} placeholder="https://your-link" onChange={(e) => set({ buttons: f.buttons.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)) })} className="h-11" />
                  <Button variant="ghost" size="icon" className="h-11 w-11" aria-label={`Remove button ${i + 1}`} onClick={() => set({ buttons: f.buttons.filter((_, j) => j !== i) })}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              {f.buttons.length < LIMITS.buttons && (
                <Button variant="ghost" size="sm" className="h-11 gap-1.5 px-2 text-xs sm:h-9" onClick={() => set({ buttons: [...f.buttons, { title: "", url: "" }] })}>
                  <Plus className="h-3.5 w-3.5" /> Add a link button
                </Button>
              )}
            </div>
          </div>
        )}

        {!story && (
          <div className="space-y-1.5">
            <Label htmlFor="adm-reply">Public reply{dm ? " (optional)" : ""}</Label>
            <Textarea id="adm-reply" rows={2} value={f.reply} onChange={(e) => set({ reply: e.target.value })} placeholder="Sent it to your DMs!" className="text-sm" />
            {list3("replyVariations", LIMITS.replyVariations, "Public reply", "Another way to say it")}
          </div>
        )}

        {dm && (f.trigger === "comment" || platform === "instagram") && (
          <div className="space-y-0.5">
            {f.trigger === "comment" && (
              <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm sm:min-h-9 [@media(pointer:coarse)]:min-h-11">
                <input type="checkbox" checked={f.alsoMatchInDms} disabled={f.everyComment} onChange={(e) => set({ alsoMatchInDms: e.target.checked })} className="h-4 w-4 accent-primary" />
                Also answer when they DM the word
              </label>
            )}
            {platform === "instagram" && (
              <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm sm:min-h-9 [@media(pointer:coarse)]:min-h-11">
                <input type="checkbox" checked={f.followGate} onChange={(e) => set({ followGate: e.target.checked })} className="h-4 w-4 accent-primary" />
                Only followers get the DM
                <InfoTip label="About the follower check">Anyone Instagram can't confirm gets a button to tap once they follow.</InfoTip>
              </label>
            )}
          </div>
        )}

        {flags.length > 0 && (
          <ul className="space-y-1">
            {flags.map((x) => (
              <li key={x.id} className={`rounded-md border px-2 py-1 text-[11px] ${x.severity === "error" ? "border-destructive/40 bg-destructive/10 text-destructive" : "border-warning/40 bg-warning/10"}`}>
                "{x.match}" {x.message}
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button className="h-11" disabled={saving || !!problem || blocked} onClick={save}>
            {saving ? "Saving..." : f.id ? "Save changes" : "Save and switch on"}
          </Button>
          <Button variant="ghost" className="h-11" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          {onDelete && (
            <Button variant="ghost" className="ml-auto h-11 gap-1.5 text-muted-foreground hover:text-destructive" onClick={onDelete} disabled={saving || deleting}>
              <Trash2 className="h-4 w-4" /> {deleting ? "Deleting..." : "Delete"}
            </Button>
          )}
          {(problem || blocked) && (
            <p className="basis-full text-xs text-muted-foreground" role="status">
              {problem ?? "Reword the red flag above before saving."}
            </p>
          )}
        </div>
      </div>

      <Preview f={f} platform={platform} account={account} post={list?.find((p) => p.id === f.platformPostId)} />
    </section>
  );
}

function Preview({ f, platform, account, post }: { f: AutoDmForm; platform: string; account?: AccountOption; post?: PostOption }) {
  const dm = hasDm(platform);
  const me = account ? accountLabel(account) : "@you";
  const word = splitKeywords(f.keywordsText)[0] ?? "";
  const said = f.trigger === "story_mention" ? "Mentioned you in their story" : f.everyComment && f.trigger === "comment" ? "Love this, thanks!" : word || "Your keyword";
  const bubble = "max-w-[85%] rounded-2xl px-3 py-2 text-[13px] leading-snug [overflow-wrap:anywhere] whitespace-pre-line";
  return (
    <aside aria-label="Preview" className="lg:sticky lg:top-20">
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Preview</p>
      <div className="mx-auto w-full max-w-[320px] space-y-3 rounded-[28px] border-4 border-foreground/80 bg-background p-3 shadow-card">
        {f.trigger === "comment" && (
          <div className="flex items-center gap-2 rounded-lg bg-muted/40 p-1.5">
            {post?.picture ? <img src={post.picture} alt="" referrerPolicy="no-referrer" className="h-9 w-9 rounded object-cover" /> : <span className="flex h-9 w-9 items-center justify-center rounded bg-muted"><ImageIcon className="h-4 w-4 text-muted-foreground" /></span>}
            <p className="line-clamp-2 text-[11px] text-muted-foreground">{post ? post.caption || "Your post" : "Any of your posts"}</p>
          </div>
        )}
        <div className="space-y-1.5">
          <p className="text-[12px]">
            <span className="font-semibold">sarah.tan</span> {f.trigger === "comment" ? said : <span className="text-muted-foreground">{f.trigger === "story_reply" ? `replied to your story: ${said}` : said}</span>}
          </p>
          {f.trigger === "comment" && f.reply.trim() && (
            <p className="ml-5 text-[12px]">
              <span className="font-semibold">{me.replace(/^@/, "")}</span> {fillName(f.reply.trim())}
            </p>
          )}
        </div>
        {dm && (
          <div className="space-y-1.5 border-t border-border/60 pt-2">
            <p className="text-center text-[10px] text-muted-foreground">DM from {me}</p>
            {f.followGate && <p className={`${bubble} bg-muted`}>Zernio first asks them to tap once they follow you.</p>}
            <p className={`${bubble} bg-muted`}>{f.dm.trim() ? fillName(f.dm.trim()) : "Your DM"}</p>
            {f.buttons
              .filter((b) => b.title.trim())
              .map((b, i) => (
                <p key={i} className="max-w-[85%] rounded-lg border border-border bg-background px-3 py-1.5 text-center text-[12px] font-semibold text-primary">
                  {fillName(b.title.trim())}
                </p>
              ))}
          </div>
        )}
      </div>
    </aside>
  );
}
