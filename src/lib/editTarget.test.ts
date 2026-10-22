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
