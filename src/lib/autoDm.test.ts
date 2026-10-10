import { describe, expect, it } from "vitest";
import { scanCompliance } from "./compliance";
import { STARTERS, applyStarter, emptyForm, fillName, formFlags, formProblem, logLine, toInput, type LogView } from "./autoDm";

const IG = "65000000000000000000a001";

describe("starting points", () => {
  it("are plain and compliant: no flags, no figures, no links of ours", () => {
    for (const s of STARTERS) {
      const all = [s.dm, s.button, s.reply, ...s.replyVariations].join("\n");
      expect(scanCompliance(all), s.id).toEqual([]);
      // the chat's length is the one number; no money, returns or links
      expect(all.replace("15-minute", ""), s.id).not.toMatch(/[$%\d]|https?:|www\./i);
    }
  });

  it("leave the link for the adviser to type, so the form can't save without it", () => {
    const f = applyStarter(emptyForm(IG), STARTERS[2], "instagram");
    expect(f.buttons).toEqual([{ title: "Pick a time", url: "" }]);
    expect(formProblem(f, "instagram")).toBe('Add your own link to "Pick a time", starting with https://.');
    expect(formProblem({ ...f, buttons: [{ title: "Pick a time", url: "https://calendly.com/me" }] }, "instagram")).toBeNull();
  });

  it("keep a keyword brought from Write, and fill only the public reply where there is no DM", () => {
    expect(applyStarter(emptyForm(IG, "PLAN"), STARTERS[0], "instagram", "PLAN").keywordsText).toBe("PLAN");
    expect(applyStarter(emptyForm(IG), STARTERS[0], "instagram").keywordsText).toBe("GUIDE");
    const tt = applyStarter(emptyForm(IG), STARTERS[0], "tiktok");
    expect([tt.dm, tt.buttons, tt.alsoMatchInDms]).toEqual(["", [], false]);
    expect(formProblem(tt, "tiktok")).toBeNull();
  });
});

describe("the form", () => {
  const filled = { ...emptyForm(IG, "GUIDE"), dm: "Hi {{first_name}}", reply: "Sent!", alsoMatchInDms: true, followGate: true };

  it("sends only what this platform shows", () => {
    expect(toInput({ ...filled, buttons: [{ title: "Go", url: "https://a.sg" }] }, "tiktok")).toMatchObject({ dm: "", buttons: [], alsoMatchInDms: false, followGate: false, reply: "Sent!" });
    expect(toInput(filled, "facebook")).toMatchObject({ dm: "Hi {{first_name}}", alsoMatchInDms: true, followGate: false });
    expect(toInput({ ...filled, trigger: "story_mention", platformPostId: "1" }, "instagram")).toMatchObject({ keywords: [], reply: "", platformPostId: null, alsoMatchInDms: false });
    expect(toInput({ ...filled, everyComment: true }, "instagram")).toMatchObject({ keywords: [], everyComment: true, alsoMatchInDms: false });
    expect(formProblem(filled, "tiktok")).toBeNull();
    expect(formProblem({ ...filled, accountId: "" }, "instagram")).toBe("Pick the account first.");
  });

  it("flags compliance in the DM, its buttons and the public replies", () => {
    const f = { ...filled, dm: "A risk-free plan", buttons: [{ title: "Act now", url: "https://a.sg" }], replyVariations: ["Guaranteed!"] };
    expect(formFlags(f, "instagram").map((x) => x.ruleId).sort()).toEqual(["act-now", "guarantee", "risk-free"]);
    // TikTok sends no DM, so its words aren't checked
    expect(formFlags(f, "tiktok").map((x) => x.ruleId)).toEqual(["guarantee"]);
  });

  it("previews the commenter's name", () => {
    expect(fillName("Hi {{first_name}} ({{ username }}), {{name}}")).toBe("Hi Sarah (sarah.tan), Sarah Tan");
  });
});

describe("who got it", () => {
  const log = (extra: Partial<LogView>): LogView => ({ id: "1", who: "@a", said: "GUIDE", status: "sent", reason: "", reply: "", replyReason: "", at: "", clicked: false, ...extra });

  it("says what happened, with the reason when it didn't", () => {
    expect(logLine(log({ clicked: true }), "instagram")).toEqual({ text: "Sent, clicked", ok: true });
    expect(logLine(log({ status: "failed", reason: "User has DMs off" }), "facebook")).toEqual({ text: "Failed: User has DMs off", ok: false });
    expect(logLine(log({ status: "gated" }), "instagram").text).toBe("Asked to confirm they follow");
    expect(logLine(log({ status: "skipped", reason: "Already sent" }), "instagram")).toEqual({ text: "Skipped: Already sent", ok: false });
    // reply-only platforms answer with the public reply
    expect(logLine(log({ status: "skipped", reply: "sent" }), "tiktok")).toEqual({ text: "Replied", ok: true });
    expect(logLine(log({ reply: "failed", replyReason: "Comment deleted" }), "youtube")).toEqual({ text: "Reply failed: Comment deleted", ok: false });
  });
});
