// Analytics' splits: posted posts with numbers grouped by platform, format, pillar, hook formula, audience or campaign,
// each group's count and average engagements per post, the split in ?split= (an old ?by= link opens the same one), a
// split with one group left out, for every sign-in.
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { TrackedPost } from "@/lib/analytics";

vi.mock("@/lib/supabase", () => ({ SUPABASE_URL: "https://abc.supabase.co", supabase: {} }));

import PostSplits, { splitPosts } from "./PostSplits";

const post = (o: Partial<TrackedPost>) => ({ platform: "instagram", format: "carousel", pillar: "topic", audience: "parent", engagementTotal: 10, ...o }) as TrackedPost;
const posts = [
  post({ engagementTotal: 30, campaign: { id: "c1", post: 1, day: 1 }, hookFormula: "contrarian" }),
  post({ engagementTotal: 10, campaign: { id: "c1", post: 2, day: 2 }, pillar: "identity", hookFormula: "number-reveal" }),
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
    expect(splitPosts(posts, "pillar")).toEqual([
      { key: "topic", label: "Topic", count: 2, avg: 17.5 },
      { key: "identity", label: "Identity", count: 1, avg: 10 },
    ]);
  });

  it("splits by hook formula over only the posts written from a known formula", () => {
    expect(splitPosts([...posts, post({ hookFormula: "made-up" })], "hook-formula")).toEqual([
      { key: "contrarian", label: "Contrarian take", count: 1, avg: 30 },
      { key: "number-reveal", label: "Number reveal", count: 1, avg: 10 },
    ]);
  });
});

describe("PostSplits", () => {
  it("offers only the splits with 2 groups or more, opening on Platform", () => {
    const out = draw(posts);
    expect(out).toContain("Engagements per post by platform");
    expect(out).toContain("Instagram 20 · 2 posts");
    for (const chip of ["Platform", "Format", "Pillar", "Hook formula", "Campaign"]) expect(out).toContain(` ${chip} `);
    // every post is for parents: one group, nothing to compare
    expect(out).not.toContain(" Audience ");
  });

  it("opens the split the address names, and the first one shown when that split has one group", () => {
    expect(draw(posts, "/analytics?split=campaign")).toContain("Engagements per post by campaign");
    expect(draw(posts, "/analytics?split=hook-formula")).toContain("Contrarian take 30 · 1 post");
    expect(draw(posts, "/analytics?split=audience")).toContain("Engagements per post by platform");
  });

  it("opens an old engagement rate link's ?by= as the same split, ?split= winning", () => {
    expect(draw(posts, "/analytics?by=pillar")).toContain("Engagements per post by pillar");
    expect(draw(posts, "/analytics?by=hook-formula")).toContain("Engagements per post by hook formula");
    expect(draw(posts, "/analytics?by=pillar&split=format")).toContain("Engagements per post by format");
    expect(draw(posts, "/analytics?by=nonsense")).toContain("Engagements per post by platform");
  });

  it("draws nothing with no split to make", () => {
    expect(draw([posts[0]]).trim()).toBe("");
  });
});
