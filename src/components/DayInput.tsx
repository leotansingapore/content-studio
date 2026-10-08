// A date field that hands back a whole day from `min` on. It keeps what is being
// typed: a controlled date input snaps back on the partial years Chrome reports
// while a year is typed (0002, 0020, 0202, 2026), so a typed date never landed.
// A typed day that can't be used goes back to the saved one on blur.
import { useEffect, useRef, type InputHTMLAttributes } from "react";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "defaultValue" | "min" | "onChange"> & {
  /** The saved day ("YYYY-MM-DD"), or "" for none. */
  value: string;
  min: string;
  onPick: (day: string) => void;
};

export default function DayInput({ value, min, onPick, onBlur, ...rest }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  // Show a change made elsewhere (a drag, an Undo), but not while someone is typing here.
  useEffect(() => {
    if (ref.current && document.activeElement !== ref.current) ref.current.value = value;
  }, [value]);
  return (
    <input
      {...rest}
      ref={ref}
      type="date"
      min={min}
      defaultValue={value}
      onChange={(e) => {
        const day = e.target.value;
        if (day >= min && day !== value) onPick(day);
      }}
      onBlur={(e) => {
        if (!(e.target.value >= min)) e.target.value = value;
        onBlur?.(e);
      }}
    />
  );
}
