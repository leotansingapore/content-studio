// /make/:format (docs/north-star/items/formats-slideshow.md): one format's create page, found by slug in
// src/data/formats.ts (formatBySlug: entries with a page). Leo's sign-ins only (useLeoUser, so ?asLeo=1 works on
// localhost), except a format marked `everyone` (the slideshow), which opens for any sign-in; anyone else, and a
// slug with no page, gets NotFound, also by typed URL. A page whose entry is not
// ready yet still opens for Leo, so its builder can check it here before the gallery lists it. ?source=<RemixSource key> is resolved here from this device's
// data (resolveSource, then the sources this tab pressed Remix on); null when it no longer resolves.

import { Suspense, useMemo } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { formatBySlug } from "@/data/formats";
import { seenSources, type RemixSource } from "@/lib/remixSource";
import { resolveSource } from "@/lib/resolveSource";
import { useLeoUser, useSignedInUser } from "@/lib/useLeoOnly";
import NotFoundPage from "@/pages/NotFoundPage";

export default function MakeFormatPage() {
  const leo = useLeoUser();
  const anyone = useSignedInUser();
  const { format } = useParams();
  const [params] = useSearchParams();
  const key = params.get("source");
  const def = formatBySlug(format);
  const user = def?.everyone ? anyone : leo;
  const userId = user?.id ?? "";
  const source = useMemo<RemixSource | null>(
    () => (key && userId ? (resolveSource(key, userId) ?? seenSources(userId).find((s) => s.key === key) ?? null) : null),
    [key, userId],
  );
  if (user === undefined) return <div className="min-h-[40vh]" aria-busy="true" />;
  if (!def) return <NotFoundPage />;
  if (!user) return <NotFoundPage notOnAccount />;
  return (
    <Suspense fallback={<div className="min-h-[40vh]" aria-busy="true" />}>
      <def.Component userId={user.id} source={source} />
    </Suspense>
  );
}
