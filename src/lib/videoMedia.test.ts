import { describe, expect, it, vi } from "vitest";
import { defaultSettings } from "./videoEdit";
import { exportAll, exportQueue, startExport, stopExportQueue, type ExportJob } from "./videoMedia";

vi.mock("@/lib/fastExport", () => ({ exportFast: async () => ({ blob: new Blob(["mp4"]), ext: "mp4", seconds: 3, cap: 0, label: "Instagram" }) }));

describe("export all", () => {
  it("runs the exports one after another, notes a failure and keeps going", async () => {
    const order: string[] = [];
    const run = (id: string, fail = false) => ({
      id,
      run: async () => {
        expect(exportQueue()?.running).toBe(true);
        order.push(`${id}:${exportQueue()?.at} of ${exportQueue()?.of}`);
        if (fail) throw new Error("No video file.");
      },
    });
    await exportAll([run("a"), run("b", true), run("c")]);
    expect(order).toEqual(["a:1 of 3", "b:2 of 3", "c:3 of 3"]);
    const q = exportQueue()!;
    expect(q.running).toBe(false);
    expect(q.failed.b).toBe("No video file.");
    // no startExport ran here, so nothing was made
    expect(q.failed.a).toBe("The export did not finish.");
  });

  it("stops after the export running when asked", async () => {
    const ran: string[] = [];
    const runs = ["a", "b", "c"].map((id) => ({ id, run: async () => { ran.push(id); if (id === "a") stopExportQueue(); } }));
    await exportAll(runs);
    expect(ran).toEqual(["a"]);
    expect(exportQueue()).toMatchObject({ at: 1, of: 3, ids: ["a", "b", "c"], running: false, stopping: true });
  });

  it("checks each file it made before the next export starts, by the run's id, and notes a check that breaks", async () => {
    // a made file: startExport's fast route (mocked above) hands back a blob, delivered under the version's name
    vi.stubGlobal("document", { querySelector: () => ({}), fonts: { load: async () => [] }, createElement: () => ({ click() {} }) });
    const order: string[] = [];
    const run = (id: string) => ({
      id,
      run: async () => { order.push(`export ${id}`); await startExport(`Budget tips ${id}`, new Blob(["v"]), [], defaultSettings()); },
      check: async (made: ExportJob) => {
        order.push(`check ${made.name}`);
        if (id === "b") throw new Error("decode failed");
        return { issues: [{ id: "quiet" as const, text: "Quiet" }], read: true };
      },
    });
    await exportAll([run("a"), run("b")]);
    vi.unstubAllGlobals();
    expect(order).toEqual(["export a", "check Budget tips a", "export b", "check Budget tips b"]);
    const q = exportQueue()!;
    expect(Object.keys(q.files)).toEqual(["a", "b"]);
    expect(q.checks.a).toEqual({ issues: [{ id: "quiet", text: "Quiet" }], read: true });
    expect(q.checks.b).toEqual({ issues: [], read: false });
  });

  it("refuses a second run while one is going", async () => {
    let release = () => {};
    const first = exportAll([{ id: "a", run: () => new Promise<void>((r) => (release = r)) }]);
    await expect(exportAll([{ id: "b", run: async () => {} }])).rejects.toThrow("An export is already running.");
    release();
    await first;
  });
});
