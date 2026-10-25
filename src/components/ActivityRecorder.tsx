// Activity's recorder (north-star agent-activity, Leo only): one row each time a job that runs outside React ends,
// whichever page is open. Mounted once in StudioLayout for Leo's sessions, which also turns logging on (nothing logs
// for anyone else). The stores re-emit the same state many times, so a row is written only on a change from a
// running state to an ended one, against the last state seen. Each job logs its own part once: an AI video's
// presenter and clips log through the AI video store, so the talking video and the remix log only what they did
// themselves. A make the agent started logs here too (agent-chat adds no logging of its own): a remix draft, or a
// slideshow, wall, picture, AI video or talking video whose ask or state carries the agent's chat, reads as the agent's.
import { useEffect } from "react";
import { logActivity, type NewActivity } from "@/lib/activity";
import { AI_FOLDER, imageJob, onImageJob, type ImageJob } from "@/lib/aiImage";
import { STILL_MAKING, aiJob, onAiJob, type AiJob } from "@/lib/aiVideo";
import { loadDrafts } from "@/lib/draftHistory";
import { links } from "@/lib/links";
import { AS_NOUN, type RemixAs } from "@/lib/remix";
import { onRemixJob, remixJob, type RemixJobState } from "@/lib/remixJob";
import { onSlideshowJob, slideshowJob, type SlideshowJob } from "@/lib/slideshowJob";
import { SLUG as TALK_SLUG, onTalkJob, talkJob, type TalkJob } from "@/lib/talkingHeadJob";
import { SCENE_LABEL, onWallJob, wallJob, type WallJob, type WallSlot } from "@/lib/wallJob";

/** "a carousel", "an explainer video"; plural nouns ("hooks") take none. */
const a = (noun: string) => (noun.endsWith("s") ? noun : `${/^[aeiou]/.test(noun) ? "an" : "a"} ${noun}`);
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const quoted = (t: string | undefined, max = 70) => {
  const s = (t ?? "").replace(/\s+/g, " ").trim();
  return s.length > max ? `"${s.slice(0, max - 3).trimEnd()}..."` : `"${s}"`;
};
const list = (words: string[]) => (words.length < 2 ? words.join("") : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`);

type Ended<J> = (before: J, after: J) => NewActivity | null;

/** The agent's when the job carries its chat (agent: { thread, msg }), else yours. */
const whoOf = (agent: unknown): NewActivity["who"] => (agent ? "agent" : "you");

/** Logs `ended(before, after)` on each change; a repeat, a null or a throw logs nothing and never reaches the job. */
function watch<J>(subscribe: (fn: (j: J | null) => void) => () => void, now: J | null, ended: Ended<J>, log: (e: NewActivity) => void): () => void {
  let last = now;
  return subscribe((j) => {
    const before = last;
    last = j;
    if (!before || !j) return;
    try {
      const e = ended(before, j);
      if (e) log(e);
    } catch {
      // a row is never worth breaking the job that emitted it
    }
  });
}

const remixEnded =
  (userId: string): Ended<RemixJobState> =>
  (b, j) => {
    if (b.id !== j.id || b.state !== "working" || j.state === "working") return null;
    const kind = j.key ? "remix" : "make";
    const done = j.rows.filter((r) => r.state === "done");
    const failed = j.rows.filter((r) => r.state === "failed");
    const noun = (as: RemixAs) => AS_NOUN[as];
    if (!done.length) return { who: "you", kind, title: j.key ? "A remix could not be made" : `${cap(a(noun(j.rows[0]?.as ?? "post")))} could not be made`, detail: failed[0]?.error };
    const drafts = loadDrafts(userId);
    const agent = done.some((r) => drafts.find((d) => d.id === r.draftId)?.agent);
    const misses = failed.map((r) => `${cap(a(noun(r.as)))} could not be made: ${r.error ?? "it didn't go through."}`);
    return {
      who: agent ? "agent" : "you",
      kind,
      title:
        done.length === 1
          ? `Made ${a(noun(done[0].as))}: ${quoted(done[0].hook)}`
          : j.run.versions
            ? `Made ${done.length} versions of ${a(noun(done[0].as))}`
            : `Made ${list(done.map((r) => a(noun(r.as))))}`,
      detail: [done.length > 1 ? `${list(done.map((r) => quoted(r.hook, 50)))}.` : "", ...misses].filter(Boolean).join(" "),
      link: done[0].href,
    };
  };

const AI_NOUN: Record<AiJob["kind"], string> = { presenter: "presenter picture", avatar: "avatar video", explainer: "explainer video", template: "template clip" };
const aiEnded: Ended<AiJob> = (b, j) => {
  if (b.kind !== j.kind || b.state !== "working" || j.state === "working") return null;
  const who = whoOf(j.agent);
  if (j.state === "done") return { who, kind: "make", title: `Made ${a(AI_NOUN[j.kind])}`, link: links.edit() };
  // over 20 minutes at Higgsfield is not a failure: the paid video is kept and picked up later
  return { who, kind: "make", title: `The ${AI_NOUN[j.kind]} ${j.error === STILL_MAKING ? "is still being made" : "could not be made"}`, detail: j.error, link: links.edit() };
};

const imageBusy = (j: ImageJob) => j.state === "working" || j.state === "saving";
const imageEnded: Ended<ImageJob> = (b, j) => {
  if (!imageBusy(b) || imageBusy(j)) return null;
  const link = links.media({ folder: AI_FOLDER });
  const who = whoOf(j.agent);
  // a failed fix puts the picture before it back as done, with fixError: that picture stays, so nothing logs
  if (b.fix) return j.state === "done" && !j.fixError ? { who, kind: "make", title: "Fixed a picture", detail: b.fix, link } : null;
  if (j.state === "done") return { who, kind: "make", title: "Made a picture", detail: j.prompt.slice(0, 120), link };
  return { who, kind: "make", title: "A picture could not be made", detail: j.error };
};

const showBusy = (j: SlideshowJob) => j.state === "writing" || j.state === "finding" || j.state === "drawing";
const slideshowEnded: Ended<SlideshowJob> = (b, j) => {
  if (b.id !== j.id || !showBusy(b) || showBusy(j)) return null;
  const about = j.ask.source?.title || j.ask.topic;
  const who = whoOf(j.ask.agent);
  if (j.state === "done") return { who, kind: j.ask.source ? "remix" : "make", title: "Made a slideshow", detail: about, link: links.slideshow({ s: j.showId }) };
  return { who, kind: "make", title: "A slideshow could not be made", detail: j.error };
};

const wallBusy = (j: WallJob) => j.state === "writing" || j.state === "finding" || j.state === "clip" || j.state === "joining";
const wallEnded =
  (slot: WallSlot): Ended<WallJob> =>
  (b, j) => {
    if (b.id !== j.id || !wallBusy(b) || wallBusy(j)) return null;
    const noun = slot === "scene" ? SCENE_LABEL.toLowerCase() : "a wall of text";
    const who = whoOf(j.ask.agent);
    if (j.state === "done") return { who, kind: j.ask.source ? "remix" : "make", title: `Made ${noun}`, detail: j.ask.source?.title || j.ask.about, link: links.edit() };
    return { who, kind: "make", title: `${cap(noun)} could not be made`, detail: j.error };
  };

/** The talking video's own steps: the script, and a failure before the AI video store takes over (presenter, clips). */
const talkEnded: Ended<TalkJob> = (b, j) => {
  if (b.id !== j.id) return null;
  const link = links.makeFormat(TALK_SLUG, j.params);
  const who = whoOf(j.ask?.agent);
  if (b.state === "writing" && j.state === "written") return { who, kind: "make", title: "Wrote a talking video script", detail: j.script, link };
  if (j.state === "failed" && (b.state === "writing" || b.state === "voice")) return { who, kind: "make", title: "A talking video could not be made", detail: j.error, link };
  return null;
};

/** Subscribes to every job store and logs each job's end; returns the unsubscribe. */
export function recordJobs(userId: string): () => void {
  const log = (e: NewActivity) => void logActivity(userId, e);
  const offs = [
    watch(onRemixJob, remixJob(), remixEnded(userId), log),
    watch(onAiJob, aiJob(), aiEnded, log),
    watch(onImageJob, imageJob(), imageEnded, log),
    watch(onSlideshowJob, slideshowJob(), slideshowEnded, log),
    ...(["wall", "scene"] as const).map((slot) => watch((fn) => onWallJob(fn, slot), wallJob(slot), wallEnded(slot), log)),
    watch(onTalkJob, talkJob(), talkEnded, log),
  ];
  return () => offs.forEach((off) => off());
}

export default function ActivityRecorder({ userId }: { userId: string }) {
  useEffect(() => recordJobs(userId), [userId]);
  return null;
}
