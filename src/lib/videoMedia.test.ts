import { describe, expect, it } from "vitest";
import { exportAll, exportQueue, stopExportQueue } from "./videoMedia";

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

  it("refuses a second run while one is going", async () => {
    let release = () => {};
    const first = exportAll([{ id: "a", run: () => new Promise<void>((r) => (release = r)) }]);
    await expect(exportAll([{ id: "b", run: async () => {} }])).rejects.toThrow("An export is already running.");
    release();
    await first;
  });
});
