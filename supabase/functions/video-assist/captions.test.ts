import { describe, expect, it } from "vitest";
import { PLATFORM_RULES, buildCaptionsMessages, capHashtags, parseCaptionsReply, parseCaptionsRequest } from "./captions";
import { countHashtags } from "../../../src/lib/platformCounters";

const talk = "Most people think their company insurance is enough. I reviewed 40 young families this year.";

describe("captions request", () => {
  it("needs what is said; the Instagram caption and title are optional", () => {
    const r = parseCaptionsRequest({ transcript: ` ${talk} `, instagram: "IG caption #cpf", title: "  Hospital   cover " });
    expect(r).toEqual({ ok: true, transcript: talk, instagram: "IG caption #cpf", title: "Hospital cover", rules: "" });
    expect(parseCaptionsRequest({ transcript: "too short" }).ok).toBe(false);
  });
  it("tells the writer each platform's shape and hashtag limit", () => {
    const [system, user] = buildCaptionsMessages(talk, "IG caption", "");
    for (const p of Object.values(PLATFORM_RULES)) expect(system.content).toContain(p.shape);
    expect(user.content).toContain("IG caption");
    expect(user.content).not.toContain("Video title");
  });
  it("passes the brand kit's rules line to the writer when one is sent", () => {
    const rules = "MY BRAND RULES (these win over any other emoji, hashtag or link guidance): Use no emoji at all.";
    const r = parseCaptionsRequest({ transcript: talk, rules: `${rules}\n` });
    expect(r.ok && r.rules).toBe(rules);
    expect(buildCaptionsMessages(talk, "", "", rules)[0].content).toContain(rules);
    expect(buildCaptionsMessages(talk, "", "")[0].content).not.toContain("BRAND RULES");
  });
});

describe("the limits", () => {
  it("keeps the first hashtags up to the limit and tidies the gap", () => {
    expect(capHashtags("Line one.\n\n#a #b #c #d", 2)).toBe("Line one.\n\n#a #b");
    expect(capHashtags("Check #cpf now #a #b", 1)).toBe("Check #cpf now");
    expect(capHashtags("No tags here", 3)).toBe("No tags here");
    expect(capHashtags("Line one.\n\n#a\n\nNext", 0)).toBe("Line one.\n\nNext");
    expect(capHashtags("Tip #x \nMore", 0)).toBe("Tip\nMore");
  });
  it("each platform's reply comes back inside its own limits, without em dashes", () => {
    const tags = (n: number) => Array.from({ length: n }, (_, i) => `#tag${i}`).join(" ");
    const out = parseCaptionsReply(JSON.stringify({ tiktok: `Short line — really ${tags(9)}`, linkedin: `Long post\n\n${tags(6)}`, facebook: `Post ${tags(4)}`, instagram: "ignored" }))!;
    expect(countHashtags(out.tiktok!)).toBe(5);
    expect(countHashtags(out.linkedin!)).toBe(3);
    expect(countHashtags(out.facebook!)).toBe(2);
    expect(out.tiktok).toMatch(/^Short line, really/);
    expect(Object.keys(out)).toEqual(["tiktok", "linkedin", "facebook"]);
    expect(parseCaptionsReply(JSON.stringify({ tiktok: "x".repeat(3000) }))!.tiktok).toHaveLength(2200);
    expect(parseCaptionsReply("nope")).toBeNull();
    expect(parseCaptionsReply("{}")).toBeNull();
  });
});
