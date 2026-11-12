// /design/libraries: the brand's image libraries for slideshow campaigns (Volume's Library, folded in): a collage of
// each, how many pictures and from where, which campaigns draw from it, edit and delete.

import { useCallback, useEffect, useState } from "react";
import { ImagesIcon, CircleNotchIcon, PlusIcon } from "@phosphor-icons/react";
import LibraryDialog, { type Library } from "@/components/design/LibraryDialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { callFn } from "@/lib/edgeFn";
import { activeProfileId } from "@/lib/profiles";
import { socialConnectShown } from "@/lib/socialConnect";
import { useSignedInUser } from "@/lib/useLeoOnly";

type Row = Library & { count: number; stock: number; uploads: number; previews: (string | null)[]; used_by: string[] };

const small = (u: string) => (u.includes("images.pexels.com") ? u.replace(/([?&]w=)\d+/, "$1300") : u);

export default function SlideLibrariesPage() {
  const user = useSignedInUser();
  const { toast } = useToast();
  const profile = activeProfileId(user?.id);
  // libraries feed campaigns, which post to TikTok: the server only fills them for owners with posting switched on
  const canPost = socialConnectShown();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [open, setOpen] = useState<Library | "new" | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(
    () =>
      callFn<{ libraries: Row[] }>("slide-campaigns", { action: "libraries", profile_id: profile })
        .then((r) => setRows(r.libraries))
        .catch(() => setRows([])),
    [profile],
  );
  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  const remove = async (id: string) => {
    setBusy(id);
    try {
      await callFn("slide-campaigns", { action: "library-delete", id });
      setRows((r) => r?.filter((x) => x.id !== id) ?? null);
    } catch (e) {
      toast({ title: "Couldn't delete it", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(null);
      setConfirm(null);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Libraries</h1>
          {rows && <p className="text-sm text-muted-foreground">{`${rows.length} librar${rows.length === 1 ? "y" : "ies"}`}</p>}
        </div>
        <Button onClick={() => setOpen("new")} disabled={!canPost} className="gap-1.5">
          <PlusIcon className="h-4 w-4" /> New library
        </Button>
      </header>
      {!canPost && <p className="text-sm text-muted-foreground">Posting isn't switched on for your account yet.</p>}
      {!rows && <p className="text-sm text-muted-foreground">Loading your libraries</p>}
      {rows?.length === 0 && (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <ImagesIcon className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-2 font-medium">No libraries yet</p>
          <p className="mt-1 text-sm text-muted-foreground">A campaign draws each slide's picture from one.</p>
        </div>
      )}
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rows?.map((l) => (
          <li key={l.id} className="overflow-hidden rounded-lg border border-border">
            <button type="button" onClick={() => setOpen(l)} className="grid aspect-[2/1] w-full grid-cols-4 gap-0.5 bg-muted" aria-label={`Open ${l.name}`}>
              {Array.from({ length: 4 }, (_, i) => {
                const u = l.previews[i];
                return u ? <img key={i} src={small(u)} alt="" loading="lazy" className="h-full w-full object-cover" /> : <span key={i} className="bg-muted" />;
              })}
            </button>
            <div className="space-y-1 p-3">
              <p className="font-medium">{l.name}</p>
              <p className="text-xs text-muted-foreground">
                {l.count} picture{l.count === 1 ? "" : "s"}
                {l.stock ? `, ${l.stock} stock` : ""}
                {l.uploads ? `, ${l.uploads} yours` : ""}
              </p>
              <p className="text-xs text-muted-foreground">{l.used_by.length ? `Used by ${l.used_by.join(", ")}` : "Not used by a campaign"}</p>
              <div className="flex items-center gap-3 pt-1 text-xs">
                <button type="button" className="text-primary hover:underline" onClick={() => setOpen(l)}>
                  Edit
                </button>
                {confirm === l.id ? (
                  <>
                    <span>{l.used_by.length ? "Its campaigns lose these pictures. Delete?" : "Delete it and its pictures?"}</span>
                    <button type="button" disabled={busy === l.id} className="font-medium text-destructive hover:underline" onClick={() => void remove(l.id)}>
                      {busy === l.id ? <CircleNotchIcon className="h-3.5 w-3.5 animate-spin" /> : "Delete"}
                    </button>
                    <button type="button" className="text-muted-foreground hover:underline" onClick={() => setConfirm(null)}>
                      Keep
                    </button>
                  </>
                ) : (
                  <button type="button" className="text-muted-foreground hover:text-destructive" onClick={() => setConfirm(l.id)}>
                    Delete
                  </button>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
      {open && <LibraryDialog profileId={profile} library={open === "new" ? null : open} onClose={() => (setOpen(null), void load())} onSaved={() => undefined} />}
    </div>
  );
}
