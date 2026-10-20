// /make/:format (docs/north-star/items/formats-slideshow.md): one format's create page, found by slug in
// src/data/formats.ts. Leo's sign-ins only (useLeoUser, so ?asLeo=1 works on localhost); anyone else, and an
// unknown slug, gets NotFound, also by typed URL. ?source=<RemixSource key> is resolved here from this device's
// data (resolveSource, then the sources this tab pressed Remix on); null when it no longer resolves.

import { Suspense, useMemo } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { formatBySlug } from "@/data/formats";
import { seenSources, type RemixSource } from "@/lib/remixSource";
import { resolveSource } from "@/lib/resolveSource";
import { useLeoUser } from "@/lib/useLeoOnly";
import NotFoundPage from "@/pages/NotFoundPage";

export default function MakeFormatPage() {
  const leo = useLeoUser();
  const { format } = useParams();
  const [params] = useSearchParams();
  const key = params.get("source");
  const userId = leo?.id ?? "";
  const source = useMemo<RemixSource | null>(
    () => (key && userId ? (resolveSource(key, userId) ?? seenSources(userId).find((s) => s.key === key) ?? null) : null),
    [key, userId],
  );
  const def = formatBySlug(format);
  if (leo === undefined) return <div className="min-h-[40vh]" aria-busy="true" />;
  if (!leo || !def) return <NotFoundPage />;
  return (
    <Suspense fallback={<div className="min-h-[40vh]" aria-busy="true" />}>
      <def.Component userId={leo.id} source={source} />
    </Suspense>
  );
}
