import { describe, expect, it } from "vitest";
import { buildTrendRemixUrl, getTrends } from "./trends";

describe("buildTrendRemixUrl", () => {
  it("names the trend as its source, trend:<id>", () => {
    const trend = getTrends()[0];
    const url = new URL(buildTrendRemixUrl(trend), "https://x");
    expect(url.pathname).toBe("/generate");
    expect(url.searchParams.get("source")).toBe(`trend:${trend.id}`);
    expect(url.searchParams.get("detail")).toBe(trend.title);
  });
});
