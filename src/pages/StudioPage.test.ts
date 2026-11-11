// Create > Start: the topic box and the Post tile lead to the same place in the same number of steps.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ SUPABASE_URL: "https://abc.supabase.co", supabase: { auth: { getSession: () => new Promise(() => undefined) } } }));

import { writeTarget } from "./StudioPage";

describe("writeTarget", () => {
  it("opens the writer on its last step with the topic typed", () => {
    expect(writeTarget("  CPF myths ")).toBe("/generate?detail=CPF+myths");
  });
  it("asks for the topic first when the box is empty, rather than opening the writer on step one", () => {
    expect(writeTarget("")).toBeNull();
    expect(writeTarget("   ")).toBeNull();
  });
});
