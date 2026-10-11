// The in-app assistant acting on the adviser's own data (gap g51). Each message goes
// to the assistant-act function first, where Jev decides which one thing it asks for,
// which saved post it means and the day and time it names. This turns that into a
// confirm card naming exactly what will change; nothing changes until it is tapped,
// and then only through the functions the pages use, with the pages' Undo. Nothing
// here posts, sends or publishes: Post it for me stays a dialog on My posts.
// No Jev answer, or nothing the app does: null, and the chat answers in words.

import type { DockAct } from "@/components/feedback/AssistantDock";
import { callFn } from "@/lib/edgeFn";
import { draftStatus, draftsChanged, loadDrafts, restoreDraft, setDraftStatus, type DraftEntry } from "@/lib/draftHistory";
import { keyToDate, localDateKey, postedDay, scheduleAt, scheduleTime, timeLabel } from "@/lib/dueDates";
import { loadRun, newThreadPaste, runningJob, saveRun, type EngageTool } from "@/lib/engageDrafts";
import { loadFollowing } from "@/lib/following";
import { loadGoals, sgDay } from "@/lib/goals";
import { socialConnectShown } from "@/lib/socialConnect";
import { MAX_POSTS, type ActPick, type ActPost } from "../../supabase/functions/assistant-act/logic.ts";
import { reportFacts, weekReport } from "../../supabase/functions/notify/logic.ts";
import { mostlyEnglish } from "../../supabase/functions/post-score/logic.ts";

/** Opens a page in the app; `replace` for a reload of the page already open. */
export type Go = (path: string, replace?: boolean) => void;

const titleOf = (d: DraftEntry) => (d.hook || d.pillarDetail || d.draft.split("\n").find((l) => l.trim()) || "Untitled post").trim().slice(0, 80);
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 3).trimEnd()}...` : s);
/** "Tue 14 Oct, 9am" for a scheduledFor value. */
const whenWords = (scheduledFor: string) => {
  const time = scheduleTime(scheduledFor);
  return `${keyToDate(scheduledFor.slice(0, 10)).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}${time ? `, ${timeLabel(time)}` : ""}`;
};

/** The posts as the function reads them, in the order a pick's index points into. */
export function postsForJev(drafts: DraftEntry[]): ActPost[] {
  return drafts.slice(0, MAX_POSTS).map((d) => {
    const status = draftStatus(d);
    const when = status === "posted" ? (d.postedAt ? postedDay(d.postedAt) : "") : (d.scheduledFor ?? "");
    return { title: titleOf(d), status, when, platform: d.platform };
  });
}

/** Asks assistant-act about a message and turns its pick into a card or an answer. Null: let the chat answer. */
export async function proposeAct(userId: string, message: string, go: Go): Promise<DockAct | null> {
  // Jev reads English best: other text gets no judgment (and costs no call)
  if (!mostlyEnglish(message)) return null;
  const drafts = loadDrafts(userId).slice(0, MAX_POSTS);
  const today = localDateKey();
  try {
    const { pick } = await callFn<{ pick: ActPick | null }>("assistant-act", { message, today, posts: postsForJev(drafts) });
    return pick ? actFor(userId, pick, message, drafts, today, go) : null;
  } catch {
    return null; // over the cap, offline or off: words, as before
  }
}

/** A pick as a card or an answer, for the drafts it was asked about. */
export function actFor(userId: string, pick: ActPick, message: string, drafts: DraftEntry[], today: string, go: Go): DockAct | null {
  const d = pick.post === null ? undefined : drafts[pick.post];
  if (pick.act === "move") return d ? moveAct(userId, d, pick, today) : null;
  if (pick.act === "write") return d ? writeAct(d, message) : null;
  if (pick.act === "week") return weekAct(userId);
  return engageAct(userId, ENGAGE[pick.act], message, go);
}

const MY_POSTS = { path: "/drafts", label: "Open My posts" };

function moveAct(userId: string, d: DraftEntry, pick: ActPick, today: string): DockAct | null {
  const title = titleOf(d);
  if (draftStatus(d) === "posted") return { say: `"${title}" is marked posted. Mark it unposted on My posts to move it.`, go: [MY_POSTS] };
  // Post it for me already has it: moving only the app's date would leave Zernio posting at the old time
  if (d.zernio?.postId && !["cancelled", "failed"].includes(d.zernio.status ?? ""))
    return { say: `"${title}" is set to go out through Post it for me. Change its time on My posts.`, go: [MY_POSTS] };
  const wasScheduled = draftStatus(d) === "scheduled";
  const day = pick.day ?? (wasScheduled && d.scheduledFor ? d.scheduledFor.slice(0, 10) : null);
  if (!day || day < today) return null;
  // a new day keeps the posting time, as a drag on Calendar does
  const when = scheduleAt(day, pick.time ?? scheduleTime(d.scheduledFor));
  const label = whenWords(when);
  if (wasScheduled && d.scheduledFor === when) return { say: `"${title}" is already set for ${label}.`, go: [{ path: "/calendar", label: "Open Calendar" }] };
  const [verb, done, to] = wasScheduled ? ["Move", "Moved", "to"] : ["Schedule", "Scheduled", "for"];
  return {
    ask: `${verb} "${title}" ${to} ${label}?${d.repeat ? " Its repeats count from that day." : ""}`,
    yes: `${verb} it`,
    run: () => {
      const prev = loadDrafts(userId).find((x) => x.id === d.id);
      if (!prev) throw new Error("that post is no longer in My posts");
      if (draftStatus(prev) === "posted") throw new Error("it is marked posted now");
      setDraftStatus(userId, d.id, "scheduled", when);
      draftsChanged();
      return {
        done: `${done} "${title}" ${to} ${label}.`,
        // Calendar's own Undo: the post exactly as it was
        undo: () => {
          restoreDraft(userId, prev);
          draftsChanged();
        },
        go: [{ path: "/calendar", label: "Open Calendar" }, ...(socialConnectShown() ? [{ path: "/drafts", label: "Set up Post it for me" }] : [])],
      };
    },
  };
}

/** The longest change passed to Write (GeneratePage's MAX_ASK). */
const MAX_ASK = 300;

function writeAct(d: DraftEntry, message: string): DockAct {
  const title = titleOf(d);
  const ask = message.trim().slice(0, MAX_ASK);
  // a board idea has no words yet: Write opens it as the topic
  const rewrite = !!d.draft.trim();
  const path = `/generate?draft=${encodeURIComponent(d.id)}${rewrite ? `&ask=${encodeURIComponent(ask)}` : ""}`;
  return {
    ask: rewrite ? `Open "${title}" in Write and rewrite it: "${clip(ask, 160)}"?` : `Open "${title}" in Write?`,
    yes: "Open in Write",
    // Write offers the rewrite with Use this and Discard, and its own Undo after
    run: () => ({ done: rewrite ? `Opened "${title}" in Write. Nothing changes until you tap Use this.` : `Opened "${title}" in Write.`, open: path }),
  };
}

function weekAct(userId: string): DockAct {
  // the This week card's report (AnalyticsPage ThisWeekCard), without its paid pick of a move
  const goal = Object.values(loadGoals(userId)).reduce((s, n) => s + (n ?? 0), 0);
  const report = weekReport(loadDrafts(userId), loadFollowing(userId), sgDay(), goal);
  const go = [{ path: "/analytics", label: "Open Analytics" }];
  if (!report.posts && !report.prevPosts) return { say: "No posts marked posted in the last 14 days.", go };
  return { say: `Last 7 days against the 7 before:\n${reportFacts(report)}`, go };
}

const ENGAGE = {
  engage_replies: { tool: "replies", name: "Comments on my post", path: "/recruit/engage" },
  engage_dms: { tool: "dms", name: "My DMs", path: "/recruit/engage?tool=dms" },
  engage_thread: { tool: "thread", name: "My DMs, one conversation", path: "/recruit/engage?tool=dms" },
  engage_comment: { tool: "comments", name: "Comment on a post", path: "/recruit/engage?tool=comments" },
} as const satisfies Record<string, { tool: EngageTool; name: string; path: string }>;
type EngageTarget = (typeof ENGAGE)[keyof typeof ENGAGE];

/** The pasted part of a message: a first line ending in a colon ("Reply to these:") is the ask, not the paste. */
export function pastedPart(message: string): string {
  const [first, ...rest] = message.replace(/\r/g, "").trim().split("\n");
  const after = rest.join("\n").trim();
  return first.trim().endsWith(":") && after ? after : message.trim();
}

function engageAct(userId: string, e: EngageTarget, message: string, go: Go): DockAct {
  const text = pastedPart(message);
  if (runningJob(e.tool, userId)) return { say: `Reply drafts is still drafting in ${e.name}. Try again when it finishes.`, go: [{ path: e.path, label: "Open Reply drafts" }] };
  const now = loadRun(e.tool, userId);
  const filled = e.tool === "comments" ? now.posts.some((p) => p.text.trim()) : !!now.pasted.trim();
  return {
    ask: `Paste this into Reply drafts > ${e.name}?${filled ? " It replaces what is there now." : ""}\n"${clip(text, 160)}"`,
    yes: "Paste it",
    run: () => {
      const prev = loadRun(e.tool, userId);
      const prevDms = loadRun("dms", userId);
      const fresh = { items: [], at: "" };
      if (e.tool === "comments") saveRun(e.tool, userId, { ...prev, ...fresh, posts: [{ name: "", text }] });
      else if (e.tool === "replies") saveRun(e.tool, userId, { ...prev, ...fresh, pasted: text });
      else if (e.tool === "dms") saveRun(e.tool, userId, { ...prev, ...fresh, pasted: text, form: { ...prev.form, view: "batch" } });
      else {
        saveRun(e.tool, userId, { ...prev, ...fresh, ...newThreadPaste(prev, text) });
        saveRun("dms", userId, { ...prevDms, form: { ...prevDms.form, view: "thread" } });
      }
      return {
        done: `Pasted into Reply drafts > ${e.name}.`,
        open: e.path,
        undo: () => {
          saveRun(e.tool, userId, prev);
          if (e.tool === "thread" || e.tool === "dms") saveRun("dms", userId, prevDms);
          // Engage reads its saved text on each visit: open it again to show the old text
          if (window.location.pathname === "/recruit/engage") go(e.path, true);
        },
      };
    },
  };
}
