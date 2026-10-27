import { describe, expect, it } from "vitest";
import type { CampaignPost, PostState } from "@/lib/campaigns";
import { replanLine } from "./ConfigurePanel";

const posts = (states: PostState[]) => ({ posts: states.map((state, i): CampaignPost => ({ n: i + 1, day: "", angleId: "", format: "text-post", stage: "attraction", pillar: "topic", ctaType: "", state })) });

describe("what saving a new pace and length does", () => {
  it("counts only posts with words as dropped, and the new slots as written next", () => {
    const c = posts(["ready", "ready", "ready", "ready", "failed", "failed", "waiting", "waiting", "ready"]);
    expect(replanLine(c, 3, 3)).toBe("9 posts over 3 weeks.");
    expect(replanLine(c, 1, 3)).toBe("3 posts over 1 week. Drops 2 written posts at the end.");
    expect(replanLine(c, 2, 3)).toBe("6 posts over 2 weeks. Drops 1 written post at the end.");
    expect(replanLine(c, 2, 7)).toBe("14 posts over 2 weeks. 5 new posts get written.");
  });
});
