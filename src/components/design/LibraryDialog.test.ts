import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: {} }));
import { oneLibrary } from "./LibraryDialog";

describe("a library dialog's library", () => {
  it("is made once, however many adds ask for it, together or one after another", async () => {
    const make = vi.fn(async () => ({ id: "lib1", name: "Golf" }));
    const ensure = oneLibrary(null, make);
    const [a, b] = await Promise.all([ensure(), ensure()]);
    const c = await ensure(); // the AI picture finishing after photos were added
    expect([a.id, b.id, c.id]).toEqual(["lib1", "lib1", "lib1"]);
    expect(make).toHaveBeenCalledTimes(1);
  });
  it("is never made again for a library the dialog opened with", async () => {
    const make = vi.fn(async () => ({ id: "other", name: "x" }));
    expect((await oneLibrary({ id: "lib1", name: "Golf" }, make)()).id).toBe("lib1");
    expect(make).not.toHaveBeenCalled();
  });
  it("tries again after a failed make", async () => {
    const make = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue({ id: "lib1", name: "Golf" });
    const ensure = oneLibrary(null, make);
    await expect(ensure()).rejects.toThrow("offline");
    expect((await ensure()).id).toBe("lib1");
  });
});
