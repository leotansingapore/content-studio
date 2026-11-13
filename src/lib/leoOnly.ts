// The north-star gate (docs/north-star/README.md): new north-star work, and the /north-star page itself,
// show only on Leo's two sign-ins until he turns a piece on for everyone. Hiding is a convenience, not a
// boundary: anything bundled can be read by a signed-in user who goes looking.

import { LEO_EMAILS, isLeoEmail } from "../../supabase/functions/_shared/leo.ts";

export { LEO_EMAILS };

export const leoOnly = isLeoEmail;
