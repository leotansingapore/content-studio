import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { cleanEmail, cleanText, hashToken, inviteEmail, inviteRefusal, inviterName, JOIN_URL, newToken, parseRequest } from "./logic";

const ok = (b: unknown) => {
  const p = parseRequest(b);
  if (!p.ok) throw new Error(p.error);
  return p.req;
};

describe("the invite token", () => {
  it("is 32 random bytes in base64url, different every time", () => {
    const a = newToken();
    const b = newToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
  });

  it("is stored as the hex sha256 the database computes (037: encode(sha256(convert_to(token, 'UTF8')), 'hex'))", async () => {
    const t = newToken();
    expect(await hashToken(t)).toBe(createHash("sha256").update(t, "utf8").digest("hex"));
    expect(await hashToken("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});

describe("the address", () => {
  it("is trimmed and lower-cased", () => {
    expect(cleanEmail("  Mei.Tan@Example.SG ")).toBe("mei.tan@example.sg");
  });

  it("refuses anything that isn't one plain address", () => {
    for (const bad of ["", "mei", "mei@", "@example.sg", "mei@example", "mei tan@example.sg", "a@b.c", "mei@example.sg, x@y.sg", 42, null, `${"a".repeat(250)}@example.sg`]) {
      expect(cleanEmail(bad), String(bad)).toBeNull();
    }
  });
});

describe("names in the email", () => {
  it("lose line breaks and control characters, so nobody can write their own email body", () => {
    expect(cleanText("Acme\r\nBcc: you@x.sg\u0000", 40)).toBe("Acme Bcc: you@x.sg");
    expect(cleanText("  two   spaces ", 40)).toBe("two spaces");
    expect(cleanText("x".repeat(80), 40)).toHaveLength(40);
    expect(cleanText(undefined, 40)).toBe("");
  });

  it("names the inviter by their name, else the start of their email", () => {
    expect(inviterName({ email: "leo@example.sg", user_metadata: { full_name: "Leo Tan" } })).toBe("Leo Tan");
    expect(inviterName({ email: "leo.tan@example.sg", user_metadata: {} })).toBe("leo.tan");
    expect(inviterName({ email: undefined, user_metadata: { name: "\n" } })).toBe("Someone");
  });

  it("are plain text with the join link, and no credential beyond the one-time invite", () => {
    const token = newToken();
    const mail = inviteEmail({ inviter: "Leo Tan", brand: "Acme", token });
    expect(mail.subject).toBe("Leo Tan invited you to Acme on Postmosis");
    expect(mail.text).toContain(`${JOIN_URL}#${token}`);
    expect(JOIN_URL).toBe("https://app.postmosis.com/brands/join");
    // ASCII only, no em dashes (house rule for anything people read)
    expect(/^[\x09\x0a\x20-\x7e]*$/.test(mail.subject + mail.text)).toBe(true);
  });
});

describe("requests", () => {
  it("reads an invite, a start and a covered check", () => {
    expect(ok({ action: "invite", profileId: "pabc12", name: " Acme ", email: "Mei@Example.sg" })).toEqual({ action: "invite", profileId: "pabc12", name: "Acme", email: "mei@example.sg" });
    expect(ok({ action: "invite", profileId: "me", name: "Me", email: "mei@example.sg" })).toMatchObject({ profileId: "me" });
    const t = newToken();
    expect(ok({ action: "start", token: t })).toEqual({ action: "start", token: t });
    expect(ok({ action: "covered" })).toEqual({ action: "covered" });
  });

  it("refuses a bad brand, name, address, demo address, token or action in plain words", () => {
    const refused = (b: unknown) => {
      const p = parseRequest(b);
      return p.ok ? null : { status: p.status, error: p.error };
    };
    expect(refused({ action: "invite", profileId: "s0123", name: "X", email: "mei@example.sg" })).toMatchObject({ status: 400 });
    expect(refused({ action: "invite", profileId: "pabc", name: "  ", email: "mei@example.sg" })).toMatchObject({ status: 400 });
    expect(refused({ action: "invite", profileId: "pabc", name: "Acme", email: "nope" })).toEqual({ status: 400, error: "That doesn't look like an email address." });
    expect(refused({ action: "invite", profileId: "pabc", name: "Acme", email: "user@demo.com" })).toEqual({ status: 400, error: "Demo addresses can't be invited." });
    expect(refused({ action: "start", token: "short" })).toMatchObject({ status: 400 });
    expect(refused({ action: "steal" })).toMatchObject({ status: 400 });
    expect(refused(null)).toMatchObject({ status: 400 });
  });
});

describe("what the database refuses, in words", () => {
  it("maps each refusal and keeps anything else generic", () => {
    expect(inviteRefusal("owner_self")).toEqual({ status: 400, error: "That's your own email." });
    expect(inviteRefusal("recipient_cap")).toMatchObject({ status: 429 });
    expect(inviteRefusal("team_full")).toEqual({ status: 409, error: "Your team is full: 10 people across your brands. Remove someone to invite another." });
    expect(inviteRefusal("not_owner")).toMatchObject({ status: 403 });
    expect(inviteRefusal("connection reset")).toBeNull();
  });
});
