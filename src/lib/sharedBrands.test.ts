import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { acceptRefusal, brandKeys, inviteToken, lostMessage, teamLines, type TeamRow, localId, READ_ONLY_PREFIXES, readSharedBrands, scopeOf, SHARED_CACHE, SHARED_PREFIXES, writeSharedBrands, type SharedBrand } from "./sharedBrands";

const OWNER = "6d80f027-3395-480c-86a1-8827d3d6cce3";
const BRAND = "0f8fad5b-d9cb-469f-a165-70867728950e";

const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
};

describe("the allow-list", () => {
  // 037 enforces it; this file decides what a member's device syncs. They must be the same two lists.
  const sql = readFileSync(new URL("../../supabase/hub/037_shared_brands.sql", import.meta.url), "utf8");
  const list = (marker: string) => [...(sql.split(marker)[1].split("]")[0].matchAll(/'([^']+)'/g))].map((m) => m[1]);

  it("is 037's, read-write and read-only alike", () => {
    expect([...SHARED_PREFIXES].sort()).toEqual(list("/* read-write */").sort());
    expect([...READ_ONLY_PREFIXES].sort()).toEqual(list("/* read-only */").sort());
  });

  it("keeps credentials, the outbox and the owner's tombstones out, and the brand kit read-only", () => {
    const all = [...SHARED_PREFIXES, ...READ_ONLY_PREFIXES];
    for (const p of ["content-studio-mcplink-", "content-studio-mcprevoked-", "content-studio-zernio-outbox-", "content-studio-tombstones-", "content-studio-profiles-", "content-studio-socialaccounts-"]) {
      expect(all, p).not.toContain(p);
    }
    expect(SHARED_PREFIXES).not.toContain("content-studio-carousel-brand-");
    expect(READ_ONLY_PREFIXES).toContain("content-studio-carousel-brand-");
  });

  it("names a brand's keys exactly: the owner's id for the default brand, owner~profile for the rest", () => {
    expect(scopeOf(OWNER, "me")).toBe(OWNER);
    expect(scopeOf(OWNER, "pabc1")).toBe(`${OWNER}~pabc1`);
    expect(brandKeys(`${OWNER}~pabc1`, true)).toContain(`content-studio-drafts-${OWNER}~pabc1`);
    expect(brandKeys(`${OWNER}~pabc1`, true)).not.toContain(`content-studio-carousel-brand-${OWNER}~pabc1`);
    expect(brandKeys(`${OWNER}~pabc1`, false)).toContain(`content-studio-carousel-brand-${OWNER}~pabc1`);
  });
});

describe("the shared brands kept on this device", () => {
  const row: SharedBrand = { brand: BRAND, owner: OWNER, profile: "pabc1", name: "Acme", role: "member" };

  it("live outside the sync prefix, per account", () => {
    expect(SHARED_CACHE.startsWith("content-studio-")).toBe(false);
    const s = memory();
    writeSharedBrands("u1", [row], s);
    expect(readSharedBrands("u1", s)).toEqual([row]);
    expect(readSharedBrands("u2", s)).toEqual([]);
  });

  it("drop anything malformed rather than open it", () => {
    const s = memory();
    s.setItem(`${SHARED_CACHE}u1`, JSON.stringify([row, { brand: "x" }, { ...row, owner: "not-a-uuid" }, { ...row, profile: "s123" }, null]));
    expect(readSharedBrands("u1", s)).toEqual([row]);
    s.setItem(`${SHARED_CACHE}u1`, "{not json");
    expect(readSharedBrands("u1", s)).toEqual([]);
  });

  it("each get a local id that can't clash with the account's own brands", () => {
    expect(localId(BRAND)).toBe("s0f8fad5bd9cb469fa16570867728950e");
    expect(localId(BRAND)).not.toMatch(/-/);
  });
});

describe("taking an invite", () => {
  it("says what went wrong in plain words", () => {
    expect(acceptRefusal("invite_gone")).toBe("This invite has expired or was already used. Ask for a new one.");
    expect(acceptRefusal("wrong_account")).toBe("This invite was sent to another email. Sign in with that one.");
    expect(acceptRefusal("owner_self")).toBe("This brand is already yours.");
    expect(acceptRefusal("anything else")).toBe("Couldn't join just now. Try again in a minute.");
  });
});

describe("the team list", () => {
  const NOW = Date.parse("2026-11-14T12:00:00Z");
  const row = (r: Partial<TeamRow>): TeamRow => ({ kind: "member", id: "x", email: "x@example.sg", at: "2026-11-01T00:00:00Z", expires_at: null, last_edit: null, ...r });

  it("puts the owner first, then people who joined, then live invites, then expired ones", () => {
    const lines = teamLines([
      row({ kind: "invite", id: "i2", email: "old@example.sg", expires_at: "2026-11-13T00:00:00Z" }),
      row({ kind: "invite", id: "i1", email: "new@example.sg", expires_at: "2026-11-20T12:00:00Z" }),
      row({ kind: "member", id: "m1", email: "mei@example.sg", last_edit: "2026-11-14T09:00:00Z" }),
      row({ kind: "owner", id: "o", email: "leo@example.sg" }),
    ], NOW);
    expect(lines.map((l) => [l.status, l.email, l.note])).toEqual([
      ["Owner", "leo@example.sg", ""],
      ["Joined", "mei@example.sg", "Last edit 3 h ago"],
      ["Invited", "new@example.sg", "Link works for 6 more days"],
      ["Expired", "old@example.sg", "The link ran out"],
    ]);
  });

  it("says when someone hasn't changed anything yet", () => {
    expect(teamLines([row({})], NOW)[0].note).toBe("No edits yet");
  });

  it("tells the person why a save didn't land", () => {
    expect(lostMessage("conflict")).toBe("Your last change didn't save: someone else on this brand changed it first.");
    expect(lostMessage("held_post")).toBe("That post is scheduled to go out, so only the brand's owner can change it.");
  });
});

describe("the invite token on the join page", () => {
  const T = "A".repeat(43);
  it("comes from the link's fragment first, then from this device", () => {
    expect(inviteToken(`#${T}`, null)).toBe(T);
    expect(inviteToken("", T)).toBe(T);
    expect(inviteToken(`#${T}`, "B".repeat(43))).toBe(T);
  });
  it("is nothing when neither is a token", () => {
    expect(inviteToken("#access_token=abc", null)).toBeNull();
    expect(inviteToken("", "short")).toBeNull();
  });
});
