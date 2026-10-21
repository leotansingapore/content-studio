// Starter endings for Write's Insert panel (Endings tab), one per call to action Write offers. None promises a
// result, names a product or gives advice, so each is safe for an adviser to post in Singapore (edit-snippets).

export type EndingCta = "dm-keyword" | "comment-keyword" | "save-share" | "book-call" | "open-question";

export const STARTER_ENDINGS: { cta: EndingCta; name: string; text: string }[] = [
  { cta: "dm-keyword", name: "DM me a word", text: "Send me a DM with the word [word] and I'll send you the checklist." },
  { cta: "comment-keyword", name: "Comment a word", text: "Comment [word] below and I'll send it to you." },
  { cta: "save-share", name: "Save and share", text: "Save this for later, and send it to someone who needs it this month." },
  { cta: "book-call", name: "Book 15 minutes", text: "If you want to go through yours together, book 15 minutes with me. The link is in my bio." },
  { cta: "open-question", name: "Ask a question", text: "What would you add? Tell me in the comments." },
];
