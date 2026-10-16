import { describe, expect, it } from "vitest";
import { actorFor, boardCall, encodeActor, hashToken, idSet, linkStatus, maxUsesFor, nameOf, newToken, parseRequest, type InviteRow, type MemberRow } from "./logic";

const UID = "6d80f027-3395-480c-86a1-8827d3d6cce3";
const ROW: MemberRow = {
  id: "0f8fad5b-d9cb-469f-a165-70867728950e", label: "Mei", role: "commenter", brands: ["activitytracker"], modules: ["reels"],
  member_id: UID, claimed_at: "2026-10-16T00:00:00Z", revoked_at: null, created_at: "2026-10-16T00:00:00Z",
};
const LINK: InviteRow = {
  id: "11111111-2222-4333-8444-555555555555", role: "commenter", brands: ["activitytracker"], expires_at: "2026-10-20T00:00:00Z",
  max_uses: null, uses: 3, revoked_at: null, created_at: "2026-10-16T00:00:00Z",
};
const req = (b: unknown) => {
  const p = parseRequest(b);
  return p.ok ? p.req : p.error;
};

describe("who the board acts for", () => {
  it("gives Leo every brand and a member only theirs", () => {
    expect(actorFor(UID, true, null)).toEqual({ id: UID, label: "Leo", role: "owner", brands: ["*"] });
    expect(actorFor(UID, false, ROW)).toEqual({ id: UID, label: "Mei", role: "commenter", brands: ["activitytracker"] });
  });
  it("refuses anyone without a live row of their own", () => {
    expect(actorFor(UID, false, null)).toBeNull();
    expect(actorFor(UID, false, { ...ROW, revoked_at: "2026-10-16T01:00:00Z" })).toBeNull();
    expect(actorFor(UID, false, { ...ROW, member_id: "someone-else" })).toBeNull();
  });
  it("drops brands the board doesn't have, never widening to all", () => {
    expect(actorFor(UID, false, { ...ROW, brands: ["activitytracker", "*", "nope"] })!.brands).toEqual(["activitytracker"]);
  });
  it("encodes the actor as base64url JSON the board can read", () => {
    const a = actorFor(UID, false, { ...ROW, label: "Mei/Tan+?" })!;
    const s = encodeActor(a);
    expect(s).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(JSON.parse(Buffer.from(s, "base64url").toString("utf8"))).toEqual(a);
  });
});

describe("invite tokens", () => {
  it("are 43 base64url characters, different every time, stored only as a sha256", async () => {
    const t = newToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(newToken()).not.toBe(t);
    expect(await hashToken("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
  it("say whether a link still lets people in", () => {
    const now = Date.parse("2026-10-16T12:00:00Z");
    expect(linkStatus(LINK, now)).toBe("active");
    expect(linkStatus({ ...LINK, expires_at: "2026-10-10T00:00:00Z" }, now)).toBe("expired");
    expect(linkStatus({ ...LINK, max_uses: 1, uses: 1 }, now)).toBe("used");
    expect(linkStatus({ ...LINK, revoked_at: "2026-10-16T01:00:00Z" }, now)).toBe("off");
  });
  it("work for one person only when they make an approver", () => {
    expect(maxUsesFor("approver")).toBe(1);
    expect(maxUsesFor("commenter")).toBeNull();
  });
  it("name a member from their account, never blank", () => {
    expect(nameOf({ email: "mei.tan@x.com", user_metadata: { full_name: " Mei Tan " } })).toBe("Mei Tan");
    expect(nameOf({ email: "mei.tan@x.com", user_metadata: {} })).toBe("mei.tan");
    expect(nameOf({ email: null, user_metadata: null })).toBe("Team member");
    expect(nameOf({ email: "a@b.c", user_metadata: { full_name: "x".repeat(80) } })).toHaveLength(60);
  });
  it("never lets a member's name pass for Leo's, or hide characters", () => {
    expect(nameOf({ email: "sam@x.com", user_metadata: { full_name: "Leo" } })).toBe("sam");
    expect(nameOf({ email: "leo.tan@x.com", user_metadata: { full_name: "LEO Tan" } })).toBe("Team member");
    expect(nameOf({ email: "sam@x.com", user_metadata: { full_name: "\u202eoeL" } })).toBe("oeL");
    expect(nameOf({ email: "sam@x.com", user_metadata: { full_name: "Mei\u200b\nTan" } })).toBe("Mei Tan");
    expect(nameOf({ email: "sam@x.com", user_metadata: { full_name: "Leonard" } })).toBe("Leonard");
  });
  it("reads owner and deny lists", () => {
    expect([...idSet(" a, b ,,")]).toEqual(["a", "b"]);
    expect(idSet(undefined).size).toBe(0);
  });
});

describe("requests", () => {
  it("passes only the five card fields, as strings", () => {
    expect(req({ action: "card", id: "a~carousel", patch: { stage: "approved", by: "leo", ig: { state: "posted" } } }))
      .toEqual({ action: "card", id: "a~carousel", patch: { stage: "approved" } });
    expect(req({ action: "card", id: "a", patch: { schedule: 5 } })).toBe("That change isn't valid.");
    expect(req({ action: "card", id: "a", patch: {} })).toBe("Nothing to change.");
    expect(req({ action: "card", patch: { stage: "review" } })).toBe("Which post?");
  });
  it("never lets a note carry its own author", () => {
    expect(req({ action: "comment", id: "a", text: " hi ", by: { id: "leo" }, slide: 3 })).toEqual({ action: "comment", id: "a", text: "hi", t: null, slide: 3 });
    expect(req({ action: "comment", id: "a", text: "x".repeat(2001) })).toBe("A note is 1 to 2000 characters.");
  });
  it("checks links: a member role and known brands, no name", () => {
    expect(req({ action: "team.invite", label: "ignored", role: "approver", brands: ["activitytracker", "activitytracker"] }))
      .toEqual({ action: "team.invite", role: "approver", brands: ["activitytracker"] });
    expect(req({ action: "team.invite", role: "owner", brands: ["activitytracker"] })).toBe("Pick a role.");
    expect(req({ action: "team.invite", role: "viewer", brands: ["*"] })).toBe("Pick at least one brand.");
    expect(req({ action: "team.invite", role: "viewer", brands: [] })).toBe("Pick at least one brand.");
    expect(req({ action: "team.linkOff", id: "x" })).toBe("Which link?");
  });
  it("needs a real id to change, revoke or re-invite someone", () => {
    expect(req({ action: "team.revoke", id: "1 or 1=1" })).toBe("Which person?");
    expect(req({ action: "team.update", id: ROW.id })).toBe("Nothing to change.");
    expect(req({ action: "team.update", id: ROW.id, role: "editor" })).toEqual({ action: "team.update", id: ROW.id, role: "editor" });
  });
  it("only claims a whole token", () => {
    expect(req({ action: "claim", token: newToken() })).toMatchObject({ action: "claim" });
    expect(req({ action: "claim", token: "short" })).toBe("This invite link isn't complete. Open the whole link Leo sent.");
  });
  it("refuses unknown actions", () => {
    expect(req({ action: "team.delete" })).toBe("Unknown action.");
    expect(req(null)).toBe("Unknown action.");
  });
});

describe("board paths", () => {
  it("escapes card and note ids", () => {
    expect(boardCall({ action: "card", id: "a~b&op=resolve", patch: { stage: "review" } }).path).toBe("/api/card?id=a~b%26op%3Dresolve");
    expect(boardCall({ action: "resolve", id: "a", cid: "x&y", resolved: true }))
      .toEqual({ path: "/api/card?id=a&op=resolve&cid=x%26y", body: { resolved: true } });
    expect(boardCall({ action: "board" })).toEqual({ path: "/api/board" });
    expect(boardCall({ action: "endorse", id: "a~b", cid: "n1" })).toEqual({ path: "/api/card?id=a~b&op=endorse&cid=n1", body: {} });
    expect(req({ action: "endorse", id: "a" })).toBe("Which note?");
  });
});
