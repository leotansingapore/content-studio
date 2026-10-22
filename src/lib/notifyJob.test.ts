import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: { functions: { invoke: vi.fn() } }, SUPABASE_URL: "", SUPABASE_ANON_KEY: "" }));

import { STOCK } from "./notifyJob";

describe("the notification stack's stock clip", () => {
  it("searches for an Asian person first (Leo: people are Singaporean by default), with the city at night as the fallback", () => {
    expect(STOCK.search).toMatch(/\basian\b/i);
    expect(STOCK.again).toBe("city night");
  });

  it("asks Jev about the scene in words a Pexels page name can match: page names never say who is in the clip", () => {
    // a beat naming the person's race made Jev doubt every candidate (none 0.00 -> 0.13, 22 Oct) without telling them apart
    expect(STOCK.scene).not.toMatch(/asian|singapor/i);
  });
});
