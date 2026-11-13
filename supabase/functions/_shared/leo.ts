/** Leo's Content Studio sign-ins (uid 40f07a18 and 13b28b1d). */
export const LEO_EMAILS = ["tanjunsing@gmail.com", "leotanjs95@gmail.com"];

export const isLeoEmail = (email: string | null | undefined): boolean => LEO_EMAILS.includes((email ?? "").trim().toLowerCase());
