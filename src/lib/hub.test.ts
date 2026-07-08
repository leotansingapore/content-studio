import { describe, expect, it } from "vitest";
import { hubAccess, type HubMembership } from "./hub";

const base: HubMembership = {
  user_id: "u1",
  email: "a@b.co",
  status: "none",
  is_admin: false,
  industry: null,
  current_period_end: null,
};

describe("hubAccess", () => {
  it("locked when no membership", () => expect(hubAccess(null)).toBe("locked"));
  it("locked when status none or canceled", () => {
    expect(hubAccess({ ...base, status: "none" })).toBe("locked");
    expect(hubAccess({ ...base, status: "canceled" })).toBe("locked");
  });
  it("member for client and active", () => {
    expect(hubAccess({ ...base, status: "client" })).toBe("member");
    expect(hubAccess({ ...base, status: "active" })).toBe("member");
  });
  it("admin wins regardless of status", () =>
    expect(hubAccess({ ...base, status: "none", is_admin: true })).toBe("admin"));
});
