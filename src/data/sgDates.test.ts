import { describe, expect, it } from "vitest";
import { sgDateLabel, sgDatesBetween } from "./sgDates";

describe("sgDatesBetween", () => {
  it("lists MOM holidays, observed Mondays included, inside the range only", () => {
    const nov = sgDatesBetween("2026-11-01", "2026-11-30");
    expect(nov.get("2026-11-08")?.map((d) => d.title)).toEqual(["Deepavali"]);
    expect(nov.get("2026-11-09")?.[0]).toMatchObject({ title: "Deepavali (observed)", kind: "holiday" });
    expect(nov.has("2026-12-25")).toBe(false);
  });

  it("repeats money moments every year and flags the moving ones", () => {
    const span = sgDatesBetween("2026-12-01", "2027-04-30");
    expect(span.get("2026-12-31")?.[0]).toMatchObject({ kind: "money", approx: false });
    expect(span.get("2027-02-15")?.[0]).toMatchObject({ title: "Budget day", approx: true });
    expect(span.get("2027-04-18")?.[0].title).toBe("Income tax filing deadline");
    expect(span.get("2027-02-08")?.[0].title).toBe("Chinese New Year (observed)");
  });

  it("keeps two moments on the same day", () =>
    expect(sgDatesBetween("2026-06-15", "2026-06-15").get("2026-06-15")).toHaveLength(2));
});

describe("sgDateLabel", () => {
  it("says approx. only for a moving date", () => {
    expect(sgDateLabel({ date: "2026-02-15", title: "Budget day", kind: "money", approx: true })).toBe(
      "Budget day (approx.)",
    );
    expect(sgDateLabel({ date: "2026-11-08", title: "Deepavali", kind: "holiday" })).toBe("Deepavali");
  });
});
