// Make it a thread (formats-text-threads, Leo only): a finished post split into a Threads or X thread for free,
// written again as one by the AI (video-assist mode "thread", cap thread-copy), Jev's "Reads well as a thread" hint
// (writing-judge mode "thread"), and the thread kept on its draft (DraftEntry.thread) so it reopens anywhere.
// The panel is src/components/ThreadPanel.tsx.

import { callFn } from "@/lib/edgeFn";
import { DISCLOSURES } from "@/lib/plainText";
import { getDraftById, upsertDraft, type DraftThread } from "@/lib/draftHistory";
import { THREAD_MAX_POSTS, THREAD_NETWORKS, cutAtWord, numbered, sentencesOf, threadRoom, type ThreadNetwork } from "../../supabase/functions/video-assist/captions.ts";
import { THREAD_YES } from "../../supabase/functions/writing-judge/logic.ts";

export { THREAD_MAX_POSTS, THREAD_NETWORKS, numbered, threadRoom, type ThreadNetwork };

const TAG_LINE = /^\s*(#[\p{L}\p{N}_]+\s*)+$/u;
const TAG_RUN = /(\s+#[\p{L}\p{N}_]+)+\s*$/u;

/** A block cut into pieces of `room` or fewer: whole sentences while they fit, a longer sentence at a word. Nothing is dropped. */
function piecesOf(block: string, room: number): string[] {
  const out: string[] = [];
  let cur = "";
  for (let s of sentencesOf(block.replace(/\s+/g, " "))) {
    const next = cur ? `${cur} ${s}` : s;
    if (next.length <= room) {
      cur = next;
      continue;
    }
    if (cur) out.push(cur);
    cur = "";
    while (s.length > room) {
      const cut = cutAtWord(s, room);
      out.push(cut);
      s = s.slice(cut.length).trim();
    }
    cur = s;
  }
  if (cur) out.push(cur);
  return out;
}

/**
 * The post as a thread, for free: the hook alone as post 1 when it fits, then the paragraphs packed into posts of
 * the network's room (blank lines first, then between sentences, and inside a sentence only at a word). Hashtags,
 * the sign-off, the disclosure line and the credit (`tails`) are lifted off and added back to the last post. Every
 * word is kept, so a long post can come back with more than THREAD_MAX_POSTS posts; the panel says so.
 */
export function splitThread(text: string, network: ThreadNetwork, tails: string[] = []): string[] {
  const room = threadRoom(network);
  const lines = text.replace(/\r/g, "").split("\n");
  const tagLines = lines.filter((l) => TAG_LINE.test(l)).map((l) => l.trim());
  let body = lines.filter((l) => !TAG_LINE.test(l)).join("\n").trim();
  // the closing lines, in the order they were written
  const known = [...tails, ...Object.values(DISCLOSURES).map((d) => d.line)].map((t) => t.trim()).filter(Boolean);
  let end = body.length;
  for (;;) {
    const head = body.slice(0, end).trimEnd();
    const k = known.find((t) => head.endsWith(t));
    if (!k) break;
    end = head.length - k.length;
  }
  let closing = body.slice(end).trim();
  body = body.slice(0, end).trim();
  const run = body.match(TAG_RUN);
  if (run) {
    body = body.slice(0, run.index).trim();
    tagLines.unshift(run[0].trim());
  }
  closing = [closing, tagLines.join(" ")].filter(Boolean).join("\n\n");

  const [first = "", ...rest] = body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const [hook = "", ...afterHook] = first.split("\n");
  const blocks = [...(afterHook.length ? [afterHook.join("\n").trim()] : []), ...rest].filter(Boolean);
  const posts: string[] = [];
  let cur = "";
  const flush = () => {
    if (cur) posts.push(cur);
    cur = "";
  };
  if (hook.trim().length <= room) posts.push(hook.trim());
  else blocks.unshift(hook.trim());
  for (const b of blocks) {
    const next = cur ? `${cur}\n\n${b}` : b;
    if (next.length <= room) cur = next;
    else if (b.length <= room) {
      flush();
      cur = b;
    } else {
      flush();
      posts.push(...piecesOf(b, room));
    }
  }
  flush();
  if (closing) {
    const last = posts[posts.length - 1];
    if (last && `${last}\n\n${closing}`.length <= room) posts[posts.length - 1] = `${last}\n\n${closing}`;
    else posts.push(...(closing.length <= room ? [closing] : piecesOf(closing, room)));
  }
  return posts.filter(Boolean);
}

const LEADING_NUMBER = /^\d+\/\d+ /;
/** True when every post starts with its own "2/5 " number. */
export const isNumbered = (posts: string[]) => posts.length > 1 && posts.every((p, i) => p.startsWith(`${i + 1}/${posts.length} `));
/** The posts without a leading "2/5 ". */
export const unnumbered = (posts: string[]) => posts.map((p) => p.replace(LEADING_NUMBER, ""));
/** After an add, a move or a delete, numbered posts are numbered again for their new places. */
export const renumber = (posts: string[], wasNumbered: boolean) => (wasNumbered ? numbered(unnumbered(posts)) : posts);

/** Why the thread can't be posted yet, or null. Copying always works. */
export function threadProblem(posts: string[], network: ThreadNetwork): string | null {
  const { name, max } = THREAD_NETWORKS[network];
  const over = posts.findIndex((p) => p.length > max);
  if (over >= 0) return `Post ${over + 1} is over ${name}'s ${max} character limit by ${posts[over].length - max}. Trim before posting.`;
  if (posts.some((p) => !p.trim())) return "Fill in every post, or take the empty one out.";
  if (posts.length < 2) return "A thread needs 2 posts or more.";
  if (posts.length > THREAD_MAX_POSTS) return `A thread takes up to ${THREAD_MAX_POSTS} posts. Join or cut some first.`;
  return null;
}

// ---- kept with the draft, and the panel's own copy for this tab ----

/** Saves the thread on its draft when it can be kept there (2 to 10 posts, none blank or over 500); true when saved. */
export function saveThread(userId: string, draftId: string, thread: DraftThread): boolean {
  const posts = thread.posts.map((p) => p.trim());
  if (posts.length < 2 || posts.length > THREAD_MAX_POSTS || posts.some((p) => !p || p.length > THREAD_NETWORKS.threads.max)) return false;
  const entry = getDraftById(userId, draftId);
  if (!entry) return false;
  upsertDraft(userId, { ...entry, thread: { network: thread.network, posts } });
  return true;
}

// Every edit, even one the draft can't hold yet (a post over the limit, an empty one), so a reload keeps it.
const WORKING = "cs-thread-";

export function loadWorking(draftId: string): DraftThread | null {
  try {
    const t = JSON.parse(sessionStorage.getItem(WORKING + draftId) ?? "null") as DraftThread | null;
    return t && (t.network === "threads" || t.network === "x") && Array.isArray(t.posts) && t.posts.every((p) => typeof p === "string") ? { network: t.network, posts: t.posts.slice(0, 20) } : null;
  } catch {
    return null;
  }
}

export function keepWorking(draftId: string, thread: DraftThread) {
  try {
    sessionStorage.setItem(WORKING + draftId, JSON.stringify(thread));
  } catch {
    // storage blocked or full: the boxes keep it for this visit
  }
}

// ---- the AI writer, run outside React so leaving the panel keeps its answer ----

const writing = new Map<string, Promise<string[]>>();

/** The thread being written for this draft, if any. */
export const threadWriting = (draftId: string) => writing.get(draftId) ?? null;

/** Writes the post again as a thread; the answer is saved on the draft (and this tab's copy) even if the panel has closed. */
export function startThreadWrite(userId: string, draftId: string, post: string, network: ThreadNetwork): Promise<string[]> {
  const running = writing.get(draftId);
  if (running) return running;
  const run = callFn<{ posts?: unknown }>("video-assist", { mode: "thread", post, network }, "Couldn't write the thread right now. Try again in a minute.")
    .then((res) => {
      const posts = Array.isArray(res?.posts) ? res.posts.filter((p): p is string => typeof p === "string" && p.trim() !== "") : [];
      if (posts.length < 2) throw new Error("That thread didn't come out right. Try again.");
      keepWorking(draftId, { network, posts });
      saveThread(userId, draftId, { network, posts });
      return posts;
    })
    .finally(() => writing.delete(draftId));
  writing.set(draftId, run);
  return run;
}

// ---- Jev's hint ----

const hinted = new Map<string, Promise<boolean | null>>();

/** True when Jev says the post reads well as a thread (at THREAD_YES); null when it can't say. Asked once per draft a visit. */
export function readsAsThread(draftId: string, post: string): Promise<boolean | null> {
  const known = hinted.get(draftId);
  if (known) return known;
  const ask = callFn<{ yes?: unknown }>("writing-judge", { mode: "thread", post })
    .then((res) => (typeof res?.yes === "number" ? res.yes >= THREAD_YES : null))
    .catch(() => null);
  hinted.set(draftId, ask);
  return ask;
}
