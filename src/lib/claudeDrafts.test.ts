import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deleteDraft, loadDrafts, setDraftStatus, undoPosted } from "@/lib/draftHistory";

const UID = "ff72c375-389e-4dd0-86c4-a166307b8751";
let store: Map<string, string>;

beforeEach(() => {
  store = new Map();
  const ls = {
    get length() {
      return store.size;
    },
    key: (i: number) => [...store.keys()][i] ?? null,
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  vi.stubGlobal("window", { localStorage: ls });
});
afterEach(() => vi.unstubAllGlobals());

const claude = (id: string, over: Record<string, unknown> = {}) =>
  JSON.stringify({ id, createdAt: "2026-10-08T03:00:00.000Z", hook: "From Claude", draft: "Body", platform: "instagram", format: "carousel", status: "draft", ...over });

describe("drafts Claude saved", () => {
  it("joins My posts once, newest first, and their sync rows are removed", () => {
    store.set(`content-studio-drafts-${UID}`, JSON.stringify([{ id: "old", draft: "x", createdAt: "2026-10-01" }]));
    store.set(`content-studio-mcpdraft-claude-a1-${UID}`, claude("claude-a1"));
    store.set(`content-studio-mcpdraft-claude-b2-${UID}`, claude("claude-b2", { createdAt: "2026-10-08T04:00:00.000Z", status: "scheduled", scheduledFor: "2026-10-20T19:30" }));
    const list = loadDrafts(UID);
    expect(list.map((d) => d.id)).toEqual(["claude-b2", "claude-a1", "old"]);
    expect(list[0]).toMatchObject({ status: "scheduled", scheduledFor: "2026-10-20T19:30", platform: "instagram", format: "carousel" });
    expect([...store.keys()]).toEqual([`content-studio-drafts-${UID}`]);
    expect(loadDrafts(UID)).toHaveLength(3);
  });

  it("so deleting one sticks", () => {
    store.set(`content-studio-mcpdraft-claude-a1-${UID}`, claude("claude-a1"));
    deleteDraft(UID, "claude-a1");
    expect(loadDrafts(UID)).toEqual([]);
  });

  it("leaves another profile's rows alone and cleans up bad values", () => {
    store.set(`content-studio-mcpdraft-claude-p1-${UID}~p9`, claude("claude-p1"));
    store.set(`content-studio-mcpdraft-claude-x1-${UID}`, claude("claude-x1", { platform: "myspace", status: "scheduled", scheduledFor: "soon" }));
    store.set(`content-studio-mcpdraft-claude-bad-${UID}`, "{not json");
    const list = loadDrafts(UID);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: "claude-x1", platform: "linkedin", status: "draft" });
    expect(list[0].scheduledFor).toBeUndefined();
    expect([...store.keys()].sort()).toEqual([`content-studio-drafts-${UID}`, `content-studio-mcpdraft-claude-p1-${UID}~p9`]);
  });
});

describe("Undo on Mark posted", () => {
  it("keeps a draft Claude saved while the Undo was on screen", () => {
    store.set(`content-studio-drafts-${UID}`, JSON.stringify([{ id: "s", draft: "x", createdAt: "2026-10-01", status: "scheduled", scheduledFor: "2026-10-20" }]));
    const before = loadDrafts(UID);
    setDraftStatus(UID, "s", "posted");
    store.set(`content-studio-mcpdraft-claude-x1-${UID}`, claude("claude-x1"));
    const after = undoPosted(UID, before[0], before);
    expect(after.map((d) => d.id)).toEqual(["claude-x1", "s"]);
    expect(after[1]).toMatchObject({ status: "scheduled", scheduledFor: "2026-10-20" });
    expect(loadDrafts(UID).map((d) => d.id)).toEqual(["claude-x1", "s"]);
  });
});
