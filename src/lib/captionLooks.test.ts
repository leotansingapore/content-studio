import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { STYLE_IDS, defaultSettings, type EditSettings, type Word } from "./videoEdit";
import { drawFrame, planFor } from "./videoMedia";

vi.mock("@/lib/fastExport", () => ({ exportFast: async () => ({ blob: new Blob(["mp4"]), ext: "mp4", seconds: 3, cap: 0, label: "Instagram" }) }));

/** A 1080x1920 context that keeps every call and every property set, in order; text is 0.5 em a character. */
function recorder() {
  const log: unknown[] = [];
  const state: Record<string, unknown> = { font: "10px sans-serif" };
  const px = () => Number(/(\d+(?:\.\d+)?)px/.exec(String(state.font))?.[1] ?? 10);
  const ctx: CanvasRenderingContext2D = new Proxy({} as CanvasRenderingContext2D, {
    get: (_, k) => {
      if (k === "canvas") return { width: 1080, height: 1920 };
      if (typeof k === "string" && k in state) return state[k];
      if (k === "measureText") return (t: string) => ({ width: Math.round(t.length * px() * 0.5 * 100) / 100 });
      if (k === "createLinearGradient" || k === "createRadialGradient") return () => ({ addColorStop: () => {} });
      return (...args: unknown[]) => {
        log.push([k, ...args.map((a) => (typeof a === "number" ? Math.round(a * 100) / 100 : a))]);
        return undefined;
      };
    },
    set: (_, k, v) => {
      state[k as string] = v;
      log.push([k, v]);
      return true;
    },
  });
  return { ctx, log };
}

// said with a number, a dollar figure, a sentence break and a pause, so every caption rule comes into play
const WORDS: Word[] = "Most people pay $500 for cover they never read. Here is the 3% rule I use with every client today."
  .split(" ")
  .map((w, i) => ({ w, s: i * 0.4 + (i > 8 ? 1.2 : 0), e: i * 0.4 + 0.32 + (i > 8 ? 1.2 : 0) }));
const VIDEO = { videoWidth: 1080, videoHeight: 1920 } as HTMLVideoElement;

function draw(s: EditSettings, src: number, still = false) {
  const { ctx, log } = recorder();
  const plan = planFor(WORDS, 10, s);
  drawFrame(ctx, { video: VIDEO, settings: s, ...plan, src, out: src, total: plan.total, still });
  return log;
}

describe("today's captions (pinned at c49a22ca, before key words)", () => {
  it("draw every style, box, animation, case and number rule the same way as before", () => {
    const out: string[] = [];
    for (const style of STYLE_IDS) {
      for (const extra of [{}, { captionBox: "pill" as const }, { captionBox: "word" as const, font: "clean" as const }, { captionAnim: "type" as const, uppercase: false }, { highlightNumbers: true, wordsPerCaption: 5, size: 1.3 }, { highlightNumbers: false, position: "top" as const, captionAnim: "slide" as const }]) {
        const s: EditSettings = { ...defaultSettings(style), progressBar: false, punchIn: false, ...extra };
        for (const [src, still] of [[0.1, false], [1.25, true], [1.3, false], [4.85, false], [6.05, true]] as const) out.push(JSON.stringify(draw(s, src, still)));
      }
    }
    expect(out.length).toBe(6 * 6 * 5);
    expect(out.join("").includes("fillText")).toBe(true);
    expect(createHash("sha256").update(out.join("\n")).digest("hex")).toBe("5088c03ada6d8a8a5e0a7a4881a09a9a4b277b4de4b7b8b2111f3ca3c4e9967a");
  });
});
