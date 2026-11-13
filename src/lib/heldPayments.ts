import { callFn } from "@/lib/edgeFn";
import type { HeldList, HeldView } from "../../supabase/functions/held-checkouts/logic.ts";

export type { HeldList, HeldView };

export const REASON_WORDS: Record<string, string> = {
  account_without_subscription: "The email's account is from before billing",
  customer_mismatch: "Lapsed account, paid as another Stripe customer",
  second_subscription: "The account already has access",
};

export const reasonWords = (reason: string): string => REASON_WORDS[reason] ?? reason;

export const heldWhen = (iso: string): string =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Singapore" });

export const loadHeld = (): Promise<HeldList> => callFn<HeldList>("held-checkouts", {}, "Couldn't load held payments. Try again in a minute.");
