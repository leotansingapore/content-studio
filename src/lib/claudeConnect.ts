// Connect Claude: per-profile connection links for the MCP server in
// supabase/functions/content-studio-mcp. A link is "<server>/<scope>.<secret>";
// only SHA-256(secret) is kept, in a synced key the server looks up, so a link
// is shown once.
//   key: content-studio-mcplink-<sha256 hex>-${scoped(userId)}
// Turning a link off writes content-studio-mcprevoked-<hash>-<scope>, which is
// never deleted by a turn-off: the sync has no tombstones, so a deleted link key
// could come back from another device, but the revoked row keeps it dead.

import { scoped } from "@/lib/profiles";
import { SUPABASE_URL } from "@/lib/supabase";

const PREFIX = "content-studio-mcplink-";
const REVOKED = "content-studio-mcprevoked-";
export const MCP_ENDPOINT = `${SUPABASE_URL}/functions/v1/content-studio-mcp`;

export interface ClaudeLink {
  hash: string;
  createdAt: string;
}

function store(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** 32 random bytes as base64url: 43 characters. */
export function newSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function loadLinks(userId: string | null | undefined): ClaudeLink[] {
  const s = store();
  if (!s || !userId) return [];
  const suffix = `-${scoped(userId)}`;
  const out: ClaudeLink[] = [];
  for (let i = 0; i < s.length; i++) {
    const k = s.key(i);
    if (!k?.startsWith(PREFIX) || !k.endsWith(suffix)) continue;
    const hash = k.slice(PREFIX.length, -suffix.length);
    if (!/^[0-9a-f]{64}$/.test(hash) || s.getItem(`${REVOKED}${hash}${suffix}`) !== null) continue;
    let createdAt = "";
    try {
      createdAt = String(JSON.parse(s.getItem(k) ?? "{}").createdAt ?? "");
    } catch {
      // keep the link listed so it can still be removed
    }
    out.push({ hash, createdAt });
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Makes a link for the active profile and returns its URL (shown once) and record. */
export async function createLink(userId: string, now = new Date()): Promise<{ url: string; link: ClaudeLink }> {
  const scope = scoped(userId);
  const secret = newSecret();
  const link = { hash: await sha256Hex(secret), createdAt: now.toISOString() };
  saveLink(userId, link);
  return { url: `${MCP_ENDPOINT}/${scope}.${secret}`, link };
}

function saveLink(userId: string, link: ClaudeLink): void {
  store()?.setItem(`${PREFIX}${link.hash}-${scoped(userId)}`, JSON.stringify({ createdAt: link.createdAt }));
}

/** Turns a link off for good on every device (see the note at the top). */
export function removeLink(userId: string, hash: string, now = new Date()): void {
  const s = store();
  if (!s) return;
  s.setItem(`${REVOKED}${hash}-${scoped(userId)}`, JSON.stringify({ revokedAt: now.toISOString() }));
  s.removeItem(`${PREFIX}${hash}-${scoped(userId)}`);
}

/** Undo for a turn-off. If the sync brings the revoked row back, the link simply stays off. */
export function restoreLink(userId: string, link: ClaudeLink): void {
  store()?.removeItem(`${REVOKED}${link.hash}-${scoped(userId)}`);
  saveLink(userId, link);
}

/** True once the server answers the link (it goes live when this device has synced it). */
export async function linkIsLive(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
