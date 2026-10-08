import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const UID = "u1";
let map: Map<string, string>;
beforeEach(() => {
  map = new Map();
  vi.stubGlobal("window", {
    localStorage: {
      get length() {
        return map.size;
      },
      key: (i: number) => [...map.keys()][i] ?? null,
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v),
      removeItem: (k: string) => void map.delete(k),
    },
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("video editing skills", () => {
  it("shows the old single look as a default skill, without writing until a save", async () => {
    const { loadSkills } = await import("@/lib/videoSkills");
    map.set(`content-studio-videolook-${UID}`, JSON.stringify({ style: "minimal", size: 1.2 }));
    expect(loadSkills(UID)).toEqual([{ id: "my-look", name: "My look", look: { style: "minimal", size: 1.2 }, isDefault: true, updatedAt: "" }]);
    expect(map.has(`content-studio-videoskills-${UID}`)).toBe(false);
  });

  it("saves named skills newest first, one default at a time, and keeps the migrated look on first save", async () => {
    const { saveSkill, loadSkills, defaultSkill } = await import("@/lib/videoSkills");
    map.set(`content-studio-videolook-${UID}`, JSON.stringify({ style: "minimal" }));
    saveSkill(UID, { id: "a", name: "Podcast clip", look: { fit: "framed" }, prompt: "Hook: the most surprising number I say", isDefault: true });
    const list = loadSkills(UID);
    expect(list.map((s) => s.name)).toEqual(["Podcast clip", "My look"]);
    expect(defaultSkill(list)?.id).toBe("a");
    expect(list[1].isDefault).toBeUndefined();
    saveSkill(UID, { id: "b", name: "Quick tip", look: { style: "bold" } });
    expect(defaultSkill(loadSkills(UID))?.id).toBe("a");
  });

  it("removes a skill, drops malformed ones and caps text", async () => {
    const { saveSkill, removeSkill, loadSkills } = await import("@/lib/videoSkills");
    saveSkill(UID, { id: "a", name: "x".repeat(80), look: {}, prompt: "y".repeat(900) });
    const [s] = loadSkills(UID);
    expect(s.name).toHaveLength(40);
    expect(s.prompt).toHaveLength(500);
    expect(removeSkill(UID, "a")).toEqual([]);
    map.set(`content-studio-videoskills-${UID}`, JSON.stringify([{ id: "z", name: "", look: {} }, { id: "y", name: "Ok", look: [] }, { id: "w", name: "Fine", look: { size: 1 } }]));
    expect(loadSkills(UID).map((x) => x.id)).toEqual(["w"]);
  });

  it("names a new skill from the last vibe ask, else numbers it", async () => {
    const { suggestName } = await import("@/lib/videoSkills");
    expect(suggestName(["bigger yellow captions at the top, cut pauses"], [])).toBe("Bigger yellow captions at");
    expect(suggestName([], [{ id: "a", name: "My style 1", look: {}, updatedAt: "" }])).toBe("My style 2");
  });
});
