import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  uid: "u1" as string | null,
  rows: [] as Record<string, unknown>[],
  error: null as { message: string } | null,
  eqs: [] as unknown[][],
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: db.uid ? { user: { id: db.uid } } : null } }) },
    from: () => {
      let rows = db.rows;
      const query = {
        select: () => query,
        eq: (col: string, val: unknown) => {
          db.eqs.push([col, val]);
          rows = rows.filter((r) => r[col] === val);
          return query;
        },
        maybeSingle: async () => {
          if (db.error) return { data: null, error: db.error };
          if (rows.length > 1) return { data: null, error: { message: "PGRST116" } };
          return { data: rows[0] ?? null, error: null };
        },
      };
      return query;
    },
  },
}));

import { fetchMembership, hubAccess, type HubMembership } from "./hub";

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

describe("fetchMembership", () => {
  beforeEach(() => {
    db.uid = "u1";
    db.error = null;
    db.eqs = [];
    db.rows = [
      { ...base, user_id: "u1", is_admin: true },
      { ...base, user_id: "u2", email: "c@d.co", status: "client" },
    ];
  });

  it("reads only the signed-in account's row, so an admin who can read every row still gets in", async () => {
    const m = await fetchMembership();
    expect(db.eqs).toEqual([["user_id", "u1"]]);
    expect(m?.user_id).toBe("u1");
    expect(hubAccess(m)).toBe("admin");
  });

  it("null when signed out", async () => {
    db.uid = null;
    expect(await fetchMembership()).toBeNull();
  });

  it("throws on a failed read instead of answering locked", async () => {
    db.error = { message: "network" };
    await expect(fetchMembership()).rejects.toEqual({ message: "network" });
  });
});
