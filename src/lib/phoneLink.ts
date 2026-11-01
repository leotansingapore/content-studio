// Send to phone (Volume's, folded in): the slides go up to private storage under a token, and /phone/<token> shows
// them on a phone for a day, ready to share to TikTok or Instagram. slide-campaigns makes the token and sweeps it.

import { callFn } from "@/lib/edgeFn";
import { supabase } from "@/lib/supabase";

export async function sendToPhone(files: Blob[]): Promise<{ url: string; expiresAt: string }> {
  const r = await callFn<{ token: string; uploads: { path: string; token: string }[]; expires_at: string }>("slide-campaigns", { action: "phone-create", count: files.length });
  await Promise.all(
    r.uploads.map(async (u, i) => {
      const put = await supabase.storage.from("cs-slide-campaigns").uploadToSignedUrl(u.path, u.token, files[i], { contentType: "image/png" });
      if (put.error) throw new Error("Couldn't send the slides. Try again.");
    }),
  );
  return { url: `${window.location.origin}/phone/${r.token}`, expiresAt: r.expires_at };
}
