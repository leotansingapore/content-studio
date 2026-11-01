// /phone/:token, public: the slides sent from Design's Send to phone, for a day. Share puts them all in the phone's
// share sheet (TikTok, Instagram, Photos); each slide also saves on its own.

import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Download, Loader2, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { callFn } from "@/lib/edgeFn";

type Got = { urls: string[]; expires_at: string } | { error: string };

const blobOf = (url: string) => fetch(url).then((r) => (r.ok ? r.blob() : Promise.reject(new Error("Couldn't load a slide."))));
const fileOf = async (url: string, i: number) => new File([await blobOf(url)], `slide-${i + 1}.png`, { type: "image/png" });

export default function PhonePage() {
  const { token } = useParams();
  const [got, setGot] = useState<Got | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    void callFn<{ urls: string[]; expires_at: string }>("slide-campaigns", { action: "phone-get", token }, "Couldn't open the slides. Try the link again.")
      .then(setGot)
      .catch((e) => setGot({ error: (e as Error).message }));
  }, [token]);

  const share = async (urls: string[]) => {
    setBusy(true);
    setNote(null);
    try {
      const files = await Promise.all(urls.map(fileOf));
      if (navigator.canShare?.({ files })) await navigator.share({ files });
      else setNote("This browser can't share pictures. Save each slide instead.");
    } catch (e) {
      if ((e as Error).name !== "AbortError") setNote((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const save = async (url: string, i: number) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(await blobOf(url));
    a.download = `slide-${i + 1}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  };

  return (
    <main className="mx-auto min-h-dvh max-w-md space-y-4 bg-background p-4 text-foreground">
      <h1 className="text-lg font-semibold">Your slides</h1>
      {!got && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Opening
        </p>
      )}
      {got && "error" in got && <p className="text-sm text-destructive">{got.error}</p>}
      {got && "urls" in got && (
        <>
          <Button size="lg" className="w-full gap-2" disabled={busy} onClick={() => void share(got.urls)}>
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Share2 className="h-5 w-5" />} Share all {got.urls.length}
          </Button>
          {note && <p className="text-sm text-destructive">{note}</p>}
          <ol className="space-y-3">
            {got.urls.map((u, i) => (
              <li key={u} className="space-y-1">
                <img src={u} alt={`Slide ${i + 1}`} className="w-full rounded-lg border border-border" />
                <button type="button" onClick={() => void save(u, i)} className="flex min-h-11 items-center gap-1.5 text-sm text-primary">
                  <Download className="h-4 w-4" /> Save slide {i + 1}
                </button>
              </li>
            ))}
          </ol>
          <p className="text-xs text-muted-foreground">This link works until {new Date(got.expires_at).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })}.</p>
        </>
      )}
    </main>
  );
}
