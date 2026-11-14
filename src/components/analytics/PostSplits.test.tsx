// Analytics' splits over What wins: posted posts with numbers grouped by platform, format, audience or campaign, each
// group's count and average engagement, the split in ?split=, a split with one group left out, Leo's sign-ins only.
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { TrackedPost } from "@/lib/analytics";

const as = vi.hoisted(() => ({ user: { id: "u1", email: "leo@x" } as null | { id: string; email: string } }));
vi.mock("@/lib/useLeoOnly", async (actual) => ({ ...(await actual<typeof import("@/lib/useLeoOnly")>()), useLeoUser: () => as.user }));
vi.mock("@/lib/supabase", () => ({ SUPABASE_URL: "https://abc.supabase.co", supabase: {} }));

import PostSplits, { splitPosts } from "./PostSplits";

const post = (o: Partial<TrackedPost>) => ({ platform: "instagram", format: "carousel", audience: "parent", engagementTotal: 10, ...o }) as TrackedPost;
const posts = [
  post({ engagementTotal: 30, campaign: { id: "c1", post: 1, day: 1 } }),
  post({ engagementTotal: 10, campaign: { id: "c1", post: 2, day: 2 } }),
  post({ platform: "tiktok", format: "short-video", engagementTotal: 5 }),
];
const draw = (list: TrackedPost[], path = "/analytics") =>
  renderToStaticMarkup(
    <MemoryRouter initialEntries={[path]}>
      <PostSplits userId="u1" posts={list} />
    </MemoryRouter>,
  ).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("splitPosts", () => {
  it("groups by one field with each group's count and average engagement, best first", () => {
    expect(splitPosts(posts, "platform")).toEqual([
      { key: "instagram", label: "Instagram", count: 2, avg: 20 },
      { key: "tiktok", label: "TikTok", count: 1, avg: 5 },
    ]);
    expect(splitPosts(posts, "format").map((r) => r.label)).toEqual(["Carousels", "Short video"]);
    expect(splitPosts([post({ format: "green-screen" })], "format")[0].label).toBe("Green screen");
    expect(splitPosts(posts, "audience")).toEqual([{ key: "parent", label: "Parents", count: 3, avg: 15 }]);
    expect(splitPosts(posts, "campaign", new Map([["c1", "Kueh lovers, November"]]))).toEqual([
      { key: "c1", label: "Kueh lovers, November", count: 2, avg: 20 },
      { key: "", label: "No campaign", count: 1, avg: 5 },
    ]);
    expect(splitPosts([post({ engagementTotal: 1 }), post({ engagementTotal: 2 })], "platform")[0].avg).toBe(1.5);
    expect(splitPosts([post({ audience: "" })], "audience")[0].label).toBe("Not set");
  });
});

describe("PostSplits", () => {
  it("offers only the splits with 2 groups or more, opening on Platform", () => {
    const out = draw(posts);
    expect(out).toContain("Average engagement by platform");
    expect(out).toContain("Instagram 20 · 2 posts");
    for (const chip of ["Platform", "Format", "Campaign"]) expect(out).toContain(` ${chip} `);
    // every post is for parents: one group, nothing to compare
    expect(out).not.toContain(" Audience ");
  });

  it("opens the split the address names, and the first one shown when that split has one group", () => {
    expect(draw(posts, "/analytics?split=campaign")).toContain("Average engagement by campaign");
    expect(draw(posts, "/analytics?split=audience")).toContain("Average engagement by platform");
  });

  it("draws nothing with no split to make, or for anyone but Leo", () => {
    expect(draw([posts[0]]).trim()).toBe("");
    as.user = null;
    expect(draw(posts).trim()).toBe("");
    as.user = { id: "u1", email: "leo@x" };
  });
});
