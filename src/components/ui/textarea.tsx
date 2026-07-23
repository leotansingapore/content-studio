import * as React from "react";

import { cn } from "@/lib/utils";

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  /**
   * Grow the textarea to fit its content so it never needs an inner scrollbar.
   * Opt-in — defaults to a fixed-height textarea to preserve existing behavior.
   */
  autoResize?: boolean;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, autoResize = false, value, onChange, ...props }, ref) => {
    const innerRef = React.useRef<HTMLTextAreaElement | null>(null);

    // Merge the forwarded ref with our internal one so callers keep their ref
    // while we can still measure/resize the element.
    const setRefs = React.useCallback(
      (node: HTMLTextAreaElement | null) => {
        innerRef.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref)
          (ref as React.MutableRefObject<HTMLTextAreaElement | null>).current =
            node;
      },
      [ref],
    );

    const resize = React.useCallback(() => {
      const el = innerRef.current;
      if (!el || !autoResize) return;
      el.style.height = "auto";
      // scrollHeight is content + padding but excludes the border; with the
      // default border-box sizing we must add the border height back, or the
      // box stays ~2px too short and still shows a scrollbar.
      const borderY = el.offsetHeight - el.clientHeight;
      el.style.height = `${el.scrollHeight + borderY}px`;
    }, [autoResize]);

    // Resize on mount and whenever the value changes — covers programmatic
    // updates (e.g. a form pre-fill) as well as typing.
    React.useLayoutEffect(() => {
      resize();
    }, [resize, value]);

    return (
      <textarea
        className={cn(
          "flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          autoResize && "resize-none overflow-hidden",
          className,
        )}
        ref={setRefs}
        value={value}
        onChange={(e) => {
          onChange?.(e);
          resize();
        }}
        {...props}
      />
    );
  },
);
Textarea.displayName = "Textarea";

export { Textarea };
