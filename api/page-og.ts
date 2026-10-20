// The head a link-preview crawler gets for a shared Content Studio link (src/lib/linkPreview.ts says what each
// link is). vercel.json sends ONLY preview crawlers here; people get the app. An edge function, so the bundled
// post data is inlined at build rather than read from disk.

import { ORIGIN, headHtml, previewFor } from "../src/lib/linkPreview";

export const config = { runtime: "edge" };

export default function handler(req: Request): Response {
  const u = new URL(req.url);
  // a preview deployment points at its own pictures; any other host gets production's
  const origin = /^[a-z0-9.-]+\.vercel\.app$/.test(u.hostname) ? `https://${u.hostname}` : ORIGIN;
  // vercel.json passes the path as ?path= and keeps the shared link's own query beside it
  const path = `/${(u.searchParams.get("path") ?? "").replace(/^\/+/, "")}`;
  u.searchParams.delete("path");
  const query = u.searchParams.toString();
  const shared = `${origin}${path}${query ? `?${query}` : ""}`;
  return new Response(headHtml(previewFor(path, u.searchParams, origin), shared), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // same URL, two bodies (the app for people, this for crawlers): never cache on the URL alone
      Vary: "User-Agent",
      "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=3600",
    },
  });
}
