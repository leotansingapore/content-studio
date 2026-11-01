// Send to phone (Volume's, folded in): the slides go up to private storage under a token, and /phone/<token> shows
// them on a phone for a day, ready to share to TikTok or Instagram. slide-campaigns makes the token and sweeps it.
// The caption and the slide size ride in the link's fragment (#c=...&f=...), which the browser never sends to a
// server: the function stores pictures only.

import { callFn } from "@/lib/edgeFn";
import type { DesignFormat } from "@/lib/design";
import { supabase } from "@/lib/supabase";

/** The longest caption the link carries; a longer one stays out and the phone page says to copy it in the editor. */
export const MAX_LINK_CAPTION = 500;

/** "#c=<caption>&f=tiktok": the caption when it fits (long=1 when it doesn't), then the slide size. */
export function phoneFragment(caption: string, format: DesignFormat): string {
  const c = caption.trim();
  const p = new URLSearchParams();
  if (c && [...c].length <= MAX_LINK_CAPTION) p.set("c", c);
  else if (c) p.set("long", "1");
  p.set("f", format);
  return `#${p}`;
}

/** What /phone/<token> reads back from its fragment; an old link with none reads as no caption and no size. */
export function readPhoneFragment(hash: string): { caption: string; long: boolean; format: DesignFormat | null } {
  const p = new URLSearchParams(hash.replace(/^#/, ""));
  const f = p.get("f");
  return { caption: p.get("c")?.trim() ?? "", long: p.get("long") === "1", format: f === "tiktok" || f === "instagram" ? f : null };
}

export async function sendToPhone(files: Blob[], design: { caption: string; format: DesignFormat }): Promise<{ url: string; expiresAt: string }> {
  const r = await callFn<{ token: string; uploads: { path: string; token: string }[]; expires_at: string }>("slide-campaigns", { action: "phone-create", count: files.length });
  await Promise.all(
    r.uploads.map(async (u, i) => {
      const put = await supabase.storage.from("cs-slide-campaigns").uploadToSignedUrl(u.path, u.token, files[i], { contentType: "image/png" });
      if (put.error) throw new Error("Couldn't send the slides. Try again.");
    }),
  );
  return { url: `${window.location.origin}/phone/${r.token}${phoneFragment(design.caption, design.format)}`, expiresAt: r.expires_at };
}
