// Auto-DM (Recruit > Auto-DM, /recruit/auto-dm): when someone comments a keyword on the open brand's
// post, Zernio answers them with a DM (Instagram, Facebook) or a public reply (TikTok, Threads,
// LinkedIn, YouTube). List, switch on or off, see who got it, create, edit and delete.
// ?keyword=GUIDE (from Write) opens a new one with that keyword. Server: supabase/functions/social.

import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Check, Image as ImageIcon, LayoutGrid, MessageCircle, Plus, RotateCw, Trash2, X } from "lucide-react";
import SectionTabs, { RECRUIT_TABS } from "@/components/SectionTabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
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
  toInput,
  typeKeywords,
  withDraft,
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
      className="flex h-11 shrink-0 items-center gap-2 rounded-lg px-1.5 disabled:opacity-60"
    >
      <Track on={on} />
      <span className={`w-12 text-left text-[13px] ${on ? "text-foreground" : "text-muted-foreground"}`}>{on ? "On" : "Paused"}</span>
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

  const saved = (wasNew: boolean, active: boolean) => {
    forgetForm();
    setForm(null);
    setBroughtKeyword("");
    toast({ title: !wasNew ? "Auto-DM saved" : active ? "Auto-DM saved and on" : "Auto-DM saved, paused" });
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
  onSaved: (wasNew: boolean, active: boolean) => void;
  deleting: boolean;
  /** Only for one that is saved already. */
  onDelete?: () => void;
}) {
  const { toast } = useToast();
  const [f, setF] = useState<AutoDmForm>(start);
  // what is still typed in the keyword box; Save counts it as a keyword
  const [draft, setDraft] = useState("");
  const [picked, setPicked] = useState<string | null>(start.dm || start.reply ? null : "blank");
  // One post with none picked yet must not save as Any post
  const [onePost, setOnePost] = useState(!!start.platformPostId);
  const [saving, setSaving] = useState<"" | "on" | "paused">("");
  const [postsState, setPostsState] = useState<"idle" | "loading" | "failed">("idle");
  const dmBox = useRef<HTMLTextAreaElement>(null);
  const account = accounts.find((a) => a.id === f.accountId);
  const platform = account?.platform ?? "";
  const dm = hasDm(platform);
  const story = f.trigger !== "comment";
  const list = posts[f.accountId];
  const full = withDraft(f, draft);
  const problem = !story && onePost && !f.platformPostId ? "Pick the post, or choose Any post." : formProblem(full, platform);
  const flags = formFlags(full, platform);
  const blocked = hasComplianceErrors(flags);
  const checked = toInput(full, platform);
  const anyWords = [checked.dm, ...checked.dmVariations, ...checked.buttons.map((b) => b.title), checked.reply, ...checked.replyVariations].some(Boolean);
  const set = (patch: Partial<AutoDmForm>) => setF((x) => ({ ...x, ...patch }));
  useEffect(() => {
    if (!draftKey) return;
    try {
      sessionStorage.setItem(draftKey, JSON.stringify(full));
    } catch {
      // storage blocked: the form just won't survive a page change
    }
  }, [draftKey, full]);

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

  const save = async (active: boolean) => {
    if (problem || blocked) return;
    setSaving(active ? "on" : "paused");
    try {
      await saveAutoDm(profileId, full, platform, active);
      onSaved(!f.id, active);
    } catch (e) {
      toast({ title: message(e), variant: "destructive" });
    } finally {
      setSaving("");
    }
  };

  // ---- keyword box ----
  const chips = splitKeywords(f.keywordsText);
  const typeKw = (value: string) => {
    const r = typeKeywords(f.keywordsText, value);
    if (r.keywordsText !== f.keywordsText) set({ keywordsText: r.keywordsText });
    setDraft(r.draft);
  };
  const commitKw = () => {
    if (draft.trim()) set({ keywordsText: full.keywordsText });
    setDraft("");
  };
  const firstKw = splitKeywords(full.keywordsText)[0] ?? "";
  const kwOff = f.everyComment && !story;

  // ---- public reply: the reply and its other wordings as one list ----
  const replies = [f.reply, ...f.replyVariations];
  const setReplies = (r: string[]) => set({ reply: r[0] ?? "", replyVariations: r.slice(1) });

  const wordingCheck =
    flags.length > 0 ? (
      <ul className="space-y-1">
        {flags.map((x) => (
          <li key={x.id} className={`rounded-md border px-2 py-1 text-xs ${x.severity === "error" ? "border-destructive/40 bg-destructive/10 text-destructive" : "border-warning/40 bg-warning/10"}`}>
            "{x.match}" {x.message}
          </li>
        ))}
      </ul>
    ) : anyWords ? (
      <p className="flex items-center gap-2 text-[13px] text-success">
        <Check className="h-4 w-4" aria-hidden /> Wording check: nothing flagged
      </p>
    ) : null;

  const card = "space-y-3 rounded-xl border border-border bg-card px-4 py-5 sm:px-6";
  const seg = (on: boolean) => `min-h-10 rounded-[9px] px-4 text-sm font-medium transition-colors [@media(pointer:coarse)]:min-h-11 ${on ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`;
  const pill = (on: boolean) => `min-h-11 rounded-full px-4 text-sm font-medium transition-colors ${on ? "border-[1.5px] border-primary bg-primary/10 text-primary" : "border border-input bg-background text-foreground/80 hover:border-primary/40"}`;
  const linkBtn = "h-11 self-start px-1 text-sm font-medium text-primary hover:bg-transparent hover:text-primary hover:underline";
  const title = f.id ? "Edit auto-DM" : "New auto-DM";

  return (
    <section aria-labelledby="adm-editor" className="space-y-5">
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-muted-foreground">
        <button type="button" className="min-h-11 text-primary hover:underline" onClick={onCancel} disabled={!!saving}>
          Auto-DM
        </button>
        <span aria-hidden>/</span>
        <span>{title}</span>
      </nav>
      <h1 id="adm-editor" className="font-serif text-2xl font-semibold tracking-tight sm:text-[32px] sm:leading-tight">
        {title}
      </h1>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(280px,340px)] lg:items-start">
        <div className="min-w-0 space-y-4">
          {!f.id && (
            <section aria-labelledby="adm-start" className={card}>
              <h2 id="adm-start" className="text-base font-semibold">
                Start from
              </h2>
              <div className="flex flex-wrap gap-2">
                {STARTERS.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    aria-pressed={picked === s.id}
                    className={pill(picked === s.id)}
                    onClick={() => {
                      setF((x) => applyStarter(x, s, platform, broughtKeyword));
                      setDraft("");
                      setPicked(s.id);
                    }}
                  >
                    {s.label}
                  </button>
                ))}
                <button
                  type="button"
                  aria-pressed={picked === "blank"}
                  className={pill(picked === "blank")}
                  onClick={() => {
                    setF((x) => ({ ...emptyForm(x.accountId, broughtKeyword), platformPostId: x.platformPostId }));
                    setDraft("");
                    setPicked("blank");
                  }}
                >
                  Blank
                </button>
              </div>
            </section>
          )}

          <section aria-labelledby="adm-where" className={`${card} space-y-4`}>
            <h2 id="adm-where" className="text-base font-semibold">
              Where it listens
            </h2>
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
                <SelectTrigger id="adm-account" className="h-11 max-w-[360px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {platformName(a.platform)}, {accountLabel(a)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!dm && platform && <p className="text-[13px] text-muted-foreground">{platformName(platform)} can only answer with a public reply.</p>}
            </div>

            {platform === "instagram" && (
              <div className="space-y-2.5">
                <span id="adm-answers" className="text-sm font-medium">
                  Answers
                </span>
                <div role="group" aria-labelledby="adm-answers" className="flex w-fit max-w-full flex-wrap gap-1 rounded-xl bg-muted p-1">
                  {(
                    [
                      ["comment", "Comments"],
                      ["story_reply", "Story replies"],
                      ["story_mention", "Story mentions"],
                    ] as const
                  ).map(([t, label]) => (
                    <button key={t} type="button" aria-pressed={f.trigger === t} className={seg(f.trigger === t)} onClick={() => set({ trigger: t, ...(t !== "comment" ? { platformPostId: null } : {}) })}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {!story && (
              <div className="space-y-2.5">
                <span id="adm-post" className="text-sm font-medium">
                  Post
                </span>
                <div role="group" aria-labelledby="adm-post" className="flex w-fit gap-1 rounded-xl bg-muted p-1">
                  <button type="button" aria-pressed={onePost} className={seg(onePost)} onClick={() => setOnePost(true)}>
                    One post
                  </button>
                  <button
                    type="button"
                    aria-pressed={!onePost}
                    className={seg(!onePost)}
                    onClick={() => {
                      setOnePost(false);
                      set({ platformPostId: null });
                    }}
                  >
                    Any post
                  </button>
                </div>
                {onePost ? (
                  <>
                    {list && list.length > 0 && (
                      <div className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-2.5">
                        {list.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            aria-pressed={f.platformPostId === p.id}
                            aria-label={p.caption ? p.caption.slice(0, 80) : "A post"}
                            title={p.caption.slice(0, 120)}
                            onClick={() => set({ platformPostId: p.id })}
                            className={`relative aspect-[4/5] overflow-hidden rounded-[10px] border-2 bg-primary/10 text-left ${f.platformPostId === p.id ? "border-primary ring-[3px] ring-primary/25" : "border-transparent"}`}
                          >
                            {p.picture ? (
                              <img src={p.picture} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
                            ) : (
                              <span className="line-clamp-5 p-2 text-[11px] leading-tight text-foreground/80">{p.caption || "A post"}</span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                    {list && list.length === 0 && <p className="text-[13px] text-muted-foreground">No posts on this account yet, so Any post is the choice for now.</p>}
                    {postsState === "loading" && <p className="text-[13px] text-muted-foreground">Loading your latest posts...</p>}
                    {postsState === "failed" && (
                      <p className="text-[13px] text-muted-foreground">
                        Couldn't load your posts, so Any post is the choice for now.{" "}
                        <button type="button" className="-my-2 py-2 font-semibold text-primary hover:underline" onClick={() => void fetchPosts(f.accountId)}>
                          Try again
                        </button>
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-sm leading-normal text-foreground/85">Listens under every post on this account. A post with its own auto-DM uses that one instead.</p>
                )}
              </div>
            )}

            {f.trigger !== "story_mention" && (
              <div className="space-y-1.5">
                <Label htmlFor="adm-keywords">Keywords</Label>
                <div className={`flex min-h-[52px] flex-wrap items-center gap-2 rounded-md border border-input bg-background px-2 py-1 focus-within:ring-2 focus-within:ring-ring ${kwOff ? "opacity-50" : ""}`}>
                  {!kwOff &&
                    chips.map((k) => (
                      <span key={k} className="inline-flex h-8 max-w-full items-center rounded-md bg-primary/10 pl-2.5 text-[13px] font-bold tracking-wide text-primary">
                        <span className="truncate">{k}</span>
                        <button
                          type="button"
                          aria-label={`Remove ${k}`}
                          className="-my-1.5 flex h-11 w-11 shrink-0 items-center justify-center"
                          onClick={() => set({ keywordsText: chips.filter((x) => x !== k).join(", ") })}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    ))}
                  <input
                    id="adm-keywords"
                    value={draft}
                    disabled={kwOff}
                    placeholder={kwOff ? "Every comment gets it" : chips.length ? "Add another" : "Add a keyword"}
                    onChange={(e) => typeKw(e.target.value)}
                    onBlur={commitKw}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        commitKw();
                      } else if (e.key === "Backspace" && !draft && chips.length) {
                        set({ keywordsText: chips.slice(0, -1).join(", ") });
                      }
                    }}
                    className="min-h-10 min-w-0 flex-[1_1_140px] bg-transparent text-[15px] outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
                  />
                </div>
                {!kwOff && (
                  <p className="text-[13px] text-muted-foreground">
                    {firstKw ? `Whole words only: ${firstKw} will not fire on ${firstKw}${/[a-z]$/.test(firstKw) ? "s" : "S"}.` : `Up to ${LIMITS.keywords} keywords, whole words only.`}
                  </p>
                )}
                {!story && (
                  <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm sm:min-h-9 [@media(pointer:coarse)]:min-h-11">
                    <input
                      type="checkbox"
                      checked={f.everyComment}
                      onChange={(e) => {
                        set({ everyComment: e.target.checked, ...(e.target.checked ? { alsoMatchInDms: false } : {}) });
                        if (e.target.checked) setDraft("");
                      }}
                      className="h-4 w-4 accent-primary"
                    />
                    Every comment
                  </label>
                )}
              </div>
            )}
          </section>

          {dm && (
            <section aria-labelledby="adm-dm-h" className={card}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 id="adm-dm-h" className="text-base font-semibold">
                  <label htmlFor="adm-dm">The DM</label>
                </h2>
                <Button variant="outline" className="h-11 px-3" onClick={insertName}>
                  Insert first name
                </Button>
              </div>
              <Textarea id="adm-dm" ref={dmBox} rows={4} value={f.dm} onChange={(e) => set({ dm: e.target.value })} placeholder="Write the message they get" className="text-[15px] leading-normal" />
              {f.dmVariations.map((v, i) => (
                <div key={i} className="flex items-start gap-2">
                  <Textarea aria-label={`DM ${i + 2}`} rows={2} value={v} placeholder="Another way to say it" onChange={(e) => set({ dmVariations: f.dmVariations.map((x, j) => (j === i ? e.target.value : x)) })} className="text-sm" />
                  <Button variant="outline" size="icon" className="h-11 w-11 shrink-0" aria-label={`Remove DM ${i + 2}`} onClick={() => set({ dmVariations: f.dmVariations.filter((_, j) => j !== i) })}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              {f.dmVariations.length < LIMITS.dmVariations && (
                <Button variant="ghost" className={linkBtn} onClick={() => set({ dmVariations: [...f.dmVariations, ""] })}>
                  Add another wording of the DM
                </Button>
              )}
              {wordingCheck}
              <div className="space-y-2 pt-1">
                <p className="text-sm font-semibold">Link buttons</p>
                {f.buttons.map((b, i) => (
                  <div key={i} className="flex flex-wrap items-end gap-2">
                    <label className="flex min-w-0 flex-[1_1_160px] flex-col gap-1.5 text-[13px] text-muted-foreground">
                      Button text
                      <Input value={b.title} maxLength={LIMITS.buttonTitle} placeholder="Get the guide" onChange={(e) => set({ buttons: f.buttons.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} className="h-11 text-[15px] text-foreground" />
                    </label>
                    <label className="flex min-w-0 flex-[2_1_220px] flex-col gap-1.5 text-[13px] text-muted-foreground">
                      Link
                      <Input type="url" inputMode="url" value={b.url} placeholder="https://your-link" onChange={(e) => set({ buttons: f.buttons.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)) })} className="h-11 text-[15px] text-foreground" />
                    </label>
                    <Button variant="outline" size="icon" className="h-11 w-11 shrink-0" aria-label={`Remove button ${i + 1}`} onClick={() => set({ buttons: f.buttons.filter((_, j) => j !== i) })}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                {f.buttons.length < LIMITS.buttons && (
                  <Button variant="ghost" className={linkBtn} onClick={() => set({ buttons: [...f.buttons, { title: "", url: "" }] })}>
                    Add a button (up to {LIMITS.buttons})
                  </Button>
                )}
              </div>
            </section>
          )}

          {!story && (
            <section aria-labelledby="adm-reply-h" className={card}>
              <h2 id="adm-reply-h" className="text-base font-semibold">
                Public reply under their comment
              </h2>
              {replies.length > 1 && <p className="text-[13px] text-muted-foreground">One of these is picked at random each time.</p>}
              {replies.map((r, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    aria-label={`Public reply ${i + 1}`}
                    value={r}
                    placeholder={i ? "Another way to say it" : "Sent! Check your DMs"}
                    onChange={(e) => setReplies(replies.map((x, j) => (j === i ? e.target.value : x)))}
                    className="h-11 text-[15px]"
                  />
                  {replies.length > 1 && (
                    <Button variant="outline" size="icon" className="h-11 w-11 shrink-0" aria-label={`Remove public reply ${i + 1}`} onClick={() => setReplies(replies.filter((_, j) => j !== i))}>
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
              {f.replyVariations.length < LIMITS.replyVariations && (
                <Button variant="ghost" className={linkBtn} onClick={() => setReplies([...replies, ""])}>
                  Add another wording (up to {LIMITS.replyVariations + 1})
                </Button>
              )}
              {!dm && wordingCheck}
            </section>
          )}

          {dm && (f.trigger === "comment" || platform === "instagram") && (
            <section aria-labelledby="adm-opt" className="rounded-xl border border-border bg-card px-4 py-2 sm:px-6">
              <h2 id="adm-opt" className="mb-1 mt-3 text-base font-semibold">
                Options
              </h2>
              {f.trigger === "comment" && (
                <div className="flex items-center justify-between gap-4 border-b border-border/60 py-2.5 last:border-0">
                  <span id="adm-opt-dm" className={`text-[15px] font-medium ${f.everyComment ? "text-muted-foreground" : ""}`}>
                    Also answer when they DM the word
                  </span>
                  <Toggle on={f.alsoMatchInDms} labelledBy="adm-opt-dm" disabled={f.everyComment} onChange={(on) => set({ alsoMatchInDms: on })} />
                </div>
              )}
              {platform === "instagram" && (
                <div className="flex items-center justify-between gap-4 py-2.5 pb-3.5">
                  <div className="min-w-0 space-y-1">
                    <span id="adm-opt-follow" className="block text-[15px] font-medium">
                      Only followers get the DM
                    </span>
                    <span className="block text-[13px] leading-snug text-muted-foreground">Instagram only. Anyone Instagram can't confirm gets a button to tap once they follow.</span>
                  </div>
                  <Toggle on={f.followGate} labelledBy="adm-opt-follow" onChange={(on) => set({ followGate: on })} />
                </div>
              )}
            </section>
          )}

          {story && !dm ? null : story && wordingCheck}

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Button className="h-12 px-[22px] text-[15px] font-semibold" disabled={!!saving || !!problem || blocked} onClick={() => save(true)}>
              {saving === "on" ? "Saving..." : f.id ? "Save changes" : "Save and switch on"}
            </Button>
            {!f.id && (
              <Button variant="outline" className="h-12 px-[18px] text-[15px]" disabled={!!saving || !!problem || blocked} onClick={() => save(false)}>
                {saving === "paused" ? "Saving..." : "Save as paused"}
              </Button>
            )}
            <Button variant="ghost" className="h-12 px-2 text-[15px] text-primary hover:bg-transparent hover:text-primary hover:underline" onClick={onCancel} disabled={!!saving}>
              Cancel
            </Button>
            {onDelete && (
              <Button variant="ghost" className="ml-auto h-12 gap-1.5 text-muted-foreground hover:text-destructive" onClick={onDelete} disabled={!!saving || deleting}>
                <Trash2 className="h-4 w-4" /> {deleting ? "Deleting..." : "Delete"}
              </Button>
            )}
            {(problem || blocked) && (
              <p className="basis-full text-[13px] text-muted-foreground" role="status">
                {problem ?? "Reword the red flag above before saving."}
              </p>
            )}
          </div>
        </div>

        <Preview f={full} platform={platform} account={account} post={list?.find((p) => p.id === f.platformPostId)} />
      </div>
    </section>
  );
}

/** A plain on/off switch for a labelled option. */
function Toggle({ on, labelledBy, disabled, onChange }: { on: boolean; labelledBy: string; disabled?: boolean; onChange: (on: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-labelledby={labelledBy} disabled={disabled} onClick={() => onChange(!on)} className="flex h-11 w-14 shrink-0 items-center justify-center disabled:opacity-50">
      <Track on={on} />
    </button>
  );
}

function Track({ on }: { on: boolean }) {
  return (
    <span aria-hidden className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors ${on ? "bg-primary" : "bg-muted-foreground/60"}`}>
      <span className={`absolute top-[3px] h-[18px] w-[18px] rounded-full bg-background shadow transition-transform ${on ? "translate-x-[23px]" : "translate-x-[3px]"}`} />
    </span>
  );
}

const initials = (name: string) =>
  name
    .replace(/^@/, "")
    .split(/[._\s-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("") || "?";

function Preview({ f, platform, account, post }: { f: AutoDmForm; platform: string; account?: AccountOption; post?: PostOption }) {
  const dm = hasDm(platform);
  const me = account ? accountLabel(account) : "@you";
  const handle = me.replace(/^@/, "");
  const word = splitKeywords(f.keywordsText)[0] ?? "";
  const said = f.everyComment && f.trigger === "comment" ? "Love this, thanks!" : word || "[keyword]";
  const reply = f.reply.trim();
  const buttons = f.buttons.filter((b) => b.title.trim());
  const avatar = (text: string, mine: boolean) => (
    <span aria-hidden className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${mine ? "bg-primary/10 text-primary" : "bg-muted text-foreground/80"}`}>
      {text}
    </span>
  );
  const bubble = "max-w-[88%] self-start overflow-hidden rounded-[18px] rounded-bl-md bg-muted";
  return (
    <aside aria-label="Preview" className="min-w-0 space-y-2.5 lg:sticky lg:top-6">
      <p className="text-sm font-semibold text-foreground/85">Preview</p>
      <div className="mx-auto flex w-full max-w-[380px] flex-col gap-3.5 rounded-[28px] border border-input bg-card p-[18px] shadow-card">
        <div className="flex items-center gap-2">
          <span aria-hidden className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
            {initials(account?.name || handle)}
          </span>
          <span className="truncate text-[13px] font-semibold">{handle}</span>
        </div>
        {f.trigger === "comment" ? (
          <div aria-hidden className="relative flex h-[150px] items-end overflow-hidden rounded-xl bg-primary/10 p-2.5">
            {post?.picture && <img src={post.picture} alt="" referrerPolicy="no-referrer" className="absolute inset-0 h-full w-full object-cover" />}
            <span className="relative max-w-full truncate rounded bg-background px-1.5 py-0.5 text-xs font-semibold">{post ? post.caption || "Your post" : f.platformPostId ? "Your post" : "Any post"}</span>
          </div>
        ) : (
          <div aria-hidden className="flex h-[150px] items-end rounded-xl bg-primary/10 p-2.5">
            <span className="rounded bg-background px-1.5 py-0.5 text-xs font-semibold">{f.trigger === "story_reply" ? "Your story" : "Their story"}</span>
          </div>
        )}
        <div className="flex flex-col gap-2.5 text-[13px] leading-snug">
          <p className="flex items-start gap-2 [overflow-wrap:anywhere]">
            {avatar("ST", false)}
            <span>
              <strong>sarah.tan</strong> {f.trigger === "story_mention" ? <span className="text-muted-foreground">mentioned you in their story</span> : f.trigger === "story_reply" ? <span className="text-muted-foreground">replied to your story: {said}</span> : said}
            </span>
          </p>
          {f.trigger === "comment" && reply && (
            <p className="flex items-start gap-2 pl-8 [overflow-wrap:anywhere]">
              {avatar(initials(account?.name || handle), true)}
              <span>
                <strong>{handle}</strong> {fillName(reply)}
              </span>
            </p>
          )}
        </div>
        {dm && (
          <>
            <div className="flex items-center gap-2.5 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" />
              In Sarah's DMs
              <span className="h-px flex-1 bg-border" />
            </div>
            {f.followGate && (
              <div className={bubble}>
                <p className="px-3.5 py-2.5 text-[13px] leading-normal">Follow {me}, then tap below and it is yours.</p>
                <p className="border-t border-border px-3.5 py-2 text-center text-[13px] font-semibold text-primary">I'm following</p>
              </div>
            )}
            <div className={bubble}>
              <p className="whitespace-pre-line px-3.5 py-2.5 text-[13px] leading-normal [overflow-wrap:anywhere]">{f.dm.trim() ? fillName(f.dm.trim()) : "[Your DM]"}</p>
              {buttons.map((b, i) => (
                <p key={i} className="border-t border-border px-3.5 py-2 text-center text-[13px] font-semibold text-primary [overflow-wrap:anywhere]">
                  {fillName(b.title.trim())}
                </p>
              ))}
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
