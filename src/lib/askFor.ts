// Home's "Ask the agent for" tiles (docs/north-star/items/agent-home.md): five kinds of ask, each with an example built
// from the brand's positioning. A brand that speaks as a business gets no adviser or client words (phase 6 decision 13).
import type { Positioning } from "@/lib/positioning";

export interface AskTile {
  title: string;
  /** The tile's word in the folded line. */
  short: string;
  example: string;
}

export function askForExamples(p: Pick<Positioning, "topics" | "audienceDetail"> | null, speaker: "person" | "business"): AskTile[] {
  const topic = p?.topics?.[0]?.trim();
  const audience = p?.audienceDetail?.trim();
  const biz = speaker === "business";
  return [
    { title: "Remix a post", short: "Remixes", example: "Remix a post from my Swipe file" },
    { title: "Carousels", short: "Carousels", example: `Make a carousel about ${topic || (biz ? "a mistake our customers make" : "a money mistake my clients make")}` },
    {
      title: "Videos",
      short: "Videos",
      example: biz ? `Make a 20-second video explaining ${topic || "what we do"}` : `Make a 20-second video of me explaining ${topic || "how I help my clients"}`,
    },
    { title: "Campaigns", short: "Campaigns", example: `Plan a month of posts for ${audience || (biz ? "our customers" : "young families")}` },
    { title: "Hooks and scripts", short: "Scripts", example: "Write 3 hooks for my next post" },
  ];
}
