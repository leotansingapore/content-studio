// What the open brand's owner does, for the AI writers (supabase/functions/_shared/profession.ts says how each uses it).

import { loadBrand } from "@/lib/carousel";
import { storedUserId } from "@/lib/socialConnect";
import { professionOf } from "../../supabase/functions/_shared/profession.ts";

export { ADVISER, MAX_PROFESSION_CHARS, PROFESSION_CHOICES, isAdviser } from "../../supabase/functions/_shared/profession.ts";

/** The `profession` every writer call sends: "" for an adviser or a brand with nothing set (today's prompts), else the brand's words. */
export const professionFor = (userId: string | null | undefined): string => professionOf(loadBrand(userId)?.profession);

/**
 * True when the open brand is an adviser's or has nothing set, as the writers read it: its screens keep today's
 * examples and the libraries built for Singapore financial advisers. No userId reads the sign-in this device keeps,
 * so a first frame (before getUser answers) is already right.
 */
export const adviserBrand = (userId?: string | null): boolean => !professionFor(userId || storedUserId());
