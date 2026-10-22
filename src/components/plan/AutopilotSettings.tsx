// Autopilot's settings dialog (plan-autopilot, Leo only), opened by Turn on or Settings and by ?autopilot=settings
// (push, so Back closes it). How many posts a week is the weekly goal, never a second number. The price beside Turn
// on is one campaign-draft call a week, from the price table.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { links } from "@/lib/links";
import { WEEKDAYS } from "@/lib/contentPlan";
import { priceOf, priceText, type Price } from "@/lib/prices";
import { AUTO_FORMATS, FORMAT_LINE, toggleFormat, type AutoFormat, type AutopilotSettings as Settings } from "@/lib/autopilot";

export const AUTO_FORMAT_LABEL: Record<AutoFormat, string> = { "text-post": "Text post", carousel: "Carousel", "short-video": "Short video script" };
const WINDOWS = [1, 2, 3] as const;
const TOUCH = "[@media(pointer:coarse)]:min-h-11";
const HEAD = "text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground";
/** One writing call a week (campaign-draft), as the chip beside Turn on says. */
export const WEEK_PRICE = `${priceText(priceOf("campaign-draft") as Price)} a week`;

export default function AutopilotSettings({
  settings,
  cadence,
  onSave,
  onClose,
}: {
  settings: Settings;
  /** The weekly goal for the primary platform. */
  cadence: number;
  /** Saves the picks; null when saved, else the line to show. */
  onSave: (next: Settings) => string | null;
  onClose: () => void;
}) {
  const [form, setForm] = useState(settings);
  const [line, setLine] = useState("");
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => first.current?.focus(), []);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  });

  const pick = (f: AutoFormat) => {
    const next = toggleFormat(form.formats, f);
    setLine(next === form.formats ? FORMAT_LINE : "");
    setForm({ ...form, formats: next });
  };
  const save = () => {
    const error = onSave({ ...form, on: true });
    if (error) setLine(error);
  };

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="autopilot-settings-title" className="flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-background shadow-elegant sm:max-w-md sm:rounded-2xl">
        <div className="flex items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
          <h2 id="autopilot-settings-title" className="font-serif text-lg font-semibold">Autopilot</h2>
          <Button type="button" variant="ghost" size="icon" className="h-10 w-10 shrink-0" aria-label="Close" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
          <fieldset className="space-y-2">
            <legend className={HEAD}>When it writes</legend>
            <RadioGroup value={form.when} onValueChange={(v) => setForm({ ...form, when: v === "daily" ? "daily" : "weekly" })} className="gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <label className={cn("flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 text-sm hover:bg-muted/60", TOUCH)}>
                  <RadioGroupItem ref={first} value="weekly" />
                  Once a week, on
                </label>
                <Select value={String(form.writeDay)} onValueChange={(v) => setForm({ ...form, when: "weekly", writeDay: Number(v) })}>
                  <SelectTrigger aria-label="Write day" className="h-9 w-24 [@media(pointer:coarse)]:h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="z-[80]">
                    {WEEKDAYS.map((d, i) => (
                      <SelectItem key={d} value={String(i)}>
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <label className={cn("flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 text-sm hover:bg-muted/60", TOUCH)}>
                <RadioGroupItem value="daily" />
                Every morning
              </label>
            </RadioGroup>
          </fieldset>

          <div className="space-y-1">
            <p className={HEAD}>How many</p>
            <p className="text-sm">
              {cadence} post{cadence === 1 ? "" : "s"} a week, your weekly goal.{" "}
              <Link to={links.plan({ view: "setup" })} className={cn("font-semibold text-primary hover:underline", TOUCH, "inline-flex items-center")}>
                Change
              </Link>
            </p>
          </div>

          <fieldset className="space-y-2">
            <legend className={HEAD}>Formats</legend>
            <div className="flex flex-wrap gap-2">
              {AUTO_FORMATS.map((f) => {
                const on = form.formats.includes(f);
                return (
                  <button
                    key={f}
                    type="button"
                    aria-pressed={on}
                    onClick={() => pick(f)}
                    className={cn(
                      "h-9 rounded-full border px-3 text-sm font-medium transition-colors",
                      TOUCH,
                      on ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground hover:bg-muted/60",
                    )}
                  >
                    {AUTO_FORMAT_LABEL[f]}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <fieldset className="space-y-2">
            <legend className={HEAD}>Review window</legend>
            <RadioGroup value={String(form.windowDays)} onValueChange={(v) => setForm({ ...form, windowDays: Number(v) as Settings["windowDays"] })} className="gap-1">
              {WINDOWS.map((w) => (
                <label key={w} className={cn("flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 text-sm hover:bg-muted/60", TOUCH)}>
                  <RadioGroupItem value={String(w)} />
                  {w} day{w === 1 ? "" : "s"} before
                </label>
              ))}
            </RadioGroup>
            <p className="text-xs text-muted-foreground">A post you have not approved by then stays in your drafts and never reaches the calendar.</p>
          </fieldset>

          <p className="text-sm text-foreground/90">Autopilot only writes. Nothing goes on the calendar until you approve it.</p>
          {line && (
            <p className="text-sm text-destructive" role="alert">
              {line}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border/60 px-4 py-3">
          <Button type="button" variant="outline" className={TOUCH} onClick={onClose}>
            Cancel
          </Button>
          <span className="text-[11px] tabular-nums text-muted-foreground">{WEEK_PRICE}</span>
          <Button type="button" className={TOUCH} onClick={save}>
            {settings.on ? "Save" : "Turn on"}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
