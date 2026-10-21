// The dropzone on /media for Leo (brand-media-library step 1): drop or pick up to 20 photos and videos. The strip under
// it counts them in ("Adding 3 of 7") and gives one line per refusal; the adding itself runs in mediaUpload.ts, outside
// React, so leaving the page mid-add still adds every file.

import { useRef, useState, useSyncExternalStore } from "react";
import { Upload } from "lucide-react";
import PriceChip from "@/components/PriceChip";
import { Button } from "@/components/ui/button";
import { useUsesLeft } from "@/lib/aiUsage";
import { clearSortNotice, onSortChange, sortState } from "@/lib/mediaSort";
import { ACCEPT, addFiles, MAX_AT_ONCE } from "@/lib/mediaUpload";
import { supabase } from "@/lib/supabase";

export default function MediaDropzone({ userId, folder, onChange }: { userId: string | null; folder: string; onChange: () => void }) {
  const [over, setOver] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [lines, setLines] = useState<string[]>([]);
  const sort = useSyncExternalStore(onSortChange, sortState);
  const left = useUsesLeft(!!progress || sort.sorting.size > 0);
  const input = useRef<HTMLInputElement>(null);

  const take = async (picked: FileList | null) => {
    const files = [...(picked ?? [])];
    if (!files.length || progress) return;
    clearSortNotice();
    setLines([]);
    setProgress(`Adding 1 of ${Math.min(files.length, MAX_AT_ONCE)}`);
    try {
      // files picked before the sign-in check finished must not be dropped
      const uid = userId ?? (await supabase.auth.getUser()).data.user?.id ?? null;
      if (!uid) return setLines(["Sign in again to add files."]);
      const r = await addFiles(uid, files, {
        folder,
        onProgress: (n, of) => {
          setProgress(`Adding ${n} of ${of}`);
          onChange();
        },
      });
      setLines(r.lines);
    } finally {
      setProgress(null);
      onChange();
    }
  };

  return (
    <section
      aria-label="Add photos and videos"
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        void take(e.dataTransfer.files);
      }}
      className={`space-y-3 rounded-xl border-2 border-dashed p-4 transition-colors sm:p-5 ${over ? "border-primary bg-primary/5" : "border-border"}`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm font-semibold">Drop photos and videos here</p>
          <p className="text-xs text-muted-foreground">Photos: JPG, PNG or WebP up to 10 MB. Videos: MP4 or MOV up to 50 MB and 3 minutes. Up to 20 at a time.</p>
        </div>
        <Button type="button" className="h-11 shrink-0 gap-2 sm:h-10" disabled={!!progress} onClick={() => input.current?.click()}>
          <Upload className="h-4 w-4" aria-hidden /> Choose files
        </Button>
        <input
          ref={input}
          type="file"
          multiple
          accept={ACCEPT}
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            void take(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
      <p className="text-[11px] text-muted-foreground">
        Sorting: <PriceChip feature="media-sort" left={left("media-sort")} />
      </p>
      <div role="status" aria-live="polite" className="space-y-1 text-xs empty:hidden">
        {progress && <p className="font-medium">{progress}</p>}
        {lines.map((l, i) => (
          <p key={i} className="text-destructive">
            {l}
          </p>
        ))}
        {sort.notice && <p className="text-muted-foreground">{sort.notice}</p>}
      </div>
    </section>
  );
}
