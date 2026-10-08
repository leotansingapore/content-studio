import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Acronyms that stay upper case when a data key is shown to people.
const ACRONYMS = new Set(["cpf", "hdb", "srs", "etf", "reit", "fc", "fa", "cta", "dm", "sg", "bto", "ci", "rm", "sme", "fire"]);

/** A data key ("pre-retiree", "social-media-for-fcs") as a sentence-case label ("Pre retiree", "Social media for FCs"). */
export function humanLabel(key: string): string {
  return key
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w, i) => {
      const l = w.toLowerCase();
      if (ACRONYMS.has(l)) return l.toUpperCase();
      if (l.endsWith("s") && ACRONYMS.has(l.slice(0, -1))) return l.slice(0, -1).toUpperCase() + "s";
      return i === 0 ? l[0].toUpperCase() + l.slice(1) : l;
    })
    .join(" ");
}
