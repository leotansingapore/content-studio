// Turns a TikTok or Instagram post link into the platform's own embed player,
// so a card can play the real video instead of describing it.
// TikTok: developers.tiktok.com/doc/embed-player. Instagram: /p|reel/<code>/embed/.
//
// Links are parsed, never pattern-matched as strings: only https (or http) links
// whose host IS tiktok.com / instagram.com (or a subdomain) count, and anything
// we render is rebuilt from the parsed id, so a stored "javascript:..." or
// "https://evil.example/?tiktok.com/..." can never reach an href or a src.

type Parsed = { site: "tiktok"; id: string } | { site: "instagram"; kind: "p" | "reel"; code: string };

const onHost = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`);

function parse(url: string | null | undefined): Parsed | null {
  if (!url) return null;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.hostname.toLowerCase();
  if (onHost(host, "tiktok.com")) {
    const m = u.pathname.match(/^\/(?:@[^/]+\/video|embed\/v2|player\/v1)\/(\d+)/i);
    return m ? { site: "tiktok", id: m[1] } : null;
  }
  if (onHost(host, "instagram.com")) {
    const m = u.pathname.match(/^\/(?:[^/]+\/)?(p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i);
    return m ? { site: "instagram", kind: m[1].toLowerCase() === "p" ? "p" : "reel", code: m[2] } : null;
  }
  return null;
}

export function embedUrlFor(url: string | null | undefined): string | null {
  const p = parse(url);
  if (!p) return null;
  return p.site === "tiktok"
    ? `https://www.tiktok.com/player/v1/${p.id}?description=0&music_info=0&rel=0`
    : `https://www.instagram.com/${p.kind}/${p.code}/embed/`;
}

/** The post on the platform itself, rebuilt from the parsed id (for "watch it there" links). */
export function originalUrlFor(url: string | null | undefined): string | null {
  const p = parse(url);
  if (!p) return null;
  return p.site === "tiktok" ? `https://www.tiktok.com/@/video/${p.id}` : `https://www.instagram.com/${p.kind}/${p.code}/`;
}

/** An external link safe to put in an href: http(s) only, else null. */
export function safeExternalUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
  } catch {
    return null;
  }
}
