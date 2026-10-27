// Consent for a likeness (a saved face, later a voice): records only the server can sign, and the check that the
// code it issued was read aloud. A record signed for one uid never opens for another, Leo's two sign-ins included.
// No Deno or npm imports, so vitest covers it.

import { hmacHex } from "../ai-image/logic.ts";

export const CONSENT_LABEL = "content-studio consent token v1";
/** Its own label, so a job token (ai-image tokenSecret) can never pass as consent. */
export const consentSecret = (serverKey: string) => hmacHex(serverKey, CONSENT_LABEL);

const enc = new TextEncoder();
const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** `<base64url(text)>.<hmacHex(uid:text)>`. The text is kept as it is, case and all (unlike jobToken). */
export async function signFor(secret: string, uid: string, text: string): Promise<string> {
  return `${b64url(enc.encode(text))}.${await hmacHex(secret, `${uid}:${text}`)}`;
}

/** The signed text when the token was made for this uid and not changed, else null. Compared in constant time. */
export async function openSigned(secret: string, uid: string, token: string): Promise<string | null> {
  const m = /^([A-Za-z0-9_-]+)\.([0-9a-f]{64})$/.exec(token);
  if (!m) return null;
  let text: string;
  try {
    const bytes = Uint8Array.from(atob(m[1].replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
    // a changed last character can decode to the same bytes, so only the spelling signFor writes opens
    if (b64url(bytes) !== m[1]) return null;
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
  const want = await hmacHex(secret, `${uid}:${text}`);
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ m[2].charCodeAt(i);
  return diff === 0 ? text : null;
}

/** 4 digits, each code equally likely (a draw past the last whole 10,000 is drawn again). */
export function newCode(): string {
  const n = new Uint32Array(1);
  do crypto.getRandomValues(n);
  while (n[0] >= 4_294_960_000);
  return String(n[0] % 10_000).padStart(4, "0");
}

const DIGIT_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];

/**
 * Whether the code's 4 digits were heard in order, as numerals or the words zero to nine: "4821", "4,821", "4 8 2 1"
 * and "Four, eight, two, one." all read as 4821. Commas, dots, hyphens and spaces fall away; any other word ends the run.
 */
export function heardCode(transcript: string, code: string): boolean {
  const said = (transcript.toLowerCase().match(/[a-z]+|\d+/g) ?? [])
    .map((t) => (/^\d/.test(t) ? t : DIGIT_WORDS.includes(t) ? String(DIGIT_WORDS.indexOf(t)) : "|"))
    .join("");
  return /^\d{4}$/.test(code) && said.includes(code);
}

/** The line read on camera, the same for everyone (a brand name would put a business's name in a person's mouth). */
export const CONSENT_LINE = (code: string) => `I'm the person on camera. I agree that Postmosis can make videos of my face. My code is ${code.split("").join(" ")}.`;
