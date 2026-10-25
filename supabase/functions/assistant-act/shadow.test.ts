import { describe, expect, it } from "vitest";
import set from "./fixtures/agent-labelled.json";
import { TODAY_ACTS, cases, report, rows, type Case, type LabelSet } from "./shadow";
import type { JevAnswer } from "../_shared/jev";

// The side-by-side harness with Jev stubbed: the labelled set builds, and the report finds what it must.
const labelled = set as unknown as LabelSet;
const cs = cases(labelled);
const choice = (c: string, p = 0.99): JevAnswer => ({ type: "choice", choice: c, probabilities: { [c]: p } });
/** A label value back to the option key Jev answers with; a words slot's label is its words, found among the case's options. */
function optionOf(k: string, v: unknown, c?: Case): string {
  if (v === null) return k === "slide" ? "all" : k === "who" ? "any" : "none";
  if ((k === "subject" || k === "name") && v !== "last") {
    const q = c?.agent.ask.questions[k] as { criteria: Record<string, unknown> } | undefined;
    return Object.entries(q?.criteria ?? {}).find(([, t]) => t === v)?.[0] ?? `missing ${String(v)}`;
  }
  if (typeof v !== "number" || ["length", "weeks", "pace"].includes(k)) return String(v);
  return `${{ who: "w", audience: "a", slide: "s", which: "l", skill: "s", post: "p" }[k]}${v + 1}`;
}
/** Jev answering exactly the label, today's dock answering the label's act when it offers it. */
const asLabelled = (c: Case, mode: "today" | "agent") =>
  Object.fromEntries(
    Object.entries(c.item.label)
      .filter(([k]) => k !== "today" && (mode === "agent" || k === "act" || ["post", "day", "time", "scope"].includes(k)))
      .map(([k, v]) => [k, choice(k === "act" && mode === "today" && !TODAY_ACTS.includes(String(v)) ? "none" : optionOf(k, v, c))]),
  );

describe("the labelled messages", () => {
  it("hold about 50 messages with their own ids, and each builds both requests", () => {
    expect(cs.length).toBeGreaterThanOrEqual(50);
    expect(new Set(cs.map((c) => c.item.id)).size).toBe(cs.length);
    for (const c of cs) {
      expect(c.today.body.agent, c.item.id).toBeUndefined();
      expect(c.agent.body.agent, c.item.id).toBeTruthy();
    }
  });
  it("label only what agent mode offers each one, and cover every act and slot the brief names", () => {
    for (const c of cs) {
      const q = c.agent.ask.questions as Record<string, { criteria: Record<string, string> }>;
      for (const [k, v] of Object.entries(c.item.label).filter(([k]) => k !== "today")) {
        expect(q[k], `${c.item.id} asks ${k}`).toBeTruthy();
        expect(Object.keys(q[k].criteria), `${c.item.id} offers ${k} ${String(v)}`).toContain(optionOf(k, v, c));
      }
    }
    const acts = new Set(cs.map((c) => c.item.label.act));
    for (const a of [...TODAY_ACTS, "remix", "make", "competitor", "campaign", "capabilities", "refuse", "budget", "forget", "memory", "check", "approve", "decline", "edit", "answer", "none"])
      expect(acts, a).toContain(a);
    const slots = new Set(cs.flatMap((c) => Object.keys(c.item.label)));
    for (const k of ["format", "length", "who", "audience", "weeks", "pace", "slide", "which", "skill", "post", "day", "time", "scope"]) expect(slots, k).toContain(k);
    const from = cs.map((c) => c.item.from);
    expect(from.filter((f) => f.startsWith("Fastlane 19 Oct")).length).toBe(6);
    expect(cs.filter((c) => c.item.ctx === "at").every((c) => c.agent.body.agent!.speaker === "business")).toBe(true);
  });
});

describe("the side-by-side report", () => {
  it("reads all right when both sides answer the labels", () => {
    const text = report(rows(cs, asLabelled));
    const n = cs.filter((c) => c.item.label.act).length;
    expect(text).toContain(`Agent act right on ${n} of ${n} labelled; today's dock right on ${n} of ${n}.`);
    for (const h of ["Today's acts, agent mode against today's dock (0)", "Agent act misses (0)", "Slot misses (0)", "Within 0.15 of a cut (0)"]) expect(text).toContain(h);
    expect(text).toContain("- today-move: move (post 0, day 2026-10-27, time 20:00) | p: act 0.99, post 0.99, day 0.99, time 0.99");
  });
  it("lists a today's act agent mode takes away, a miss, a wrong slot and an answer near its cut", () => {
    const text = report(
      rows(cs, (c, mode) => {
        const a = asLabelled(c, mode);
        if (mode === "agent" && c.item.id === "today-write") return { ...a, act: choice("edit", 0.7) };
        if (mode === "agent" && c.item.id === "make-20s") return { ...a, length: choice("15") };
        if (mode === "agent" && c.item.id === "approve-yes") return { ...a, act: choice("approve", 0.85) };
        if (mode === "agent" && c.item.id === "memory") return { ...a, act: choice("none", 0.55) };
        return a;
      }),
    );
    expect(text).toContain("## Today's acts, agent mode against today's dock (1)");
    expect(text).toContain('- today-write "rewrite my ILP post to sound less salesy": label write, today write (Jev: write 0.99), agent none (Jev: edit 0.70)');
    expect(text).toContain("## Agent act misses (2)");
    expect(text).toContain("- memory \"what do you remember about me?\": label memory, agent none (Jev: none 0.55)");
    expect(text).toContain("- make-20s length: label 20, agent 15 (Jev: 15 0.99)");
    expect(text).toContain("## Within 0.15 of a cut (1)");
    expect(text).toContain("- approve-yes act: approve 0.85 (cut 0.8)");
  });
  it("names a message Jev never answered as no pick", () => {
    const text = report(rows(cs, (c, mode) => (c.item.id === "fastlane-what" ? null : asLabelled(c, mode))));
    expect(text).toContain("- fastlane-what: none | p: none");
    expect(text).toContain("## Agent act misses (1)");
  });
});
