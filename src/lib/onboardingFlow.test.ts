import { describe, expect, it } from "vitest";
import type { BrandDna } from "@/lib/addBrand";
import {
  afterNetworks, back, backStep, canConfirm, confirmSection, firstTopic, flowKey, mainPlatform, newFlow, noSite, parseFlow, patchDraft, progress, readDone,
  readFailed, reopenSection, reviewLine, shouldRun, stopWaiting, submitNoSite, submitSite, toggleNetwork, type Flow,
} from "./onboardingFlow";

const dna: BrandDna = {
  url: "https://acme.sg", name: "Acme", colour: "#112233", logo: null, handles: { instagram: "acme.sg", linkedin: "company/acme" },
  oneLiner: "We fix bikes.", audience: "working-adult", audienceDetail: "Commuters", topics: ["Repairs", "Routes"], edge: "", voice: "Plain and warm.",
};
const site = (f: Flow, typed: string, now: number) => submitSite({ ...f, typed }, now);
const reading = (f: Flow = newFlow()) => afterNetworks(site(f, " acme.sg ", 1000));

describe("who gets the flow", () => {
  it("runs for a new account with no answer to What do you do?, and for one part way through", () => {
    expect(shouldRun(false, false, null)).toBe(true);
    expect(shouldRun(false, true, reading())).toBe(true);
  });
  it("leaves onboarded accounts, and brands that already answered, on the page they had", () => {
    expect(shouldRun(true, false, null)).toBe(false);
    expect(shouldRun(true, false, reading())).toBe(false);
    expect(shouldRun(false, true, null)).toBe(false);
  });
});

describe("the website path", () => {
  it("starts the read on submit and moves to the networks, then waits only while it runs", () => {
    const f = site(newFlow(), " acme.sg ", 1000);
    expect(f).toMatchObject({ step: "networks", address: "acme.sg", read: "running", readAt: 1000 });
    expect(afterNetworks(f).step).toBe("reading");
    expect(afterNetworks(readDone(f, dna)).step).toBe("review");
  });
  it("ignores an empty address", () => {
    expect(site(newFlow(), "  ", 1)).toEqual({ ...newFlow(), typed: "  " });
  });
  it("fills the review and ticks the networks the site names when the read lands, and ends the wait", () => {
    const f = readDone(toggleNetwork(reading(), "tiktok"), dna);
    expect(f.step).toBe("review");
    expect(f.networks).toEqual(["instagram", "tiktok", "linkedin"]);
    expect(f.draft).toMatchObject({ name: "Acme", oneLiner: "We fix bikes.", audience: "working-adult", colour: "#112233", topics: "Repairs, Routes", voice: "Plain and warm." });
  });
  it("a read that lands on the networks screen stays there", () => {
    expect(readDone(site(newFlow(), "acme.sg", 1), dna).step).toBe("networks");
  });
  it("never writes over what was typed", () => {
    const f = readDone(patchDraft(stopWaiting(reading()), { name: "My name", topics: "Mine" }), dna);
    expect(f.step).toBe("review");
    expect(f.draft).toMatchObject({ name: "My name", topics: "Mine", oneLiner: "We fix bikes." });
  });
  it("does not read the same address twice, and a new address starts over but keeps what the person does", () => {
    const done = patchDraft(readDone(reading(), dna), { profession: "Bike mechanic" });
    expect(site(back(back(done)), "acme.sg", 5)).toMatchObject({ read: "ok", step: "networks", draft: { name: "Acme" } });
    expect(site(confirmSection(done, "brand", false), "other.sg", 5)).toMatchObject({ read: "running", readAt: 5, confirmed: [], draft: { name: "", profession: "Bike mechanic" } });
  });
});

describe("a failed read", () => {
  it("says so, names the brand from the address and carries on to the review by hand", () => {
    const f = readFailed(reading(), "We couldn't open acme.sg. Check the address and try again.");
    expect(f).toMatchObject({ step: "review", read: "failed", readError: "We couldn't open acme.sg. Check the address and try again." });
    expect(f.draft.name).toBe("Acme");
    expect(f.draft.oneLiner).toBe("");
  });
  it("reads the same address again on a second try without dropping what was typed since", () => {
    const typed = patchDraft(readFailed(reading(), "no"), { name: "Acme Bikes", oneLiner: "Typed by hand" });
    const again = site(back(back(typed)), "acme.sg", 9);
    expect(again).toMatchObject({ read: "running", readAt: 9, readError: "", draft: { name: "Acme Bikes", oneLiner: "Typed by hand" } });
    expect(readDone(again, dna).draft).toMatchObject({ name: "Acme Bikes", oneLiner: "Typed by hand", voice: "Plain and warm." });
  });
  it("does nothing once the read has answered", () => {
    const f = readDone(reading(), dna);
    expect(readFailed(f, "late")).toBe(f);
    expect(readDone(f, { ...dna, name: "Twice" })).toBe(f);
  });
});

describe("the no-website path", () => {
  it("asks a name and what you do, then goes on with no read and empty fields", () => {
    const asked = noSite(newFlow());
    expect(asked.step).toBe("nosite");
    expect(submitNoSite(asked)).toBe(asked);
    expect(submitNoSite(patchDraft(asked, { name: "Ana" }))).toMatchObject({ step: "nosite" });
    const f = submitNoSite(patchDraft(asked, { name: "Ana", profession: "Photographer" }));
    expect(f).toMatchObject({ step: "networks", read: "none", address: "" });
    expect(afterNetworks(f).step).toBe("review");
    expect(afterNetworks(f).draft).toMatchObject({ name: "Ana", profession: "Photographer", oneLiner: "", topics: "" });
    expect(backStep(f)).toBe("nosite");
  });
  it("keeps the name and what you do when a website is given after all", () => {
    const f = site(back(patchDraft(noSite(newFlow()), { name: "Ana", profession: "Photographer" })), "ana.sg", 3);
    expect(f).toMatchObject({ step: "networks", read: "running", draft: { name: "Ana", profession: "Photographer" } });
  });
});

describe("the review", () => {
  const filled = patchDraft(readDone(reading(), dna), { profession: "Bike mechanic" });
  it("will not confirm Brand without a name and what the person does", () => {
    const f = readDone(reading(), dna);
    expect(canConfirm(f, "brand")).toBe(false);
    expect(confirmSection(f, "brand", false)).toBe(f);
    expect(canConfirm(f, "look")).toBe(true);
  });
  it("names what is left and the next gain", () => {
    expect(reviewLine(filled)).toEqual({ pct: 0, line: "0% set up. Confirm Brand to reach 33%." });
    expect(reviewLine(confirmSection(filled, "brand", false))).toEqual({ pct: 33, line: "33% set up. Confirm Look to reach 67%." });
  });
  it("finishes after the last section, through Connect only when this account may connect", () => {
    const two = confirmSection(confirmSection(filled, "brand", true), "look", true);
    expect(two.step).toBe("review");
    expect(confirmSection(two, "voice", true).step).toBe("connect");
    expect(confirmSection(two, "voice", false).step).toBe("done");
  });
  it("opens a confirmed section again without losing the others", () => {
    const two = confirmSection(confirmSection(filled, "brand", false), "look", false);
    expect(reopenSection(two, "brand").confirmed).toEqual(["look"]);
  });
});

describe("back", () => {
  it("changes the screen only: every typed value and confirmed section stays", () => {
    const f = confirmSection(patchDraft(readDone(reading(), dna), { profession: "Bike mechanic" }), "brand", false);
    const b = back(f);
    expect(b.step).toBe("networks");
    expect({ ...b, step: f.step }).toEqual(f);
    expect(back(b).step).toBe("website");
    expect(back(back(b)).address).toBe("acme.sg");
  });
  it("has nothing behind the first screen or the finish", () => {
    expect(backStep(newFlow())).toBeNull();
    expect(backStep({ ...newFlow(), step: "done" })).toBeNull();
    expect(backStep({ ...newFlow(), step: "connect" })).toBe("review");
  });
});

describe("resume", () => {
  it("comes back from storage on the same step with every value", () => {
    const f = { ...toggleNetwork(patchDraft(readDone(reading(), dna), { profession: "Bike mechanic" }), "youtube"), goalKind: "clients" as const, cadence: 5 };
    expect(parseFlow(JSON.stringify(f))).toEqual(f);
    expect(parseFlow(JSON.stringify(reading()))).toMatchObject({ step: "reading", read: "running", address: "acme.sg" });
  });
  it("reads nothing, junk or another shape as no flow, and drops values it does not know", () => {
    expect(parseFlow(null)).toBeNull();
    expect(parseFlow("{")).toBeNull();
    expect(parseFlow(JSON.stringify({ v: 2, step: "website" }))).toBeNull();
    expect(parseFlow(JSON.stringify({ v: 1, step: "nowhere" }))).toBeNull();
    expect(parseFlow(JSON.stringify({ v: 1, step: "review", networks: ["x", "threads"], confirmed: ["look", "pets"], goalKind: "fame", draft: { audience: "cats" } }))).toMatchObject({
      networks: ["threads"], confirmed: ["look"], goalKind: "", cadence: 0, draft: { audience: "general", name: "", handles: {} },
    });
  });
  it("is kept under the synced prefix", () => {
    expect(flowKey("u1")).toBe("content-studio-onboarding-u1");
  });
});

describe("the bar, the plan's network and the first topic", () => {
  it("counts the Connect screen only for accounts that get it", () => {
    expect(progress(newFlow(), false)).toEqual({ at: 1, of: 4 });
    expect(progress(reading(), true)).toEqual({ at: 2, of: 5 });
    expect(progress({ ...newFlow(), step: "done" }, false)).toEqual({ at: 4, of: 4 });
  });
  it("keeps the plan under the first network picked that a plan can be for", () => {
    expect(mainPlatform(toggleNetwork(toggleNetwork(newFlow(), "threads"), "tiktok"), "linkedin")).toBe("tiktok");
    expect(mainPlatform(toggleNetwork(newFlow(), "youtube"), "linkedin")).toBe("linkedin");
  });
  it("starts the first post on the brand's first topic", () => {
    expect(firstTopic(patchDraft(newFlow(), { topics: " Repairs , Routes" }))).toBe("Repairs");
    expect(firstTopic(newFlow())).toBe("");
  });
});
