// Leo's agent button on phones sits in the top bar's free slot, the same one the customers' chat button uses, so it
// never covers the bottom right of a page. Read from the source: importing the dock loads the whole agent engine.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const src = readFileSync("src/components/agent/AgentDock.tsx", "utf8");
const closed = /export const CLOSED =\s*"([^"]+)"/.exec(src)?.[1].split(" ") ?? [];

describe("the agent dock's closed button", () => {
  it("is in the phone top bar at the chat button's slot (left 64, top 6), not floating over the page", () => {
    const mount = readFileSync("src/components/feedback/AssistantMount.tsx", "utf8");
    expect(mount).toContain("export const MOBILE_BUTTON = { top: 6, left: 64 };");
    // Tailwind: left-16 is 64px, top-1.5 is 6px
    expect(closed).toEqual(expect.arrayContaining(["fixed", "left-16", "top-1.5"]));
    expect(closed.filter((c) => /^(bottom|right)-/.test(c))).toEqual([]);
    expect(closed).not.toContain("bg-primary");
  });
  it("is the filled pill at the bottom right from lg", () => {
    expect(closed).toEqual(expect.arrayContaining(["lg:left-auto", "lg:top-auto", "lg:right-5", "lg:bottom-5", "lg:bg-primary"]));
    expect(src).toContain("className={`${CLOSED} ");
  });
});
