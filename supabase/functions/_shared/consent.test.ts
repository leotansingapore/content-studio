import { describe, expect, it, vi } from "vitest";
import { CONSENT_LABEL, CONSENT_LINE, consentSecret, heardCode, newCode, openSigned, signFor } from "./consent";
import { hmacHex, jobToken, tokenSecret } from "../ai-image/logic";

const A = "6f1c2d3e-0000-4000-8000-00000000000a";
const B = "6f1c2d3e-0000-4000-8000-00000000000b";
const ticket = (code: string, day: string) => `consent:face:${code}:${day}`;
// one character of the token swapped for another valid one, at position i
const changed = (t: string, i: number) => t.slice(0, i) + (t[i] === "A" ? "B" : t[i] === "0" ? "1" : t[i] === "a" ? "b" : "A") + t.slice(i + 1);

describe("signed consent records", () => {
  it("opens for the uid it was signed for, with the text exactly as signed", async () => {
    const s = await consentSecret("service-role-key");
    const text = ticket("4821", "2026-10-21");
    expect(await openSigned(s, A, await signFor(s, A, text))).toBe(text);
    const face = `likeness:face:${"ab".repeat(32)}:2026-10-21T09:15:00.000Z`;
    expect(await openSigned(s, A, await signFor(s, A, face))).toBe(face);
  });

  it("gives null for another uid, so one of Leo's sign-ins can't use the other's record", async () => {
    const s = await consentSecret("service-role-key");
    expect(await openSigned(s, B, await signFor(s, A, ticket("4821", "2026-10-21")))).toBeNull();
  });

  it("opens another day's ticket only as that day's text, never as today's", async () => {
    const s = await consentSecret("service-role-key");
    const yesterday = await signFor(s, A, ticket("4821", "2026-10-20"));
    // ai-video compares the opened text with today's ticket text, so yesterday's code is refused
    expect(await openSigned(s, A, yesterday)).toBe(ticket("4821", "2026-10-20"));
    expect(await openSigned(s, A, yesterday)).not.toBe(ticket("4821", "2026-10-21"));
  });

  it("gives null when any one character is changed, the text's last one included", async () => {
    const s = await consentSecret("service-role-key");
    const t = await signFor(s, A, ticket("4821", "2026-10-21"));
    for (let i = 0; i < t.length; i++) if (t[i] !== ".") expect(await openSigned(s, A, changed(t, i))).toBeNull();
    // "YQ" and "YR" both decode to "a" in a lenient decoder; only signFor's spelling opens
    const short = await signFor(s, A, "a");
    expect(short.startsWith("YQ.")).toBe(true);
    expect(await openSigned(s, A, "YR" + short.slice(2))).toBeNull();
  });

  it("refuses anything that isn't a token", async () => {
    const s = await consentSecret("service-role-key");
    const t = await signFor(s, A, "x");
    for (const bad of ["", ".", t.split(".")[0], `${t}.`, t.toUpperCase(), `${t.split(".")[0]}=.${t.split(".")[1]}`, `%%%.${"0".repeat(64)}`, `A.${t.split(".")[1]}`])
      expect(await openSigned(s, A, bad)).toBeNull();
  });

  it("keeps an ElevenLabs-style voice id with capitals as it was", async () => {
    const s = await consentSecret("service-role-key");
    const text = "likeness:voice:Xb7hH8MSUJpSbSDYk0k2:2026-10-21T09:15:00.000Z";
    expect(await openSigned(s, A, await signFor(s, A, text))).toBe(text);
  });

  it("never opens a job token as consent: its own label makes its own secret", async () => {
    const job = await tokenSecret("service-role-key");
    const consent = await consentSecret("service-role-key");
    expect(consent).toBe(await hmacHex("service-role-key", CONSENT_LABEL));
    expect(consent).not.toBe(job);
    const id = "0b9c2a4e-5d6f-4a1b-8c3d-9e8f7a6b5c4d";
    expect(await openSigned(consent, A, await jobToken(job, A, id))).toBeNull();
    // a record signed with the job secret doesn't open as consent either
    expect(await openSigned(consent, A, await signFor(job, A, ticket("4821", "2026-10-21")))).toBeNull();
  });
});

describe("the spoken code", () => {
  it("is 4 digits from crypto.getRandomValues, leading zeros kept", () => {
    for (let i = 0; i < 200; i++) expect(newCode()).toMatch(/^\d{4}$/);
    const spy = vi.spyOn(crypto, "getRandomValues").mockImplementation(<T extends ArrayBufferView | null>(a: T) => {
      (a as unknown as Uint32Array)[0] = 42;
      return a;
    });
    expect(newCode()).toBe("0042");
    spy.mockRestore();
  });

  it("draws again past the last whole 10,000, so no code comes up more often", () => {
    const draws = [4_294_967_295, 4_294_960_000, 4_294_959_999];
    const spy = vi.spyOn(crypto, "getRandomValues").mockImplementation(<T extends ArrayBufferView | null>(a: T) => {
      (a as unknown as Uint32Array)[0] = draws.shift()!;
      return a;
    });
    expect(newCode()).toBe("9999");
    expect(draws).toEqual([]);
    spy.mockRestore();
  });

  it("is heard as numerals or words, with commas, dots, hyphens and spaces", () => {
    for (const heard of ["4821", "4,821", "4 8 2 1", "four eight two one", "Four, eight, two, one.", "4-8-2-1", "four-eight-two-one", "48 21"])
      expect(heardCode(heard, "4821"), heard).toBe(true);
    expect(heardCode("I'm the person on camera. I agree that Postmosis can make videos of my face. My code is 4, 8, 2, 1.", "4821")).toBe(true);
    expect(heardCode("My code is zero zero four two.", "0042")).toBe(true);
  });

  it("is refused out of order, cut by another word, or missing", () => {
    for (const heard of ["4812", "4 8 1 2", "four eight one two", "48 and 21", "482", "", "My code is.", "for ate to won"])
      expect(heardCode(heard, "4821"), heard).toBe(false);
    // a code that isn't 4 digits is never heard
    expect(heardCode("482", "482")).toBe(false);
    expect(heardCode("4821", "")).toBe(false);
  });
});

describe("the consent line", () => {
  it("is the same for everyone, the code read one digit at a time", () => {
    expect(CONSENT_LINE("4821")).toBe("I'm the person on camera. I agree that Postmosis can make videos of my face. My code is 4 8 2 1.");
    expect(heardCode(CONSENT_LINE("0042"), "0042")).toBe(true);
  });
});
