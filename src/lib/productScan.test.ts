import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EdgeError } from "@/lib/edgeFn";
import type { ScannedProduct } from "../../supabase/functions/brand-dna/logic.ts";

const callFn = vi.fn();
vi.mock("@/lib/edgeFn", async (orig) => ({ ...(await orig<typeof import("@/lib/edgeFn")>()), callFn: (...a: unknown[]) => callFn(...a) }));
const toast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ toast: (...a: unknown[]) => toast(...a) }));
const files = new Map<string, Blob>();
vi.mock("@/lib/deviceFiles", () => ({
  getFile: async (k: string) => files.get(k),
  putFile: async (k: string, b: Blob) => void files.set(k, b),
  deleteFile: async (k: string) => void files.delete(k),
}));
const media: { key: string; folder: string; type?: string }[] = [];
let stored = 0;
vi.mock("@/lib/mediaLibrary", () => ({
  addMedia: (_u: string, m: { key: string; folder: string }) => void media.push(m),
  storePicture: async (b: Blob) => {
    const key = `cimg-stored${++stored}`;
    files.set(key, b);
    return { key, url: "data:", width: 1080, height: 720 };
  },
}));

const s = await import("./productScan");
const p = await import("./products");

class MemStorage {
  s = new Map<string, string>();
  getItem(k: string) { return this.s.get(k) ?? null; }
  setItem(k: string, v: string) { this.s.set(k, v); }
  removeItem(k: string) { this.s.delete(k); }
}
let storage: MemStorage;
let path = "/brand";
beforeEach(() => {
  storage = new MemStorage();
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("window", { localStorage: storage, dispatchEvent: () => true });
  vi.stubGlobal("location", { get pathname() { return path; } });
  vi.stubGlobal("fetch", async (u: string) => ({ blob: async () => new Blob([u.slice(0, 30)], { type: "image/jpeg" }) }));
  path = "/brand";
  callFn.mockReset();
  toast.mockReset();
  files.clear();
  media.length = 0;
});
afterEach(() => vi.unstubAllGlobals());

const row = (o: Partial<ScannedProduct> = {}): ScannedProduct => ({ name: "Retirement review", what: "A review.", forWho: "50s", generic: "a retirement review", offerP: 0.9, namedP: 0.1, ...o });
// each answer is its own scan (the picture queue keeps its state per scan for the visit, as it does across tests here)
let scans = 0;
const answer = (items: ScannedProduct[], kind: "products" | "service" | null = "service") => ({ site: "https://acme.sg", readAt: `2026-10-21T08:00:${String(++scans).padStart(2, "0")}.000Z`, pagesRead: ["https://acme.sg/", "https://acme.sg/services"], kind, items });
const settle = () => new Promise((r) => setTimeout(r, 0));
const idle = async () => {
  for (let i = 0; i < 20; i++) await settle();
};

describe("the review's rows", () => {
  it("ticks rows Jev rates 0.6 or more, puts the rest under Maybe not yours, and shows the chip at 0.5", () => {
    const w = { scan: { ...answer([row({ name: "A", offerP: 0.6 }), row({ name: "B", offerP: 0.59 }), row({ name: "C", offerP: 0.95, namedP: 0.5 }), row({ name: "D", offerP: 0.2, namedP: 0.49 })]) }, ticks: {}, pics: {} };
    const rows = s.reviewRows([], w);
    expect(rows.map((r) => [r.row.name, r.group, r.ticked, r.named])).toEqual([
      ["A", "yours", true, false], ["C", "yours", true, true], ["B", "maybe", false, false], ["D", "maybe", false, false],
    ]);
    expect(s.addPlan([], rows)).toEqual({ count: 2, line: null });
    // a hand tick wins either way
    const hand = s.reviewRows([], { ...w, ticks: { 0: false, 1: true } });
    expect(hand.filter((r) => r.ticked).map((r) => r.row.name)).toEqual(["C", "B"]);
  });

  it("leaves every row unticked with no chip when Jev answered nothing", () => {
    const rows = s.reviewRows([], { scan: answer([row({ offerP: null, namedP: null }), row({ name: "Other", offerP: null, namedP: null })]), ticks: {}, pics: {} });
    expect(rows.every((r) => r.group === "unsorted" && !r.ticked && !r.named)).toBe(true);
    expect(s.addPlan([], rows).count).toBe(0);
  });

  it("marks a row already in the list and never ticks it", () => {
    const saved = [{ id: "pd-saved01", name: "retirement REVIEW", what: "", forWho: "", pictures: [], sources: [], use: true, from: "you" as const, addedAt: "" }];
    const rows = s.reviewRows(saved, { scan: answer([row(), row({ name: "New" })]), ticks: { 0: true }, pics: {} });
    expect(rows.map((r) => [r.row.name, r.added, r.ticked])).toEqual([["Retirement review", true, false], ["New", false, true]]);
  });

  it("refuses past 24 with the room left, and says when none is left", () => {
    const saved = Array.from({ length: 23 }, (_, i) => ({ id: `pd-s${String(i).padStart(4, "0")}`, name: `S${i}`, what: "", forWho: "", pictures: [], sources: [], use: true, from: "you" as const, addedAt: "" }));
    const rows = s.reviewRows(saved, { scan: answer([row({ name: "X" }), row({ name: "Y" })]), ticks: {}, pics: {} });
    expect(s.addPlan(saved, rows)).toEqual({ count: 2, line: "Only 1 more fit. Untick some, or remove one first." });
    const full = [...saved, { ...saved[0], id: "pd-s9999", name: "S24" }];
    expect(s.addPlan(full, s.reviewRows(full, { scan: answer([row({ name: "X" })]), ticks: {}, pics: {} })).line).toBe("24 is the most a brand can keep. Remove one to add another.");
  });
});

describe("startScan", () => {
  it("sends the products mode, keeps the answer for review and fetches its pictures one at a time", async () => {
    callFn.mockImplementation(async (_fn: string, body: { mode: string; url: string }) =>
      body.mode === "products" ? answer([row({ picture: "https://acme.sg/a.jpg" }), row({ name: "No picture" }), row({ name: "B", picture: "https://acme.sg/b.jpg" })]) : { dataUrl: `data:image/jpeg;base64,${body.url}` });
    await s.startScan("u1", " acme.sg ");
    expect(callFn.mock.calls[0]).toEqual(["brand-dna", { mode: "products", url: "acme.sg" }, expect.any(String)]);
    expect(s.loadWaiting("u1")?.scan.items).toHaveLength(3);
    await idle();
    expect(callFn.mock.calls.slice(1).map((c) => c[1])).toEqual([{ mode: "image", url: "https://acme.sg/a.jpg" }, { mode: "image", url: "https://acme.sg/b.jpg" }]);
    const w = s.loadWaiting("u1")!;
    expect(Object.keys(w.pics)).toEqual(["https://acme.sg/a.jpg", "https://acme.sg/b.jpg"]);
    expect(JSON.parse(storage.getItem("cs-products-scan-u1")!).scan.site).toBe("https://acme.sg");
    // a reload (a fresh module) carries on the review without fetching what it already has
    vi.resetModules();
    const again = await import("./productScan");
    again.fetchReviewPictures("u1");
    await idle();
    expect(callFn).toHaveBeenCalledTimes(3);
    s.discardScan("u1");
    expect(files.size).toBe(0);
  });

  it("says the refused line on a 403 and the cap's own line on a 429, keeping nothing", async () => {
    // decision 2's line whatever the server's words
    callFn.mockRejectedValueOnce(new EdgeError("Forbidden", 403, "not_enabled"));
    await s.startScan("u1", "acme.sg");
    expect(s.scanFailedLine("u1")).toBe(s.REFUSED);
    callFn.mockRejectedValueOnce(new EdgeError("You've used all 10 for today. It resets at 8am Singapore time.", 429, "daily_limit"));
    await s.startScan("u1", "acme.sg");
    expect(s.scanFailedLine("u1")).toBe("You've used all 10 for today. It resets at 8am Singapore time.");
    expect(s.loadWaiting("u1")).toBeNull();
  });

  it("tells you where you are when it finishes after you left /brand", async () => {
    callFn.mockResolvedValueOnce(answer([]));
    path = "/calendar";
    await s.startScan("u1", "acme.sg");
    expect(toast).toHaveBeenCalledWith({ title: "Your products scan is ready", description: "Open Brand kit to check it." });
  });
});

describe("addFromScan", () => {
  it("adds the ticked rows only, files their pictures in Media's Products folder and deletes the rest", async () => {
    callFn.mockImplementation(async (_fn: string, body: { mode: string; url: string }) =>
      body.mode === "products" ? answer([row({ name: "Yes", picture: "https://acme.sg/a.jpg" }), row({ name: "Maybe", offerP: 0.3, picture: "https://acme.sg/b.jpg" })], "products") : { dataUrl: "data:image/jpeg;base64,AAAA" });
    await s.startScan("u1", "acme.sg");
    await idle();
    expect(files.size).toBe(2);
    expect(s.addFromScan("u1")).toEqual({ added: 1 });
    const list = p.loadProducts("u1");
    expect(list.items.map((x) => x.name)).toEqual(["Yes"]);
    expect(list.kind).toBe("products");
    expect(media).toEqual([expect.objectContaining({ key: list.items[0].pictures[0], folder: "Products", type: "product" })]);
    expect([...files.keys()]).toEqual([list.items[0].pictures[0]]);
    expect(s.loadWaiting("u1")).toBeNull();

    // a second scan of the same site skips what is already there
    callFn.mockImplementation(async (_fn: string, body: { mode: string; url: string }) =>
      body.mode === "products" ? answer([row({ name: "Yes", picture: "https://acme.sg/a.jpg" }), row({ name: "Maybe", offerP: 0.3, picture: "https://acme.sg/b.jpg" })]) : { dataUrl: "data:image/jpeg;base64,CCCC" });
    await s.startScan("u1", "acme.sg");
    await idle();
    s.setTick("u1", 1, true);
    expect(s.addFromScan("u1")).toEqual({ added: 1 });
    expect(p.loadProducts("u1").items.map((x) => x.name)).toEqual(["Yes", "Maybe"]);
    // both pictures were fetched again for the new review; the one not added left the device
    expect(callFn.mock.calls.filter((c) => c[1].mode === "image")).toHaveLength(4);
    expect(files.size).toBe(2);
  });
});

describe("a saved product's picture on another device", () => {
  it("is fetched once from its source and kept under the product's own key", async () => {
    callFn.mockResolvedValue({ dataUrl: "data:image/jpeg;base64,BBBB" });
    const prod = { id: "pd-other01", name: "Wealth plan", what: "", forWho: "", pictures: ["cimg-onother1"], sources: ["https://acme.sg/w.jpg"], use: true, from: "website" as const, addedAt: "" };
    const file = await s.pictureFile("u1", prod);
    expect(file?.name).toBe("Wealth-plan.jpg");
    expect(files.has("cimg-onother1")).toBe(true);
    expect([...files.keys()]).toEqual(["cimg-onother1"]);
    expect(media).toEqual([expect.objectContaining({ key: "cimg-onother1", folder: "Products" })]);
    // on this device now: no second fetch
    await s.pictureFile("u1", prod);
    expect(callFn).toHaveBeenCalledTimes(1);
  });

  it("is not fetched when the device already has it", async () => {
    files.set("cimg-alreadyhere", new Blob(["x"]));
    s.ensurePicture("u1", "cimg-alreadyhere", "https://acme.sg/here.jpg", "Here");
    await idle();
    expect(callFn).not.toHaveBeenCalled();
    expect(s.pictureState("cimg-alreadyhere")).toBe("done");
  });

  const gif = { id: "pd-gif00001", name: "Loop", what: "", forWho: "", pictures: ["cimg-gifloop1"], sources: ["https://acme.sg/loop.gif"], use: true, from: "website" as const, addedAt: "" };
  const nextVisit = async () => {
    vi.resetModules();
    return await import("./productScan");
  };

  it("is asked for once when the site refuses the picture itself, and not again on the next visit or a press", async () => {
    callFn.mockRejectedValue(new EdgeError("That address isn't a PNG, JPEG or WebP picture. Upload one instead.", 422, "not_image"));
    s.ensurePicture("u1", gif.pictures[0], gif.sources[0], gif.name);
    await idle();
    expect(s.pictureState(gif.pictures[0])).toBe("failed");
    const next = await nextVisit();
    next.ensurePicture("u1", gif.pictures[0], gif.sources[0], gif.name);
    await idle();
    expect(next.pictureState(gif.pictures[0])).toBe("failed");
    expect(await next.pictureFile("u1", gif)).toBeNull();
    expect(callFn).toHaveBeenCalledTimes(1);
  });

  it("is asked for again on the next visit when the site never answered", async () => {
    const down = { ...gif, pictures: ["cimg-sitedown"], sources: ["https://acme.sg/down.jpg"] };
    callFn.mockRejectedValue(new EdgeError("Couldn't fetch that picture. Upload one instead.", 502, "failed"));
    s.ensurePicture("u1", down.pictures[0], down.sources[0], down.name);
    await idle();
    const next = await nextVisit();
    next.ensurePicture("u1", down.pictures[0], down.sources[0], down.name);
    await idle();
    expect(callFn).toHaveBeenCalledTimes(2);
  });

  it("is null for an upload this device doesn't have", async () => {
    const prod = { id: "pd-upload01", name: "Mine", what: "", forWho: "", pictures: ["cimg-uploaded"], sources: [""], use: true, from: "you" as const, addedAt: "" };
    expect(await s.pictureFile("u1", prod)).toBeNull();
    expect(callFn).not.toHaveBeenCalled();
  });
});

describe("scanOf", () => {
  it("keeps rows with a name and reads a missing Jev answer as none", () => {
    const sc = s.scanOf({ site: "https://acme.sg", items: [{ name: "" }, { name: "Ok", offerP: "x" }, null], kind: "shop" }, "2026-10-21T00:00:00.000Z")!;
    expect(sc.items).toEqual([{ name: "Ok", what: "", forWho: "", generic: "", offerP: null, namedP: null }]);
    expect(sc.kind).toBeNull();
    expect(sc.readAt).toBe("2026-10-21T00:00:00.000Z");
    expect(s.scanOf({ nope: 1 }, "")).toBeNull();
  });
});
