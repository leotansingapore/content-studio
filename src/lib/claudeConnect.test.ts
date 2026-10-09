import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLink, loadLinks, MCP_ENDPOINT, newSecret, removeLink, restoreLink } from "@/lib/claudeConnect";
import { addProfile, DEFAULT_PROFILE_ID, removeProfile, setActiveProfile } from "@/lib/profiles";
import { linkIsLive, parseToken, sha256Hex, linkKey } from "../../supabase/functions/content-studio-mcp/logic";

const UID = "ff72c375-389e-4dd0-86c4-a166307b8751";
let map: Map<string, string>;
beforeEach(() => {
  map = new Map();
  vi.stubGlobal("window", {
    localStorage: {
      get length() {
        return map.size;
      },
      key: (i: number) => [...map.keys()][i] ?? null,
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v),
      removeItem: (k: string) => void map.delete(k),
    },
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("Claude connection links", () => {
  it("makes a 43-character secret the server accepts, and stores only its hash where the server looks", async () => {
    expect(newSecret()).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const { url } = await createLink(UID, new Date("2026-10-08T03:00:00Z"));
    expect(url.startsWith(`${MCP_ENDPOINT}/`)).toBe(true);
    const parsed = parseToken(url.slice(MCP_ENDPOINT.length + 1))!;
    expect(parsed.scope).toBe(UID);
    const key = linkKey(await sha256Hex(parsed.secret), parsed.scope);
    expect([...map.keys()]).toEqual([key]);
    expect(map.get(key)).not.toContain(parsed.secret);
  });

  it("lists, turns off and puts back this profile's links", async () => {
    const { link } = await createLink(UID);
    map.set(`content-studio-mcplink-${"a".repeat(64)}-${UID}~p9`, "{}"); // another profile's
    expect(loadLinks(UID).map((l) => l.hash)).toEqual([link.hash]);
    removeLink(UID, link.hash);
    expect(loadLinks(UID)).toEqual([]);
    restoreLink(UID, link);
    expect(loadLinks(UID)).toEqual([link]);
  });

  it("stays off when another device re-uploads the deleted link key", async () => {
    const { link } = await createLink(UID);
    const linkRow = `content-studio-mcplink-${link.hash}-${UID}`;
    const copy = map.get(linkRow)!;
    removeLink(UID, link.hash);
    map.set(linkRow, copy); // the sync brings the old key back from a device that still had it
    expect(loadLinks(UID)).toEqual([]);
    // and the server, seeing both rows, refuses it
    expect(linkIsLive([...map.keys()], link.hash, UID)).toBe(false);
  });
});

describe("removing a profile", () => {
  it("keeps a link that was turned off dead, even when another device uploads the link again", async () => {
    const client = addProfile(UID, "MoneyBees");
    setActiveProfile(UID, client.id);
    const { link } = await createLink(UID);
    removeLink(UID, link.hash);
    setActiveProfile(UID, DEFAULT_PROFILE_ID);
    removeProfile(UID, client.id);
    const scope = `${UID}~${client.id}`;
    // a device that never saw the turn-off still holds the link row and syncs it back up
    map.set(linkKey(link.hash, scope), JSON.stringify({ createdAt: link.createdAt }));
    expect(linkIsLive([...map.keys()], link.hash, scope)).toBe(false);
    expect([...map.keys()].filter((k) => k.endsWith(scope) && !k.startsWith("content-studio-mcp"))).toEqual([]);
  });
});
