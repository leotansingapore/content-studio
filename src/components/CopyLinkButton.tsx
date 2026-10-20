import { Link2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { absolute } from "@/lib/links";
import { withBrand } from "@/lib/profiles";
import { cn } from "@/lib/utils";

// The share sheet only on phones, as on the news tab: a desktop share sheet hides the copy everyone expects.
const sharesOnThisDevice = () =>
  typeof navigator !== "undefined" && typeof navigator.share === "function" && window.matchMedia("(pointer: coarse)").matches;

/**
 * Copies a link to what is open: `path` (built with links.ts) when given, else the address bar, which already
 * holds the open item, view and filters. The link names the open brand, so it opens on it anywhere. On a phone it
 * opens the share sheet instead, so the post reaches a chat in one tap.
 */
export default function CopyLinkButton({ path, label = "Copy link", className }: { path?: string; label?: string; className?: string }) {
  const { toast } = useToast();
  const share = sharesOnThisDevice();
  const name = share ? label.replace(/^Copy/, "Share") : label;
  const copy = async () => {
    const url = withBrand(path ? absolute(path) : window.location.href);
    if (share) {
      try {
        await navigator.share({ url });
        return;
      } catch (e) {
        // closed the sheet: nothing to do; anything else falls back to copying
        if ((e as Error)?.name === "AbortError") return;
      }
    }
    navigator.clipboard.writeText(url).then(
      () => toast({ title: "Link copied" }),
      () => toast({ title: "Copy failed", variant: "destructive" }),
    );
  };
  return (
    <button
      type="button"
      onClick={copy}
      aria-label={name}
      title={name}
      className={cn(
        "grid h-9 w-9 shrink-0 place-items-center rounded-md text-muted-foreground hover:text-foreground [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11",
        className,
      )}
    >
      <Link2 className="h-4 w-4" />
    </button>
  );
}
