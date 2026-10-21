// Make it a thread (formats-text-threads, Leo only): under a finished text post in Write, the post as a Threads or
// X thread in editable boxes, split for free or written by the AI, checked like a post, copied, or sent to Threads
// through Post it for me. Opened with ?panel=thread, its network in ?network= (threads left out); the rules live in
// src/lib/threadSplit.ts and the thread is kept on the draft, so it reopens on any device.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowDown, ArrowUp, Copy, ListOrdered, Plus, Scissors, Send, Sparkles, Trash2, X } from "lucide-react";
import { ThinkingOrb } from "thinking-orbs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { InfoTip } from "@/components/ui/info-tip";
import { useToast } from "@/hooks/use-toast";
import ComplianceChips from "@/components/ComplianceChips";
import FactFlags from "@/components/FactFlags";
import HumanCheck from "@/components/HumanCheck";
import PriceChip from "@/components/PriceChip";
import { PostItForMePanel } from "@/components/PostItForMe";
import { useUsesLeft } from "@/lib/aiUsage";
import { scanCompliance } from "@/lib/compliance";
import { threadOf, type DraftEntry } from "@/lib/draftHistory";
import { cleanAiTells } from "@/lib/plainText";
import { reasonText } from "@/lib/prices";
import { socialConnectShown } from "@/lib/socialConnect";
import { useUrlItem, useUrlState, useUrlUpdate } from "@/lib/urlState";
import {
  THREAD_MAX_POSTS,
  THREAD_NETWORKS,
  isNumbered,
  keepWorking,
  loadWorking,
  numbered,
  readsAsThread,
  renumber,
  saveThread,
  splitThread,
  startThreadWrite,
  threadProblem,
  threadWriting,
  unnumbered,
  type ThreadNetwork,
} from "@/lib/threadSplit";

const NETWORKS: readonly ThreadNetwork[] = ["threads", "x"];
const TOUCH = "[@media(pointer:coarse)]:min-h-11";
const ICON = "grid h-8 w-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11";
const pill = (on: boolean) =>
  `min-h-9 rounded-full border px-3 text-xs font-semibold transition-colors ${TOUCH} ${
    on ? "border-primary/60 bg-primary/10 text-primary" : "border-border/60 text-muted-foreground hover:border-primary/40 hover:text-foreground"
  }`;

/** "Make it a thread" under a finished text post (opens ?panel=thread, pushed), with Jev's "Reads well as a thread" beside it when it says so. */
export function ThreadButton({ draftId, post, ready }: { draftId: string; post: string; ready: boolean }) {
  const [panel, openPanel] = useUrlItem("panel");
  const update = useUrlUpdate();
  const open = panel === "thread";
  const [good, setGood] = useState<boolean | null>(null);
  useEffect(() => {
    setGood(null);
    if (!ready || post.trim().length < 40) return;
    let live = true;
    void readsAsThread(draftId, post).then((v) => live && setGood(v));
    return () => {
      live = false;
    };
    // asked once per draft a visit, when it is finished; later edits don't ask again
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftId, ready]);
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => (open ? update({ panel: null, network: null }) : openPanel("thread"))} aria-expanded={open} className={`h-9 gap-1.5 ${TOUCH}`}>
        <ListOrdered className="h-3.5 w-3.5" /> Make it a thread
      </Button>
      {good && <span className="rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">Reads well as a thread</span>}
    </>
  );
}

export default function ThreadPanel({
  userId,
  draft,
  text,
  tails,
  samples,
  blockReason,
  onDrafts,
}: {
  userId: string;
  /** The saved post the thread is made from and kept on. */
  draft: DraftEntry;
  /** The post as it would be posted: plain, signed off, disclosed. */
  text: string;
  /** Its sign-off and credit lines, lifted onto the last post. */
  tails: string[];
  /** Saved voice posts, for the sounds-human check. */
  samples: string[];
  /** Team rule "needs approval before posting": why it can't go yet, or null. */
  blockReason: string | null;
  onDrafts: () => void;
}) {
  const { toast } = useToast();
  const [params] = useSearchParams();
  const [network, setNetwork] = useUrlState<ThreadNetwork>("network", "threads", { allowed: NETWORKS });
  const update = useUrlUpdate();
  const [kept] = useState(() => loadWorking(draft.id) ?? threadOf(draft));
  const [posts, setPosts] = useState<string[]>(() => kept?.posts ?? splitThread(text, network, tails));
  const postsRef = useRef(posts);
  postsRef.current = posts;
  // the opening split, untouched: a network switch splits again for the new limit
  const fresh = useRef(!kept);
  const dirty = useRef(false);
  const [undo, setUndo] = useState<string[] | null>(null);
  const [writing, setWriting] = useState(false);
  const [wrote, setWrote] = useState(false);
  const [error, setError] = useState("");
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [posting, setPosting] = useState(false);
  const root = useRef<HTMLElement>(null);
  const boxes = useRef<(HTMLTextAreaElement | null)[]>([]);
  const left = useUsesLeft(writing)("thread-copy");

  const follow = (run: Promise<string[]>) => {
    setWriting(true);
    setError("");
    run
      .then((next) => {
        setUndo(postsRef.current);
        fresh.current = false;
        setPosts(next);
        setWrote(true);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't write the thread right now. Try again in a minute."))
      .finally(() => setWriting(false));
  };

  useEffect(() => {
    // a link without ?network= opens a kept thread on its own network
    if (kept && !params.has("network") && kept.network !== network) setNetwork(kept.network);
    root.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    // a thread still being written when the panel closed shows up here
    const run = threadWriting(draft.id);
    if (run) follow(run);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // every change is kept in this tab at once and on the draft half a second later, when the draft can hold it
  useEffect(() => {
    if (!dirty.current) return;
    keepWorking(draft.id, { network, posts });
    const t = setTimeout(() => saveThread(userId, draft.id, { network, posts }), 500);
    return () => clearTimeout(t);
  }, [posts, network, userId, draft.id]);

  // each box as tall as its post, so nothing hides behind a scroll
  useLayoutEffect(() => {
    for (const el of boxes.current.slice(0, posts.length)) {
      if (!el) continue;
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight + 2}px`;
    }
  }, [posts]);

  const change = (next: string[]) => {
    dirty.current = true;
    fresh.current = false;
    setUndo(null);
    setPosts(next);
  };
  // a whole new set of posts, with Undo
  const replace = (next: string[]) => {
    change(next);
    setUndo(postsRef.current);
  };
  const isNum = isNumbered(posts);
  const move = (i: number, by: number) => {
    const next = [...posts];
    [next[i], next[i + by]] = [next[i + by], next[i]];
    change(renumber(next, isNum));
  };
  const pickNetwork = (n: ThreadNetwork) => {
    if (n === network) return;
    dirty.current = true;
    if (fresh.current) setPosts(splitThread(text, n, tails));
    setNetwork(n);
  };
  const write = () => {
    if (writing) return;
    follow(startThreadWrite(userId, draft.id, text, network, tails));
  };
  const copy = async (t: string, title: string) => {
    if (blockReason) {
      toast({ title: "Approval needed before posting", description: `Team rule. ${blockReason}` });
      return;
    }
    try {
      await navigator.clipboard.writeText(t);
      toast({ title, description: `Paste it into ${THREAD_NETWORKS[network].name}.` });
    } catch {
      toast({ title: "Copy failed", description: "Select the text manually and copy.", variant: "destructive" });
    }
  };
  const cleanAll = () => {
    let n = 0;
    const next = posts.map((p) => {
      const r = cleanAiTells(p);
      n += r.changes;
      return r.text;
    });
    if (!n) return void toast({ title: "Nothing to clean" });
    replace(next);
    toast({ title: `${n} ${n === 1 ? "change" : "changes"} made.` });
  };
  // "Rewrite these lines" puts the cursor on the first one, in its post
  const showLine = (lines: string[]) => {
    const i = posts.findIndex((p) => p.includes(lines[0]));
    const box = boxes.current[i];
    if (!box) return;
    const at = posts[i].indexOf(lines[0]);
    box.focus();
    box.setSelectionRange(at, at + lines[0].length);
  };

  const { max } = THREAD_NETWORKS[network];
  const problem = threadProblem(posts, network);
  const overLine = problem?.startsWith("Post ") ? problem : null;
  const joined = posts.join("\n\n");
  const canPost = network === "threads" && socialConnectShown() && !draft.zernio?.postId;
  const postWhy = problem ?? (draft.status === "scheduled" && draft.scheduledFor ? null : "Schedule this post first. The thread goes out at its time.");
  const writeWhy = reasonText({ left, leo: true });

  return (
    <section ref={root} aria-label="Thread" className="mt-3 scroll-mt-24 space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="text-xs font-semibold text-muted-foreground">Thread for</span>
          {NETWORKS.map((n) => (
            <button key={n} type="button" aria-pressed={network === n} disabled={writing} onClick={() => pickNetwork(n)} className={pill(network === n)}>
              {THREAD_NETWORKS[n].name} <span className="font-normal tabular-nums opacity-70">{THREAD_NETWORKS[n].max}</span>
            </button>
          ))}
          <InfoTip label="About X">X is copy only. Paste it into X yourself.</InfoTip>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">{posts.length} {posts.length === 1 ? "post" : "posts"}</span>
          <button type="button" onClick={() => update({ panel: null, network: null })} aria-label="Close the thread" className={ICON}>
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {writing && (
        <p role="status" className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ThinkingOrb state="weaving" size={20} theme="light" aria-hidden /> Writing your thread...
        </p>
      )}

      <ol className="space-y-3">
        {posts.map((p, i) => (
          <li key={i} className="space-y-1">
            <div className="flex items-start gap-2">
              <span className="mt-2 w-5 shrink-0 text-right text-xs font-semibold tabular-nums text-muted-foreground">{i + 1}</span>
              <Textarea
                ref={(el) => {
                  boxes.current[i] = el;
                }}
                aria-label={`Post ${i + 1}`}
                value={p}
                disabled={writing}
                onChange={(e) => change(posts.map((x, k) => (k === i ? e.target.value : x)))}
                rows={2}
                className="min-h-0 min-w-0 flex-1 resize-none overflow-hidden bg-background text-sm leading-relaxed"
              />
            </div>
            <div className="flex flex-wrap items-center justify-end gap-0.5 pl-7">
              <span className={`mr-auto text-[11px] tabular-nums ${p.length > max ? "font-semibold text-destructive" : "text-muted-foreground"}`}>
                {p.length}/{max}
              </span>
              <button type="button" aria-label={`Move post ${i + 1} up`} disabled={writing || i === 0} onClick={() => move(i, -1)} className={ICON}>
                <ArrowUp className="h-3.5 w-3.5" />
              </button>
              <button type="button" aria-label={`Move post ${i + 1} down`} disabled={writing || i === posts.length - 1} onClick={() => move(i, 1)} className={ICON}>
                <ArrowDown className="h-3.5 w-3.5" />
              </button>
              <button type="button" aria-label={`Copy post ${i + 1}`} title={blockReason ?? undefined} onClick={() => void copy(p, `Post ${i + 1} copied`)} className={ICON}>
                <Copy className="h-3.5 w-3.5" />
              </button>
              <button type="button" aria-label={`Remove post ${i + 1}`} disabled={writing || posts.length < 2} onClick={() => replace(renumber(posts.filter((_, k) => k !== i), isNum))} className={ICON}>
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="pl-7">
              <ComplianceChips flags={scanCompliance(p).filter((f) => !dismissed.has(f.id))} onDismiss={(id) => setDismissed((s) => new Set(s).add(id))} />
            </div>
          </li>
        ))}
      </ol>

      {overLine && (
        <p role="alert" className="text-xs font-medium text-destructive">
          {overLine}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => change(renumber([...posts, ""], isNum))} disabled={writing || posts.length >= THREAD_MAX_POSTS} className={`h-9 gap-1.5 ${TOUCH}`}>
          <Plus className="h-3.5 w-3.5" /> Add a post
        </Button>
        <Button variant="outline" size="sm" aria-pressed={isNum} onClick={() => change(isNum ? unnumbered(posts) : numbered(posts))} disabled={writing || posts.length < 2} className={`h-9 gap-1.5 ${TOUCH}`}>
          <ListOrdered className="h-3.5 w-3.5" /> {isNum ? "Take the numbers off" : "Number them"}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => replace(splitThread(text, network, tails))} disabled={writing} className={`h-9 gap-1.5 ${TOUCH}`}>
          <Scissors className="h-3.5 w-3.5" /> Split it myself
        </Button>
        <Button variant="outline" size="sm" onClick={write} disabled={writing || left === 0} className={`h-9 gap-1.5 ${TOUCH}`}>
          <Sparkles className="h-3.5 w-3.5" /> {wrote ? "Write it again" : "Write it as a thread"}
        </Button>
        <PriceChip feature="thread-copy" left={left} />
        {undo && !writing && (
          <button type="button" onClick={() => change(undo)} className={`text-xs font-semibold text-primary hover:underline ${TOUCH}`}>
            Undo
          </button>
        )}
      </div>
      {writeWhy && <p className="text-xs text-muted-foreground">{writeWhy}</p>}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-primary/20 pt-3">
        <Button size="sm" onClick={() => void copy(joined, "Thread copied")} disabled={!!blockReason || writing} title={blockReason ?? undefined} className={`h-9 gap-1.5 ${TOUCH}`}>
          <Copy className="h-3.5 w-3.5" /> Copy all
        </Button>
        {canPost && (
          <Button variant="outline" size="sm" onClick={() => setPosting((o) => !o)} aria-expanded={posting} disabled={!!postWhy || writing} className={`h-9 gap-1.5 ${TOUCH}`}>
            <Send className="h-3.5 w-3.5" /> Post it for me
          </Button>
        )}
        {canPost && postWhy && !overLine && <span className="text-xs text-muted-foreground">{postWhy}</span>}
      </div>
      {blockReason && <p className="text-xs text-muted-foreground">Team rule: approval needed before posting. {blockReason}</p>}
      {posting && canPost && !postWhy && (
        <PostItForMePanel userId={userId} draft={draft} blockReason={blockReason} onDrafts={onDrafts} onClose={() => setPosting(false)} thread={posts} />
      )}

      <HumanCheck draft={joined} samples={samples} disabled={writing} onClean={cleanAll} onRewriteLines={showLine} />
      <div className="mt-3">
        <FactFlags text={joined} live={false} />
      </div>
    </section>
  );
}
