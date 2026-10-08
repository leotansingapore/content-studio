import { beforeEach, describe, expect, it } from "vitest";
import { deleteTemplate, loadTemplates, saveTemplate, MAX_TEMPLATES, type BriefTemplate } from "./templates";

const UID = "6d80f027-3395-480c-86a1-8827d3d6cce3";

class MemStorage {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}

const brief = (name: string): Omit<BriefTemplate, "id" | "createdAt"> => ({
  name,
  pillar: "topic",
  audience: "parent",
  funnelStage: null,
  ideaSource: "myth-bust",
  platform: "instagram",
  format: "carousel",
  ctaType: "save-share",
});

beforeEach(() => {
  (globalThis as { window?: unknown }).window = { localStorage: new MemStorage() };
});

describe("templates", () => {
  it("saves per profile, newest first, and reads back", () => {
    saveTemplate(UID, brief("Myth carousel"));
    saveTemplate(UID, { ...brief("Story post"), pillarDetail: "first client" });
    const list = loadTemplates(UID);
    expect(list.map((t) => t.name)).toEqual(["Story post", "Myth carousel"]);
    expect(list[0].pillarDetail).toBe("first client");
    expect(list[1].pillarDetail).toBeUndefined();
    expect(window.localStorage.getItem(`content-studio-templates-${UID}`)).toContain("Myth carousel");
  });

  it("replaces a template saved under the same name and caps the list", () => {
    saveTemplate(UID, brief("Weekly tip"));
    saveTemplate(UID, { ...brief("weekly tip"), platform: "linkedin" });
    expect(loadTemplates(UID)).toHaveLength(1);
    expect(loadTemplates(UID)[0].platform).toBe("linkedin");
    for (let i = 0; i < MAX_TEMPLATES + 3; i++) saveTemplate(UID, brief(`T${i}`));
    expect(loadTemplates(UID)).toHaveLength(MAX_TEMPLATES);
  });

  it("deletes by id and survives corrupt storage", () => {
    const [t] = saveTemplate(UID, brief("Gone"));
    expect(deleteTemplate(UID, t.id)).toEqual([]);
    window.localStorage.setItem(`content-studio-templates-${UID}`, "{not json");
    expect(loadTemplates(UID)).toEqual([]);
    expect(loadTemplates(null)).toEqual([]);
  });
});
