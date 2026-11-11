// /phone/:token, public: the slides sent from Design's Send to phone, for a day. Share puts them all in the phone's
// share sheet (TikTok, Instagram, Photos); each slide also saves on its own. The caption, to copy, and the slide size
// come from the link's fragment (phoneLink.ts), which never reaches a server.

import { useEffect, useMemo, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { Check, Copy, Download, Loader2, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { callFn } from "@/lib/edgeFn";
import { readPhoneFragment } from "@/lib/phoneLink";

type Got = { urls: string[]; expires_at: string } | { error: string };

const blobOf = (url: string) => fetch(url).then((r) => (r.ok ? r.blob() : Promise.reject(new Error("Couldn't load a slide."))));
const fileOf = async (url: string, i: number) => new File([await blobOf(url)], `slide-${i + 1}.png`, { type: "image/png" });

export default function PhonePage() {
  const { token } = useParams();
  const { hash } = useLocation();
  const sent = useMemo(() => readPhoneFragment(hash), [hash]);
  const [copied, setCopied] = useState<boolean | null>(null);
  const [got, setGot] = useState<Got | null>(null);
  const [files, setFiles] = useState<File[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    void callFn<{ urls: string[]; expires_at: string }>("slide-campaigns", { action: "phone-get", token }, "Couldn't open the slides. Try the link again.")
      .then((g) => {
        setGot(g);
        // fetched now, not on the tap: iOS Safari only opens the share sheet straight from the tap
        void Promise.all(g.urls.map(fileOf)).then(setFiles, () => {
          setFailed(true);
          setNote("Couldn't load the slides. Reload the page to try again.");
        });
      })
      .catch((e) => setGot({ error: (e as Error).message }));
  }, [token]);

  const share = async (files: File[]) => {
    setNote(null);
    try {
      if (navigator.canShare?.({ files })) await navigator.share({ files });
      else setNote("This browser can't share pictures. Save each slide instead.");
    } catch (e) {
      if ((e as Error).name !== "AbortError") setNote((e as Error).message);
    }
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(sent.caption); // no clipboard (an http page) throws here too
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  const save = async (url: string, i: number) => {
    setNote(null);
    try {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(files?.[i] ?? (await blobOf(url)));
      a.download = `slide-${i + 1}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    } catch {
      setNote(`Couldn't save slide ${i + 1}. Reload the page to try again.`);
    }
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
          <Button size="lg" className="w-full gap-2" disabled={!files} onClick={() => files && void share(files)}>
            {files || failed ? <Share2 className="h-5 w-5" /> : <Loader2 className="h-5 w-5 animate-spin" />} Share all {got.urls.length}
          </Button>
          {note && <p className="text-sm text-destructive">{note}</p>}
          {sent.format === "tiktok" && <p className="text-xs text-muted-foreground">Instagram crops 9:16 slides to 4:5.</p>}
          {sent.caption ? (
            <section aria-labelledby="caption" className="space-y-2 rounded-lg border border-border p-3">
              <div className="flex items-center justify-between gap-2">
                <h2 id="caption" className="text-sm font-semibold">Caption</h2>
                <Button size="sm" variant="outline" className="min-h-11 gap-1.5" onClick={() => void copy()}>
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? "Copied" : "Copy"}
                </Button>
              </div>
              <p className="whitespace-pre-wrap break-words text-sm">{sent.caption}</p>
              {copied === false && <p className="text-sm text-destructive">Couldn't copy it. Press and hold the caption to copy it instead.</p>}
            </section>
          ) : (
            sent.long && <p className="text-sm text-muted-foreground">The caption is too long for this link. Copy it from the editor.</p>
          )}
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
