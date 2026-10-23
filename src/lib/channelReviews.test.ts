import { beforeEach, describe, expect, it } from "vitest";
import { channelReviewsKey, commentChannelPost, readChannelReviews, shownStatus, skipChannelPost } from "./channelReviews";
import { normalizeFeed } from "./channelFeeds";

const UID = "40f07a18-b087-4c95-ba1f-d5444222968a";
const ID = "moneybees-telegram:2026-10-24:fake-simba-website-scam";

let store: Map<string, string>;
beforeEach(() => {
  store = new Map();
  (globalThis as { window?: unknown }).window = {
    localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) },
  };
});

describe("channel reviews", () => {
  it("writes Skip, Undo and comments under one synced key the job reads", () => {
    skipChannelPost(UID, ID, true);
    expect(readChannelReviews(UID)[ID].skip?.on).toBe(true);
    commentChannelPost(UID, ID, "  shorter please ");
    commentChannelPost(UID, ID, "   ");
    const r = readChannelReviews(UID)[ID];
    expect(r.comments.map((c) => c.text)).toEqual(["shorter please"]);
    expect(r.comments[0].id).toMatch(/^c-[a-z0-9]{8}$/);
    expect(skipChannelPost(UID, ID, false)[ID].skip?.on).toBe(false);
    expect(Object.keys(JSON.parse(store.get(channelReviewsKey(UID))!))).toEqual([ID]);
    expect(channelReviewsKey(UID)).toBe(`content-studio-channelreviews-${UID}`);
  });
  it("reads nothing for no user or a broken key, and drops malformed comments", () => {
    expect(readChannelReviews(null)).toEqual({});
    store.set(channelReviewsKey(UID), "{not json");
    expect(readChannelReviews(UID)).toEqual({});
    store.set(channelReviewsKey(UID), JSON.stringify({ [ID]: { comments: [{ id: "c-1", text: "ok" }, { text: "no id" }, 5] } }));
    expect(readChannelReviews(UID)[ID].comments).toEqual([{ id: "c-1", text: "ok" }]);
  });
  it("shows a Skip or Undo at once, never over a posted post", () => {
    expect(shownStatus("locked", { skip: { on: true, at: "" }, comments: [] })).toBe("skipped");
    expect(shownStatus("skipped", { skip: { on: false, at: "" }, comments: [] })).toBe("planned");
    expect(shownStatus("locked", { skip: { on: false, at: "" }, comments: [] })).toBe("locked");
    expect(shownStatus("posted", { skip: { on: true, at: "" }, comments: [] })).toBe("posted");
    expect(shownStatus("planned")).toBe("planned");
  });
  it("keeps the job's skipped posts and the comments it has made the post again with", () => {
    const items = normalizeFeed({
      business: "MoneyBees",
      channel: "Telegram",
      items: [
        { id: ID, date: "2026-10-24", status: "skipped", title: "Fake Simba", handled: ["c-1", 3] },
        { id: "x", date: "2026-10-25", status: "nope", title: "dropped" },
      ],
    });
    expect(items.map((i) => [i.status, i.handled])).toEqual([["skipped", ["c-1"]]]);
  });
});
