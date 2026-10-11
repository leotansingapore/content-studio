import { describe, expect, it } from "vitest";
import { fitDomain } from "./TrendChart";

describe("fitDomain", () => {
  it("fits a tight follower range in two round steps instead of starting at zero", () => {
    expect(fitDomain(10234, 10290)).toEqual([10200, 10300]);
    expect(fitDomain(980, 1012)).toEqual([980, 1020]);
  });
  it("centres a flat line", () => {
    expect(fitDomain(500, 500)).toEqual([499, 501]);
  });
});
