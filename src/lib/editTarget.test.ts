import { describe, expect, it } from "vitest";
import { currentEditTarget, registerEditTarget, type EditTarget } from "@/lib/editTarget";

const target = (title: string): EditTarget => ({
  kind: "carousel",
  title,
  slides: ["CPF LIFE pays for life"],
  onScreen: 1,
  propose: async () => ({ reply: "", preview: "", flags: [], apply: () => ({ done: "", undo: () => {} }) }),
});

describe("edit target registry", () => {
  it("is empty until a page registers, and empty again after that page's unregister", () => {
    expect(currentEditTarget()).toBeNull();
    const a = target("5 CPF myths");
    const off = registerEditTarget(a);
    expect(currentEditTarget()).toBe(a);
    off();
    expect(currentEditTarget()).toBeNull();
  });

  it("a second page replaces the first, and the first page's late unregister leaves the second open", () => {
    const a = target("5 CPF myths");
    const b = target("MediShield Life in 30 seconds");
    const offA = registerEditTarget(a);
    const offB = registerEditTarget(b);
    expect(currentEditTarget()).toBe(b);
    offA();
    expect(currentEditTarget()).toBe(b);
    offB();
    expect(currentEditTarget()).toBeNull();
  });
});

describe("a video edit's preview in words (replay D14)", () => {
  it("says the changed settings as a person would, never raw keys or hex", async () => {
    const { colourName, settingWords } = await import("./editTarget");
    expect(settingWords(["position", "size", "baseColor"], { position: "top", size: 1.3, baseColor: "#FFD92B" })).toBe("Captions at the top, captions 1.3 times the usual size, yellow captions");
    expect(settingWords(["removeFillers", "progressBar", "maxPause"], { removeFillers: true, progressBar: false, maxPause: 0 })).toBe("Ums and uhs cut, progress bar off, every pause kept");
    expect(["#FFFFFF", "#111111", "#E11D48", "#2563EB", "nope"].map(colourName)).toEqual(["white", "black", "red", "blue", "a new colour"]);
  });
});
