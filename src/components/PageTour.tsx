// A page tour's popover: one step at a time at the bottom of the screen, its target ringed and scrolled into view.
// No backdrop, so the page stays usable. Closing it or finishing it marks the tour done (pageTour.ts).

import { useEffect, useRef, useState } from "react";
import { XIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { finishPageTour, type PageStep, type PageTourId } from "@/lib/pageTour";

const RING = ["ring-2", "ring-primary", "ring-offset-4", "ring-offset-background"];

export default function PageTour({ id, userId, steps, onClose, onStep }: { id: PageTourId; userId: string; steps: readonly PageStep[]; onClose: () => void; onStep?: (target: string) => void }) {
  const [n, setN] = useState(0);
  const next = useRef<HTMLButtonElement>(null);
  const step = steps[n];

  const close = () => {
    finishPageTour(userId, id);
    onClose();
  };

  // the page opens what the step needs (a tab), then the target is ringed and brought into view once it has rendered
  useEffect(() => {
    onStep?.(step.target);
    let t: HTMLElement | null = null;
    let frame = 0;
    let tries = 0;
    const find = () => {
      t = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
      if (t) {
        t.classList.add(...RING);
        t.scrollIntoView({ block: "center", behavior: "smooth" });
      } else if (++tries < 60) frame = requestAnimationFrame(find);
    };
    frame = requestAnimationFrame(find);
    return () => (cancelAnimationFrame(frame), t?.classList.remove(...RING));
  }, [step.target]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => next.current?.focus({ preventScroll: true }), [n]);

  return (
    <div
      role="dialog"
      aria-label={`Tour, step ${n + 1} of ${steps.length}`}
      onKeyDown={(e) => e.key === "Escape" && close()}
      className="fixed inset-x-0 bottom-[144px] z-[45] mx-auto w-[min(26rem,calc(100vw-2rem))] rounded-lg border border-border bg-popover p-4 shadow-xl lg:bottom-6 lg:left-[var(--nav-w)]"
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">
            {n + 1} of {steps.length}
          </p>
          <p className="font-medium">{step.title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{step.text}</p>
        </div>
        <button type="button" aria-label="Close the tour" onClick={close} className="rounded p-1 text-muted-foreground hover:text-foreground [@media(pointer:coarse)]:-m-2.5 [@media(pointer:coarse)]:p-3.5">
          <XIcon className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-3 flex items-center justify-end gap-2">
        {n > 0 && (
          <Button size="sm" variant="ghost" onClick={() => setN(n - 1)}>
            Back
          </Button>
        )}
        <Button ref={next} size="sm" onClick={() => (n + 1 < steps.length ? setN(n + 1) : close())}>
          {n + 1 < steps.length ? "Next" : "Done"}
        </Button>
      </div>
    </div>
  );
}
