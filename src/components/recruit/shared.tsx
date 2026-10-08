import type { ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { useToast } from "@/hooks/use-toast";
import type { ComplianceFlag } from "@/lib/compliance";

export function Part({
  id,
  n,
  title,
  question,
  tip,
  done,
  children,
}: {
  id?: string;
  n: number | string;
  title: string;
  question?: string;
  tip?: string;
  done?: boolean;
  children: ReactNode;
}) {
  return (
    <Card id={id} className="scroll-mt-20 border-border/60 shadow-card">
      <CardHeader className="space-y-1">
        <CardTitle className="flex items-center gap-2 font-serif text-lg">
          <span
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
              done ? "bg-success text-white" : "bg-primary/10 text-primary"
            }`}
          >
            {done ? <Check className="h-3.5 w-3.5" /> : n}
          </span>
          {title}
          {tip && <InfoTip label={`About ${title}`}>{tip}</InfoTip>}
        </CardTitle>
        {question && <p className="text-xs italic text-muted-foreground">&ldquo;{question}&rdquo;</p>}
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

export function Flags({ flags }: { flags: ComplianceFlag[] }) {
  if (!flags.length) return null;
  return (
    <ul className="space-y-1">
      {flags.map((f) => (
        <li
          key={f.id}
          className={`rounded-lg border px-2.5 py-1.5 text-[11px] leading-snug ${
            f.severity === "error"
              ? "border-destructive/40 bg-destructive/10 text-destructive"
              : "border-warning/40 bg-warning/10 text-foreground"
          }`}
        >
          <span className="font-semibold">&ldquo;{f.match}&rdquo;</span> {f.message}
        </li>
      ))}
    </ul>
  );
}

export function useCopy() {
  const { toast } = useToast();
  return async (text: string, label = "Copied") => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: label });
    } catch {
      toast({ title: "Copy failed. Select the text and copy it by hand.", variant: "destructive" });
    }
  };
}

export function CopyButton({ text, label, what = "Copied" }: { text: string; label?: string; what?: string }) {
  const copy = useCopy();
  return (
    <button
      type="button"
      onClick={() => copy(text, what)}
      aria-label={label ?? "Copy"}
      className="inline-flex min-h-9 items-center gap-1 rounded-md px-2 py-1.5 text-[11px] font-semibold text-primary transition-colors hover:bg-primary/10 sm:min-h-0"
    >
      <Copy className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

export const fieldClass =
  "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring";
