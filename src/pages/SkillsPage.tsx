// Skills (/skills, Leo's sign-ins only; docs/north-star/items/agent-skills.md): the four ready-made skills, your own
// slash skills and the last 30 results, all from src/lib/chatSkills.ts, whose runs go on outside React. ?run=<id> opens a
// result and marks it seen (push); ?skill=<id> opens the post chooser for a skill that needs a post (push), and with
// &post=<id> runs a free skill on that post and becomes ?run=<new id> (replace), while a priced one waits for its button;
// ?edit=<slash> and ?new=1 open the form (push). "Run every week" waits for scheduled skills (phase 6 Q4). Everyone
// else gets the 404 page.

import { useEffect, useReducer, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { MoreHorizontal, X } from "lucide-react";
import CopyLinkButton from "@/components/CopyLinkButton";
import PriceChip from "@/components/PriceChip";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { ToastAction } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";
import { seedThread } from "@/lib/agentThreads";
import { useUsesLeft } from "@/lib/aiUsage";
import {
  BUILT_IN_SKILLS, FULL_LINE, INSTRUCTION_CHARS, MAX_SKILLS, NAME_CHARS, PICK_LINE, PRICED, QUOTING, answerShown, isRunning, loadMySkills, loadSkillRuns, markSeen,
  onSkillsChanged, postChoices, postTitle, removeMySkill, restoreMySkill, runSkill, saveMySkill, skillRunText, slashOf, type MySkill, type SkillRun,
} from "@/lib/chatSkills";
import { keyToDate, timeLabel } from "@/lib/dueDates";
import { links } from "@/lib/links";
import { WRITE_PRICE, reasonText } from "@/lib/prices";
import { scoped } from "@/lib/profiles";
import { useLeoUser } from "@/lib/useLeoOnly";
import { useGoneItem, useScrollToItem, useUrlItem, useUrlUpdate } from "@/lib/urlState";
import NotFoundPage from "@/pages/NotFoundPage";

const TOUCH = "[@media(pointer:coarse)]:min-h-11";
const CARD = "rounded-xl border border-border/60 p-4 shadow-card";
const HEAD = "text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground";
/** Runs that need no press: free and with nothing to pick (decision 3: a priced run waits for its button). */
const AUTO = ["check", "retro", "check-week"];

export default function SkillsPage() {
  const leo = useLeoUser();
  if (leo === undefined) return <div className="min-h-[40vh]" aria-busy="true" />;
  if (!leo) return <NotFoundPage notOnAccount />;
  return <Skills userId={leo.id} />;
}

/** "Sun 19 Oct, 8:40pm". */
function whenOf(at: string): string {
  const d = new Date(at);
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return `${d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }).replace(",", "")}, ${timeLabel(hm)}`;
}

function Skills({ userId }: { userId: string }) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const update = useUrlUpdate();
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  useEffect(() => onSkillsChanged(redraw), []);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => void (alive.current = false);
  }, []);

  const mine = loadMySkills(userId);
  const runs = loadSkillRuns(userId);
  const busy = BUILT_IN_SKILLS.some((b) => isRunning(b.id));
  const left = useUsesLeft(busy);
  const [failed, setFailed] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState("");

  const [run] = useUrlItem("run");
  const [skill] = useUrlItem("skill");
  const [post] = useUrlItem("post");
  const [edit] = useUrlItem("edit");
  const [isNew] = useUrlItem("new");
  useGoneItem("run", run ? runs.some((r) => r.id === run) : undefined, "result");
  const own = mine.find((s) => s.slash === skill);
  useGoneItem("skill", skill ? !!own || BUILT_IN_SKILLS.some((b) => b.id === skill) : undefined, "skill");
  useGoneItem("edit", edit ? mine.some((s) => s.slash === edit) : undefined, "skill");
  useEffect(() => {
    if (run) markSeen(userId, run);
  }, [run, userId]);

  /** Runs one skill; a result opens (replace), a skill of yours opens Write, a missing post opens the chooser. */
  const start = async (id: string, postId?: string) => {
    setFailed(({ [id]: _, ...rest }) => rest);
    const r = await runSkill(userId, id, { postId });
    if (!alive.current) return;
    if (r.step === "open") return navigate(r.links[0].path);
    if (r.step === "pick-post") return update({ skill: id, post: null });
    if (r.failed) return setFailed((f) => ({ ...f, [id]: r.failed! }));
    if (r.id) update({ skill: null, post: null, run: r.id });
  };

  // a link runs a free skill on its own (once per address); a priced one waits for its button
  const started = useRef("");
  useEffect(() => {
    const key = `${skill}:${post}`;
    if (!skill || started.current === key || !AUTO.includes(skill) || (skill === "check" && !post)) return;
    started.current = key;
    void start(skill, post ?? undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skill, post]);

  const needsPost = skill === "check" || own?.works === "post";
  const chooser = needsPost && !isRunning(skill!) && (!post || skill !== "check") ? skill : null;

  const formFor = isNew === "1" ? "new" : mine.find((s) => s.slash === edit) ?? null;

  return (
    <div className="space-y-8">
      <h1 className="font-serif text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">Skills</h1>

      <section className="space-y-3" aria-labelledby="ready-made">
        <h2 id="ready-made" className={HEAD}>Ready-made</h2>
        <ul className="grid gap-3 lg:grid-cols-2">
          {BUILT_IN_SKILLS.filter((b) => b.id !== "answer" || answerShown(userId)).map((b) => {
            const n = b.id === "check" ? minLeft(left("fact-check"), left("writing-judge"), left("post-score")) : b.id === "retro" ? left("week-pick") : b.id === "answer" ? left("skill-answer") : null;
            const waiting = skill === b.id && PRICED.includes(b.id);
            return (
              <li key={b.id} className={`${CARD} flex flex-col gap-2 ${waiting ? "border-primary ring-2 ring-primary/30" : ""}`}>
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-semibold">{b.name}</span>
                  <code className="text-xs text-muted-foreground">/{b.slash}</code>
                </div>
                <p className="text-sm text-muted-foreground">{b.description}</p>
                <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-1">
                  <Button size="sm" variant="outline" className={`h-10 ${TOUCH}`} disabled={isRunning(b.id) || n === 0}
                    onClick={() => (b.id === "check" ? update({ skill: "check", post: null }, { push: true }) : void start(b.id))}>
                    {isRunning(b.id) ? "Running..." : "Run"}
                  </Button>
                  {b.id === "answer" ? (
                    <PriceChip feature="skill-answer" left={n} />
                  ) : (
                    n !== null && <span className={`text-[11px] ${n === 0 ? "font-medium text-destructive" : "text-muted-foreground"}`}>{n ? `${n} left today` : "None left today"}</span>
                  )}
                </div>
                {b.id === "answer" && reasonText({ left: n, leo: true }) && <p className="text-xs text-destructive">{reasonText({ left: n, leo: true })}</p>}
                {failed[b.id] && <p className="text-sm text-destructive" role="alert">{failed[b.id]}</p>}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="space-y-3" aria-labelledby="my-skills">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="flex items-center gap-1">
            <h2 id="my-skills" className={HEAD}>My skills</h2>
            <InfoTip label="About my skills">A saved instruction you run on a post with one slash.</InfoTip>
          </div>
          <Button variant="outline" size="sm" className={`ml-auto h-10 ${TOUCH}`} disabled={mine.length >= MAX_SKILLS || formFor === "new"}
            onClick={() => (setSaved(""), update({ new: "1", edit: null }, { push: true }))}>
            New skill
          </Button>
        </div>
        {mine.length >= MAX_SKILLS && <p className="text-xs text-muted-foreground">{FULL_LINE}</p>}
        {saved && <p className="text-sm text-success" aria-live="polite">{saved}</p>}
        {formFor && (
          <SkillForm key={formFor === "new" ? "new" : formFor.id} userId={userId} skill={formFor === "new" ? null : formFor}
            onClose={() => update({ new: null, edit: null })}
            onSaved={(slash) => {
              setSaved(`Saved. Type /${slash} in the agent chat to use it.`);
              update({ new: null, edit: null });
            }} />
        )}
        {mine.length > 0 && (
          <ul className="divide-y divide-border/60 rounded-xl border border-border/60">
            {mine.map((s) => (
              <MySkillRow key={s.id} s={s}
                onTry={() => (s.works === "post" ? update({ skill: s.slash, post: null }, { push: true }) : void start(s.slash))}
                onEdit={() => (setSaved(""), update({ edit: s.slash, new: null }, { push: true }))}
                onDelete={() => {
                  const gone = removeMySkill(userId, s.id);
                  if (!gone) return toast({ title: "Couldn't delete that. Try again.", variant: "destructive" });
                  toast({
                    title: `Deleted /${gone.slash}.`,
                    action: (
                      <ToastAction altText="Undo" onClick={() => {
                        const error = restoreMySkill(userId, gone);
                        if (error) toast({ title: error, variant: "destructive" });
                      }}>
                        Undo
                      </ToastAction>
                    ),
                  });
                }} />
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3" aria-labelledby="results">
        <h2 id="results" className={HEAD}>Results</h2>
        {runs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing run yet. Type / in the agent chat, or press Run above.</p>
        ) : (
          <ul className="space-y-2">
            {runs.map((r) => (
              <Result key={r.id} r={r} open={r.id === run}
                onAsk={() => {
                  const t = seedThread(userId, `${r.name}${r.title ? ` on "${r.title}"` : ""}`, skillRunText(r), r.links, undefined, QUOTING.includes(r.skill));
                  if (t.ok === false) return toast({ title: t.error, variant: "destructive" });
                  navigate(links.agent({ thread: t.item.id }));
                }} />
            ))}
          </ul>
        )}
      </section>

      {chooser && <Chooser userId={userId} skill={chooser} own={own ?? null} post={post} onPick={(id) => void start(chooser, id)} onClose={() => update({ skill: null, post: null })} />}
    </div>
  );
}

/** The lowest of several caps' uses left; null until all are read. */
function minLeft(...ns: (number | null)[]): number | null {
  return ns.some((n) => n === null) ? null : Math.min(...(ns as number[]));
}

function MySkillRow({ s, onTry, onEdit, onDelete }: { s: MySkill; onTry: () => void; onEdit: () => void; onDelete: () => void }) {
  const [menu, setMenu] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  // a tap outside closes the menu
  useEffect(() => {
    if (!menu) return;
    const down = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setMenu(false);
    document.addEventListener("pointerdown", down);
    return () => document.removeEventListener("pointerdown", down);
  }, [menu]);
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3">
      <div className="min-w-0 flex-1 basis-56">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <code className="text-sm font-semibold">/{s.slash}</code>
          <span className="break-words text-sm">{s.name}</span>
        </div>
        <p className="text-xs text-muted-foreground">{s.works === "post" ? "Works on one of my posts" : "Works on a new post"}</p>
      </div>
      <div className="flex items-center gap-2">
        {s.works === "post" && <PriceChip price={WRITE_PRICE} left={null} />}
        <Button size="sm" variant="outline" className={`h-10 ${TOUCH}`} onClick={onTry}>Try it</Button>
        <div ref={box} className="relative">
          <Button variant="ghost" size="icon" className="h-10 w-10" aria-label={`More for /${s.slash}`} aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(!menu)}>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
          {menu && (
            <div role="menu" aria-label={`More for /${s.slash}`} onKeyDown={(e) => e.key === "Escape" && setMenu(false)}
              className="absolute right-0 top-full z-30 mt-1 w-36 rounded-xl border border-border/70 bg-popover p-1 shadow-elegant">
              {[{ label: "Edit", run: onEdit }, { label: "Delete", run: onDelete }].map((it) => (
                <button key={it.label} type="button" role="menuitem" onClick={() => (setMenu(false), it.run())}
                  className="flex h-11 w-full items-center rounded-lg px-3 text-left text-sm hover:bg-accent focus:bg-accent focus:outline-none sm:h-9">
                  {it.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

type FormWork = { key: string; name: string; instruction: string; works: MySkill["works"] };

/** New skill or Edit: what is typed is kept in this tab (cs-skill-form-<scoped>) until Save skill or Cancel. */
function SkillForm({ userId, skill, onClose, onSaved }: { userId: string; skill: MySkill | null; onClose: () => void; onSaved: (slash: string) => void }) {
  const storeKey = `cs-skill-form-${scoped(userId)}`;
  const key = skill?.id ?? "new";
  const [f, setF] = useState<FormWork>(() => {
    try {
      const kept = JSON.parse(sessionStorage.getItem(storeKey) ?? "null") as FormWork | null;
      if (kept?.key === key) return kept;
    } catch {
      // unreadable: start from the skill
    }
    return { key, name: skill?.name ?? "", instruction: skill?.instruction ?? "", works: skill?.works ?? "post" };
  });
  const [line, setLine] = useState("");
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => first.current?.focus(), []);
  const forget = () => {
    try {
      sessionStorage.removeItem(storeKey);
    } catch {
      // nothing kept
    }
  };
  const set = (patch: Partial<FormWork>) => {
    const next = { ...f, ...patch };
    setF(next);
    try {
      sessionStorage.setItem(storeKey, JSON.stringify(next));
    } catch {
      // full storage: what is typed stays until the page reloads
    }
  };
  const save = (e: FormEvent) => {
    e.preventDefault();
    const error = saveMySkill(userId, { id: skill?.id, name: f.name, instruction: f.instruction, works: f.works });
    if (error) return setLine(error);
    forget();
    onSaved(slashOf(f.name));
  };
  const cancel = () => {
    forget();
    onClose();
  };
  const slash = slashOf(f.name);
  return (
    <form onSubmit={save} onKeyDown={(e) => e.key === "Escape" && cancel()} className={`${CARD} space-y-4`} aria-label={skill ? `Edit /${skill.slash}` : "New skill"}>
      <div className="space-y-1.5">
        <Label htmlFor="skill-name">Name</Label>
        <Input id="skill-name" ref={first} value={f.name} maxLength={NAME_CHARS} onChange={(e) => (setLine(""), set({ name: e.target.value }))} />
        {slash && <p className="text-xs text-muted-foreground"><code>/{slash}</code></p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="skill-do">What should it do?</Label>
        <Textarea id="skill-do" rows={3} value={f.instruction} maxLength={INSTRUCTION_CHARS} placeholder="Tighten this for LinkedIn: under 150 words, one idea, end with a question."
          onChange={(e) => (setLine(""), set({ instruction: e.target.value }))} />
      </div>
      <div className="space-y-1.5">
        <Label id="skill-works">Works on</Label>
        <RadioGroup aria-labelledby="skill-works" value={f.works} onValueChange={(v) => set({ works: v === "new" ? "new" : "post" })} className="flex flex-wrap gap-x-5 gap-y-2">
          {([["post", "One of my posts"], ["new", "A new post"]] as const).map(([v, label]) => (
            <label key={v} className={`flex cursor-pointer items-center gap-2 text-sm ${TOUCH}`}>
              <RadioGroupItem value={v} />
              {label}
            </label>
          ))}
        </RadioGroup>
      </div>
      {line && <p className="text-sm text-destructive" role="alert">{line}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" className={TOUCH}>Save skill</Button>
        <Button type="button" variant="ghost" className={TOUCH} onClick={cancel}>Cancel</Button>
      </div>
    </form>
  );
}

function Result({ r, open, onAsk }: { r: SkillRun; open: boolean; onAsk: () => void }) {
  const [more, setMore] = useState(false);
  const ref = useScrollToItem<HTMLLIElement>(open);
  const lines = open || more ? r.lines : r.lines.slice(0, 3);
  return (
    <li ref={ref} className={`${CARD} space-y-2 ${open ? "border-primary ring-2 ring-primary/30" : ""}`}>
      {/* a real link to the result, so a new tab and a long-press Copy link work */}
      <Link to={links.skills({ run: r.id })} className={`flex w-full flex-wrap items-center gap-x-2 text-left ${TOUCH}`}>
        {!r.seen && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="New" />}
        <span className="font-semibold">{r.name}</span>
        <span className="text-xs text-muted-foreground">{whenOf(r.at)}{r.by === "schedule" ? " (scheduled)" : ""}</span>
      </Link>
      {r.title && <p className="text-sm font-medium">"{r.title}"</p>}
      {r.failed ? (
        <p className="text-sm text-destructive">Last run failed: {r.failed}.</p>
      ) : (
        <div className="space-y-0.5 text-sm text-muted-foreground">
          {lines.map((l, i) => <p key={i} className="break-words">{l}</p>)}
        </div>
      )}
      {r.lines.length > 3 && !open && (
        <Button size="sm" variant="ghost" className={`-ml-3 h-9 ${TOUCH}`} aria-expanded={more} onClick={() => setMore(!more)}>{more ? "Less" : "More"}</Button>
      )}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        {r.links.map((l) => (
          <Button key={l.path} asChild size="sm" variant="outline" className={`h-9 max-w-full ${TOUCH}`}>
            <Link to={l.path} className="truncate">{l.label}</Link>
          </Button>
        ))}
        <Button size="sm" variant="ghost" className={`ml-auto h-9 ${TOUCH}`} onClick={onAsk}>Ask about this</Button>
        {open && <CopyLinkButton path={links.skills({ run: r.id })} label="Copy link to this result" />}
      </div>
    </li>
  );
}

/** Which post: a sheet on phones, a dialog from sm up. A press on a row is the run (for one of yours, a priced rewrite in Write). */
function Chooser({ userId, skill, own, post, onPick, onClose }: { userId: string; skill: string; own: MySkill | null; post: string | null; onPick: (id: string) => void; onClose: () => void }) {
  const posts = postChoices(userId, new Date(), 20);
  const name = own ? `/${own.slash}` : BUILT_IN_SKILLS.find((b) => b.id === skill)?.name ?? skill;
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && close.current();
    window.addEventListener("keydown", esc);
    // focus lands on the linked post, else the first one
    (ref.current?.querySelector<HTMLElement>("[data-picked]") ?? ref.current?.querySelector<HTMLElement>("li button"))?.focus();
    return () => window.removeEventListener("keydown", esc);
  }, []);
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 sm:items-center" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="chooser-title" className="max-h-[85vh] w-full space-y-3 overflow-y-auto rounded-t-2xl bg-background p-4 shadow-elegant sm:max-w-md sm:rounded-2xl">
        <div className="flex items-center justify-between gap-2">
          <h2 id="chooser-title" className="font-serif text-lg font-semibold">{PICK_LINE}</h2>
          <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0" aria-label="Close" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {name}
          {own && <> | <PriceChip price={WRITE_PRICE} left={null} /></>}
        </p>
        {posts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No drafts to check yet. <Link to={links.generate()} className="font-medium text-primary underline">Open Write</Link></p>
        ) : (
          <ul className="space-y-1.5">
            {posts.map((d) => (
              <li key={d.id}>
                <button type="button" data-picked={d.id === post ? "" : undefined} onClick={() => onPick(d.id)}
                  className={`flex min-h-11 w-full flex-col items-start rounded-lg border px-3 py-2 text-left text-sm transition-colors hover:border-primary/40 ${d.id === post ? "border-primary ring-2 ring-primary/30" : "border-border/60"}`}>
                  <span className="line-clamp-2 font-medium">{postTitle(d)}</span>
                  <span className="text-[11px] text-muted-foreground">{d.status === "scheduled" && d.scheduledFor ? `Scheduled ${keyToDate(d.scheduledFor.slice(0, 10)).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }).replace(",", "")}` : "Draft"}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
