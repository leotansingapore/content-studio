// business-cost-preview: the paid buttons carry PriceChip, and no component types a price of its own.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const CALL_SITES = [
  "components/AiVideo.tsx", "components/AutoBroll.tsx", "components/ClipFinder.tsx", "components/ColdOpenControl.tsx",
  "components/HookOptions.tsx", "components/LongCaptions.tsx", "components/MotionControls.tsx", "components/PlatformCaptions.tsx",
  "components/ReelStyleCopy.tsx", "pages/VideoEditPage.tsx", "components/IdeaDump.tsx", "components/LongPiece.tsx",
  "components/engage/Replies.tsx", "components/engage/Dms.tsx", "components/engage/Comments.tsx", "components/engage/Connect.tsx",
  "pages/AddBrandPage.tsx", "components/YoutubeClips.tsx", "components/Mentions.tsx", "components/YourFeeds.tsx",
  "components/ProfileScore.tsx", "pages/SlideshowPage.tsx", "pages/CarouselPage.tsx", "components/agent/ActionCard.tsx",
];
const read = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

describe("price call sites", () => {
  it.each(CALL_SITES)("%s shows PriceChip and types no price", (f) => {
    const src = read(f);
    expect(src).toContain('import PriceChip from "@/components/PriceChip"');
    expect(src).not.toMatch(/US\$\d|usd:\s*[\d.]/);
  });
});
