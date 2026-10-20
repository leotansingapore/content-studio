// The north-star gate (docs/north-star/README.md): new north-star work, and the /north-star page itself,
// show only on Leo's two sign-ins until he turns a piece on for everyone. Hiding is a convenience, not a
// boundary: anything bundled can be read by a signed-in user who goes looking.

/** Leo's Content Studio sign-ins (uid 40f07a18 and 13b28b1d). */
export const LEO_EMAILS = ["tanjunsing@gmail.com", "leotanjs95@gmail.com"];

export const leoOnly = (email: string | null | undefined): boolean => LEO_EMAILS.includes((email ?? "").trim().toLowerCase());
