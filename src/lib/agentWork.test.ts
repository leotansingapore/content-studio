import { describe, expect, it } from "vitest";
import type { AgentCard } from "@/lib/agentCards";
import type { AgentMsg, AgentThread } from "@/lib/agentThreads";
import { cardType, inFlight, ruleRows, workCounters, workOf } from "./agentWork";

const card = (over: Partial<AgentCard>): AgentCard => ({ id: "k1", kind: "make", title: 'Carousel: "habits"', line: "", needs: [], plan: { plan: "remix", format: "carousel" }, status: "proposed", proposedAt: "2026-11-11T02:00:00.000Z", ...over });
const msg = (id: string, over: Partial<AgentMsg>): AgentMsg => ({ id, at: "2026-11-11T01:00:00.000Z", role: "agent", ...over });
const thread = (id: string, messages: AgentMsg[]): AgentThread => ({ id, title: "Chat", createdAt: "", updatedAt: "", messages });

describe("Your work", () => {
  it("names a card by what it makes", () => {
    expect(cardType(card({}))).toBe("Carousel");
    expect(cardType(card({ kind: "image", plan: { plan: "image" } }))).toBe("Picture");
    expect(cardType(card({ plan: { plan: "layout", format: "image", layout: "lofi-note" } }))).toBe("Static ad");
    expect(cardType(card({ kind: "campaign", plan: { plan: "campaign" } }))).toBe("Campaign");
  });

  it("sorts every message into waiting, making or made, newest first", () => {
    const w = workOf([
      thread("t1", [
        msg("u", { role: "user", text: "make it" }),
        msg("m1", { card: card({}) }),
        msg("m2", { card: card({ id: "k2", title: "Newer", proposedAt: "2026-11-11T03:00:00.000Z" }) }),
        msg("m3", { card: card({ id: "k3", status: "approved" }), job: { kind: "remix", state: "running", startedAt: "2026-11-11T02:30:00.000Z" } }),
        msg("m4", { card: card({ id: "k4", status: "declined" }) }),
      ]),
      thread("t2", [
        msg("m5", { card: card({ id: "k5", status: "approved" }), job: { kind: "image", state: "done", title: "A desk", startedAt: "2026-11-10T02:00:00.000Z", endedAt: "2026-11-10T02:01:00.000Z" } }),
        msg("m6", { job: { kind: "slideshow", state: "done", title: "Five calls", startedAt: "2026-11-11T02:00:00.000Z", endedAt: "2026-11-11T02:01:00.000Z" } }),
        msg("m7", { card: card({ id: "k7", status: "starting" }) }),
      ]),
    ]);
    expect(w.waiting.map((x) => x.msg)).toEqual(["m2", "m1"]);
    expect(w.making.map((x) => x.msg).sort()).toEqual(["m3", "m7"]);
    expect(w.made.map((x) => [x.msg, x.type, x.title])).toEqual([["m6", "Slideshow", "Five calls"], ["m5", "Carousel", 'Carousel: "habits"']]);
    expect(workCounters(w)).toEqual(["2 need you", "2 in flight", "2 made"]);
  });

  it("lists made work by when it finished, so a long make that ended last is on top", () => {
    const job = (startedAt: string, endedAt: string) => ({ kind: "image" as const, state: "done" as const, title: "A desk", startedAt, endedAt });
    const w = workOf([thread("t", [
      msg("slow", { job: job("2026-11-11T01:00:00.000Z", "2026-11-11T05:00:00.000Z") }),
      msg("quick", { job: job("2026-11-11T02:00:00.000Z", "2026-11-11T02:01:00.000Z") }),
    ])]);
    expect(w.made.map((x) => [x.msg, x.at])).toEqual([["slow", "2026-11-11T05:00:00.000Z"], ["quick", "2026-11-11T02:01:00.000Z"]]);
  });

  it("counts a pressed card as in flight until its result or receipt lands", () => {
    expect(inFlight(msg("a", { card: card({ status: "starting" }) }))).toBe(true);
    // most makes write their job row only when done: the approved card alone says it is being made
    expect(inFlight(msg("b", { card: card({ status: "approved" }) }))).toBe(true);
    expect(inFlight(msg("c", { card: card({ status: "approved" }), receipt: { title: "Added", line: "" } }))).toBe(false);
    expect(inFlight(msg("d", { card: card({ status: "approved" }), job: { kind: "remix", state: "done", startedAt: "" } }))).toBe(false);
    expect(inFlight(msg("e", { card: card({ status: "failed" }) }))).toBe(false);
    expect(inFlight(msg("f", { card: card({}) }))).toBe(false);
    // a Rewrite card opens Write when pressed and makes nothing in the background, so it is never in flight
    expect(inFlight(msg("g", { card: card({ status: "approved", plan: { plan: "write" } }) }))).toBe(false);
  });

  it("says so when there is nothing", () => {
    expect(workCounters(workOf([]))).toEqual(["Nothing needs you", "Nothing in flight", "Nothing made yet"]);
    expect(workCounters(workOf([thread("t", [msg("m", { card: card({}) })])]))[0]).toBe("1 needs you");
  });

  it("gives every priced card its format, cost, failure and posting rules, and an unpriced one none", () => {
    const priced = card({ price: { kind: "about", usd: 0.02 } as AgentCard["price"] });
    expect(ruleRows(priced).map((r) => r.label)).toEqual(["Format", "Cost", "If it fails", "Posting"]);
    expect(ruleRows(priced)[0].value).toBe("Carousel");
    // a campaign's writing is priced but posts nothing by itself to say so about
    expect(ruleRows(card({ kind: "campaign", plan: { plan: "campaign" }, price: priced.price })).map((r) => r.label)).toEqual(["Format", "Cost", "If it fails"]);
    expect(ruleRows(card({ kind: "learning", plan: { plan: "learning" } }))).toEqual([]);
  });
});
