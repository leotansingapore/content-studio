// Reading a web page someone typed, safely: every address the host resolves to must be public, redirects are
// re-checked, the body is capped. Moved out of brand-dna/index.ts (find-competitors) so the competitors function
// reads sites with the same guard; brand-dna/logic.ts re-exports privateIp so its tests keep their import.

import { safeFeedUrl } from "../feed-ideas/logic.ts";

// the app type-checks this file through brand-dna/logic.ts; only edge functions call publicHost
declare const Deno: unknown;

/**
 * Whether an address a host name resolves to is inside a network: loopback, private, shared (CGNAT), link-local
 * (cloud metadata lives there), unspecified, multicast or reserved, in IPv4 or IPv6 (mapped IPv4 included).
 * A host is read only when every address it resolves to is public.
 */
export function privateIp(addr: string): boolean {
  const a = addr.trim().toLowerCase().replace(/^\[|\]$/g, "");
  const v4 = a.match(/^(?:::ffff:)?(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [o1, o2] = [Number(v4[1]), Number(v4[2])];
    return o1 === 0 || o1 === 10 || o1 === 127 || o1 >= 224 || (o1 === 100 && o2 >= 64 && o2 <= 127) || (o1 === 169 && o2 === 254)
      || (o1 === 172 && o2 >= 16 && o2 <= 31) || (o1 === 192 && o2 === 168) || (o1 === 192 && o2 === 0) || (o1 === 198 && (o2 === 18 || o2 === 19));
  }
  if (!a.includes(":")) return true; // not an address we can read: refuse
  if (a === "::" || a === "::1") return true;
  const first = parseInt(a.split(":")[0] || "0", 16);
  return (first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80 || (first & 0xff00) === 0xff00 || a.startsWith("64:ff9b:") || a.startsWith("2001:db8:");
}

/**
 * Every address the host resolves to must be public (privateIp), checked before each request: the first one, every
 * redirect and every logo. shortcut: a DNS answer could still change between this check and the connection (rebinding),
 * so a host that resolves privately at fetch time slips through; pinning the vetted IP needs a fetch that takes one.
 */
export async function publicHost(url: URL): Promise<boolean> {
  const resolve = (Deno as unknown as { resolveDns?: (h: string, t: "A" | "AAAA") => Promise<string[]> }).resolveDns;
  if (typeof resolve !== "function") return false;
  const answers = await Promise.all((["A", "AAAA"] as const).map((t) => resolve(url.hostname, t).catch(() => [] as string[])));
  const all = answers.flat();
  return all.length > 0 && !all.some(privateIp);
}

/** Follows up to 3 redirects that each pass the same guard, and reads at most `max` bytes. */
export async function fetchCapped(start: URL, max: number, accept: string, deadline: AbortSignal): Promise<{ bytes: Uint8Array; type: string; url: URL }> {
  let url = start;
  for (let hop = 0; hop < 4; hop++) {
    if (!(await publicHost(url))) throw new Error(`${url.hostname} doesn't resolve to a public address`);
    const res = await fetch(url, { redirect: "manual", signal: AbortSignal.any([deadline, AbortSignal.timeout(8_000)]), headers: { "User-Agent": "ContentStudio-BrandReader/1.0", Accept: accept } });
    if (res.status >= 300 && res.status < 400) {
      await res.body?.cancel();
      const next = safeFeedUrl(new URL(res.headers.get("location") ?? "", url).href);
      if (!next) throw new Error("redirects somewhere we can't read");
      url = next;
      continue;
    }
    if (!res.ok || !res.body) throw new Error(`answered ${res.status}`);
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > max) {
        await reader.cancel();
        break;
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(chunks.reduce((n, c) => n + c.byteLength, 0));
    let at = 0;
    for (const c of chunks) (bytes.set(c, at), (at += c.byteLength));
    return { bytes, type: (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase(), url };
  }
  throw new Error("redirects too many times");
}
