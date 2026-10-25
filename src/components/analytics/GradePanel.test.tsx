// The grade chip and panel (learn-post-grade): the chip's words and tone per band, and what the panel draws for a
// graded, an about-the-usual, a too-few and a too-young post before any reason comes back.
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { TrackedPost } from "@/lib/analytics";
import type { Grade } from "@/lib/postGrade";

vi.mock("@/lib/useLeoOnly", async (actual) => ({
  ...(await actual<typeof import("@/lib/useLeoOnly")>()),
  useLeoUser: () => ({ id: "u1", email: "tanjunsing@gmail.com" }),
  useLeoOnly: () => true,
}));
vi.mock("@/lib/supabase", () => ({
  SUPABASE_URL: "https://abc.supabase.co",
  supabase: { auth: { getUser: () => new Promise(() => undefined), getSession: () => new Promise(() => undefined), onAuthStateChange: () => ({}) } },
}));
// the panel's reason call runs in an effect, which a static render never reaches; a call here would be a bug
vi.mock("@/lib/edgeFn", async (actual) => ({ ...(await actual<typeof import("@/lib/edgeFn")>()), callFn: () => Promise.reject(new Error("no call in a render")) }));

const { default: GradePanel, chipOf, ratioText } = await import("./GradePanel");

const post = (id: string, eng: number): TrackedPost => ({
  id, createdAt: "2026-10-01T01:00:00.000Z", hook: `Post ${id}`, draft: `Post ${id}\n\nBody.`, pillar: "education", pillarDetail: "CPF", audience: "general",
  format: "text-post", platform: "linkedin", ctaType: "question", status: "posted", postedAt: "2026-10-10T01:00:00.000Z",
  metrics: { impressions: 2000, reactions: eng }, impressions: 2000, engagementTotal: eng, engagementRate: 1,
});
const graded = (ratio: number, band: Extract<Grade, { kind: "graded" }>["band"]): Grade => ({ kind: "graded", ratio, band, engagements: Math.round(ratio * 100), usual: 100, of: 6, impressions: 2 });
const panel = (grade: Grade) =>
  renderToStaticMarkup(
    <MemoryRouter>
      <GradePanel userId="u1" post={post("p1", 240)} tracked={[post("p1", 240), post("p2", 100)]} grade={grade} onClose={() => undefined} />
    </MemoryRouter>,
  );

describe("the grade chip", () => {
  it("reads the ratio to one decimal, from the unrounded band", () => {
    expect(ratioText(1.249)).toBe("1.2x");
    expect(chipOf(graded(1.249, "about")).label).toBe("1.2x your usual");
    expect(chipOf(graded(2.4, "well-above")).label).toBe("2.4x your usual");
  });
  it("takes each band's tone", () => {
    expect(chipOf(graded(2.4, "well-above")).tone).toContain("bg-primary");
    expect(chipOf(graded(1.5, "above")).tone).toContain("border-primary/50");
    expect(chipOf(graded(1, "about")).tone).toContain("bg-muted");
    expect(chipOf(graded(0.6, "below")).tone).toContain("text-warning");
    expect(chipOf(graded(0.4, "well-below")).tone).toContain("text-destructive");
  });
  it("reads Not graded with too few posts or too young a post", () => {
    expect(chipOf({ kind: "few", have: 3 }).label).toBe("Not graded");
    expect(chipOf({ kind: "young", ready: "2026-10-27T01:00:00.000Z" }).label).toBe("Not graded");
  });
});

describe("the grade panel", () => {
  it("draws a graded post's band, numbers and buttons, and waits for the reason", () => {
    const out = panel(graded(2.4, "well-above"));
    expect(out).toContain(">Well above your usual</h3>");
    expect(out).toContain("2.4x your usual engagement on LinkedIn");
    expect(out).toContain("240 engagements; your usual is 100 (median of 6 LinkedIn posts)");
    expect(out).toContain("2x your usual impressions");
    expect(out).toContain('aria-label="Remix: Post p1"');
    expect(out).toContain('href="/generate?draft=p1"');
    expect(out).not.toContain("Try a new version");
  });
  it("has no reason line about the usual", () => {
    const out = panel(graded(1, "about"));
    expect(out).toContain(">About your usual</h3>");
    expect(out).not.toContain("Why");
    expect(out).not.toContain("aria-live");
    expect(out).not.toContain("Remix:");
  });
  it("says how many posts it needs with Add numbers", () => {
    const out = panel({ kind: "few", have: 3 });
    expect(out).toContain(">Not graded</h3>");
    expect(out).toContain("Not enough LinkedIn posts with numbers to compare yet: 5 needed, you have 3.");
    expect(out).toContain(">Add numbers</button>");
    expect(out).not.toContain("your usual engagement");
  });
  it("says when a young post can be graded", () => {
    expect(panel({ kind: "young", ready: "2026-10-27T01:00:00.000Z" })).toContain("Still collecting numbers. Check back on Tuesday.");
  });
});
