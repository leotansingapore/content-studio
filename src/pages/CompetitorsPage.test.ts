import { describe, expect, it } from "vitest";
import { viewFor } from "./CompetitorsPage";

describe("viewFor", () => {
  it("opens on the list, as Fastlane's Brand > Competitors does", () => {
    expect(viewFor(new URLSearchParams(""))).toBe("list");
    expect(viewFor(new URLSearchParams("edit=c-1"))).toBe("list");
  });
  it("opens Their ads for the ad links the app already sends, which leave view=ads out", () => {
    for (const q of ["ad=123", "running=only", "c=outfield-ab12"]) expect(viewFor(new URLSearchParams(q))).toBe("ads");
  });
});
