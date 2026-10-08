// Turns a TikTok or Instagram post link into the platform's own embed player,
// so a card can play the real video instead of describing it.
// TikTok: developers.tiktok.com/doc/embed-player. Instagram: /p|reel/<code>/embed/.

export function embedUrlFor(url: string | null | undefined): string | null {
  if (!url) return null;
  const tiktok = url.match(/tiktok\.com\/(?:@[^/]+\/video|embed\/v2|player\/v1)\/(\d+)/i);
  if (tiktok) return `https://www.tiktok.com/player/v1/${tiktok[1]}?description=0&music_info=0&rel=0`;
  const ig = url.match(/instagram\.com\/(?:[^/]+\/)?(p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i);
  if (ig) return `https://www.instagram.com/${ig[1].toLowerCase() === "p" ? "p" : "reel"}/${ig[2]}/embed/`;
  return null;
}
