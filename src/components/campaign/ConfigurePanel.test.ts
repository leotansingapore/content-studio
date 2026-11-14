import { describe, expect, it } from "vitest";
import type { CampaignPost, PostState } from "@/lib/campaigns";
import { agentAsk, postTimesLine, replanLine } from "./ConfigurePanel";

const posts = (states: PostState[], times: (string | undefined)[] = []) => ({ posts: states.map((state, i): CampaignPost => ({ n: i + 1, day: "", ...(times[i] ? { time: times[i] } : {}), angleId: "", format: "text-post", stage: "attraction", pillar: "topic", ctaType: "", state })) });

describe("what saving a new pace and length does", () => {
  it("counts only posts with words as dropped, and the new slots as written next", () => {
    const c = posts(["ready", "ready", "ready", "ready", "failed", "failed", "waiting", "waiting", "ready"]);
    expect(replanLine(c, 3, 3)).toBe("9 posts over 3 weeks.");
    expect(replanLine(c, 1, 3)).toBe("3 posts over 1 week. Drops 2 written posts at the end.");
    expect(replanLine(c, 2, 3)).toBe("6 posts over 2 weeks. Drops 1 written post at the end.");
    expect(replanLine(c, 2, 7)).toBe("14 posts over 2 weeks. 5 new posts get written.");
  });
});

describe("the settings sheet's lines", () => {
  it("names the times posts go out at, in the zone", () => {
    expect(postTimesLine(posts(["ready", "ready", "skipped"], ["19:00", "09:00", "12:00"]), "SGT")).toBe("At 9am and 7pm, SGT.");
    expect(postTimesLine(posts(["ready"], ["09:00"]), "SGT")).toBe("At 9am, SGT.");
    expect(postTimesLine(posts(["ready", "ready", "ready", "ready", "ready"], ["08:00", "09:00", "10:00", "11:00", "12:00"]), "SGT")).toBe("At 8am, 9am, 10am and 2 more times, SGT.");
    expect(postTimesLine(posts(["ready"]), "SGT")).toBe("Each post goes out on its day, SGT.");
  });
  it("hands the agent the words typed, the campaign's name and its link", () => {
    expect(agentAsk({ id: "c-1", name: "Young families | November" }, " Move it a week later ")).toMatch(/^Move it a week later\n\nThis is about my campaign "Young families \| November": https?:\/\/[^ ]+\/campaigns\/c-1$/);
  });
});
