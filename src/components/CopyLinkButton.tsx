import { Link2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { absolute } from "@/lib/links";
import { withBrand } from "@/lib/profiles";
import { cn } from "@/lib/utils";

/**
 * Copies a link to what is open: `path` (built with links.ts) when given, else the address bar, which already
 * holds the open item, view and filters. The link names the open brand, so it opens on it anywhere.
 */
export default function CopyLinkButton({ path, label = "Copy link", className }: { path?: string; label?: string; className?: string }) {
  const { toast } = useToast();
  const copy = () =>
    navigator.clipboard.writeText(withBrand(path ? absolute(path) : window.location.href)).then(
      () => toast({ title: "Link copied" }),
      () => toast({ title: "Copy failed", variant: "destructive" }),
    );
  return (
    <button
      type="button"
      onClick={copy}
      aria-label={label}
      title={label}
      className={cn(
        "grid h-9 w-9 shrink-0 place-items-center rounded-md text-muted-foreground hover:text-foreground [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11",
        className,
      )}
    >
      <Link2 className="h-4 w-4" />
    </button>
  );
}
