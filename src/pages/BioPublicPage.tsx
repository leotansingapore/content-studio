// /l/:slug - public. An adviser's link-in-bio page. Data comes from the
// link-in-bio edge function; each button goes through its redirect, which
// counts the click and sends the visitor on.
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";

import BioView from "@/components/bio/BioView";
import { clickHref, fetchPublicBio, type PublicBio } from "@/lib/bioPage";

export default function BioPublicPage() {
  const { slug = "" } = useParams();
  const [state, setState] = useState<"loading" | "ready" | "gone" | "error">("loading");
  const [page, setPage] = useState<PublicBio | null>(null);

  useEffect(() => {
    let active = true;
    const key = slug.toLowerCase();
    fetchPublicBio(key).then((r) => {
      if (!active) return;
      if (r.ok && r.data) {
        setPage(r.data);
        setState("ready");
        document.title = `${r.data.display_name} - links`;
      } else {
        setState(r.gone ? "gone" : "error");
      }
    });
    return () => {
      active = false;
    };
  }, [slug]);

  return (
    <main className="min-h-screen bg-background px-4 py-10 text-foreground sm:py-16">
      {state === "loading" ? (
        <div role="status" className="flex justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="sr-only">Loading</span>
        </div>
      ) : state === "ready" && page ? (
        <BioView
          displayName={page.display_name}
          headline={page.headline}
          photo={page.photo}
          links={page.links.map((l) => ({ key: l.id, label: l.label, href: clickHref(page.slug, l.id) }))}
        />
      ) : (
        <div className="mx-auto max-w-md space-y-2 text-center">
          <h1 className="font-serif text-xl font-semibold">
            {state === "gone" ? "This page isn't available" : "Couldn't load this page"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {state === "gone" ? "Check the address, or ask the person who shared it." : "Check your connection and try again."}
          </p>
        </div>
      )}
    </main>
  );
}
