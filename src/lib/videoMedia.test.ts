import { describe, expect, it, vi } from "vitest";
import { defaultSettings } from "./videoEdit";
import { currentJoin, endJoin, exportAll, exportQueue, handToEditor, pickupPlan, startExport, stopExportQueue, type ExportJob, type JoinExtra, type PickupPath } from "./videoMedia";

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
    // both exports start in the same millisecond, as the mocked fast route often does
    const now = vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
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
    now.mockRestore();
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

describe("handToEditor", () => {
  it("leaves a done join that endJoin gives to the editor once, with the same extra", async () => {
    const file = new File(["clip"], "mine.mp4", { type: "video/mp4" });
    const extra: JoinExtra = { settings: { wall: true, trimEnd: 12 }, toast: "Your wall of text is ready. Export it when it looks right.", caption: "Cap." };
    await handToEditor(file, extra);
    expect(currentJoin()).toMatchObject({ state: "done", progress: 1, file });
    const j = endJoin();
    expect(j?.file).toBe(file);
    expect(j?.extra).toBe(extra);
    expect(endJoin()).toBeNull();
  });

  it("waits while another video waits for the editor, so a paid one is never overwritten", async () => {
    vi.useFakeTimers();
    try {
      const paid = new File(["avatar"], "avatar.mp4");
      const mine = new File(["clip"], "mine.mp4");
      await handToEditor(paid, { note: "paid" });
      let handed = false;
      const second = handToEditor(mine, { note: "mine" }).then(() => (handed = true));
      await vi.advanceTimersByTimeAsync(3000);
      expect(handed).toBe(false);
      expect(endJoin()?.file).toBe(paid);
      await vi.advanceTimersByTimeAsync(1000);
      await second;
      expect(endJoin()?.extra?.note).toBe("mine");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("pickupPlan", () => {
  const PATHS: PickupPath[] = ["wall", "long", "no-captions", "captions"];
  const source = { kind: "ad", id: "a1", title: "An ad", remixedAt: "2026-10-20T00:00:00.000Z" } as unknown as NonNullable<JoinExtra["source"]>;
  const full: JoinExtra = { toast: "Your talking head is ready", note: "The person is made by AI.", caption: "Cap.", source, draftId: "d1", tab: "face", settings: { captions: false } };

  it("keeps the toast, caption, source, draftId and tab of a hand-off on every path", () => {
    for (const path of PATHS) {
      expect(pickupPlan(full, path)).toEqual({
        keep: { caption: "Cap.", source, draftId: "d1" },
        toast: { title: "Your talking head is ready", description: "The person is made by AI." },
        tab: "face",
      });
    }
  });

  it("asks nothing of an upload with no extra, or a start panel's wall with only its look", () => {
    for (const path of PATHS) {
      expect(pickupPlan(undefined, path)).toEqual({ keep: {}, toast: null });
      expect(pickupPlan({ settings: { wall: true } }, path)).toEqual({ keep: {}, toast: null });
    }
  });

  it("titles a montage's note as it always has, and only on the path with no captions", () => {
    expect(pickupPlan({ note: "No clip fit beat 2, so beat 1 plays longer." }, "no-captions").toast).toEqual({ title: "Your montage is ready", description: "No clip fit beat 2, so beat 1 plays longer." });
    for (const path of ["wall", "long", "captions"] as const) expect(pickupPlan({ note: "A note." }, path).toast).toBeNull();
  });

  it("drops junk read back from a pending clip's JSON, and leaves the default tab out of the URL", () => {
    const junk = { toast: 5, note: "", caption: "", source: "ad:1", draftId: 7, tab: "nope" } as unknown as JoinExtra;
    expect(pickupPlan(junk, "captions")).toEqual({ keep: {}, toast: null });
    expect(pickupPlan({ tab: "style", toast: "Ready" }, "captions")).toEqual({ keep: {}, toast: { title: "Ready" } });
  });
});
