// The Library's sets: named lists of Library item keys, per brand under a synced content-studio- key.
import { afterEach, describe, expect, it, vi } from "vitest";
import { brandDevice } from "@/test/brandDevice";
import { addToSet, createSet, deleteSet, loadSets, removeFromSet, renameSet, restoreSet, sanitizeSet, MAX_SET_NAME } from "./librarySets";

vi.mock("@/lib/supabase", () => ({ SUPABASE_URL: "https://abc.supabase.co", supabase: { auth: { getSession: () => new Promise(() => undefined) } } }));
afterEach(() => vi.unstubAllGlobals());

describe("library sets", () => {
  it("are kept under a content-studio- key, so the sync carries them", () => {
    const local = brandDevice("u1");
    const set = createSet("u1", "  Launch   week ", ["d:p1", "c:c1", "d:p1"])!;
    expect(set.name).toBe("Launch week");
    expect(set.keys).toEqual(["d:p1", "c:c1"]);
    expect(JSON.parse(local.getItem("content-studio-sets-u1")!)[0].id).toBe(set.id);
  });

  it("add only what they don't hold, newest first, and remove what is asked", () => {
    brandDevice("u1");
    const { id } = createSet("u1", "Faves", ["d:p1"])!;
    expect(addToSet("u1", id, ["d:p1", "s:ss1", "j:remix-1"])).toBe(2);
    expect(loadSets("u1")[0].keys).toEqual(["s:ss1", "j:remix-1", "d:p1"]);
    expect(removeFromSet("u1", id, ["j:remix-1"])[0].keys).toEqual(["s:ss1", "d:p1"]);
  });

  it("rename to a real name only, and a deleted set comes back in its place", () => {
    brandDevice("u1");
    const a = createSet("u1", "A")!;
    const b = createSet("u1", "B")!;
    expect(renameSet("u1", a.id, "   ").find((s) => s.id === a.id)?.name).toBe("A");
    expect(renameSet("u1", a.id, "x".repeat(60)).find((s) => s.id === a.id)?.name).toHaveLength(MAX_SET_NAME);
    const gone = deleteSet("u1", b.id)!;
    expect(loadSets("u1").map((s) => s.id)).toEqual([a.id]);
    restoreSet("u1", gone);
    expect(loadSets("u1").map((s) => s.id)).toEqual([b.id, a.id]);
    expect(createSet("u1", "  ")).toBeNull();
  });

  it("drop anything stored that isn't a set", () => {
    expect(sanitizeSet({ id: "nope", name: "x", keys: [] })).toBeNull();
    expect(sanitizeSet({ id: "set-abcd", name: "", keys: [] })).toBeNull();
    expect(sanitizeSet({ id: "set-abcd", name: "Ok", keys: ["d:p1", 3, "bad key", ""] })?.keys).toEqual(["d:p1"]);
  });
});
