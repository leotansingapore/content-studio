import { afterEach, describe, expect, it } from "vitest";
import { POST } from "./slide-render";

const slide = { format: "tiktok", photo: null, text: "Hi", style: { v: "middle", h: "center", size: "md", font: "Inter", italic: false, caps: false, bg: "none", color: "#ffffff" }, overlay: { kind: "none", strength: 0 } };
const call = (body: unknown, secret?: string) =>
  POST(new Request("https://x/api/slide-render", { method: "POST", headers: { "content-type": "application/json", ...(secret ? { "x-slide-render-secret": secret } : {}) }, body: JSON.stringify(body) }));

describe("the slide drawer", () => {
  afterEach(() => {
    delete process.env.SLIDE_RENDER_SECRET;
  });
  it("answers only the function's secret", async () => {
    expect((await call({ slide })).status).toBe(403);
    process.env.SLIDE_RENDER_SECRET = "s3cret";
    expect((await call({ slide }, "nope")).status).toBe(403);
    expect((await call({ slide })).status).toBe(403);
  });
  it("fetches no photo but Pexels', this project's signed storage links or a data URL", async () => {
    process.env.SLIDE_RENDER_SECRET = "s3cret";
    for (const photo of ["http://169.254.169.254/latest/meta-data", "https://evil.example/a.jpg", "https://hgdbflprrficdoyxmdxe.supabase.co/storage/v1/object/sign/other-bucket/x.png", "file:///etc/passwd"])
      expect((await call({ slide: { ...slide, photo } }, "s3cret")).status, photo).toBe(400);
    expect((await call({ slide: { ...slide, format: "x" } }, "s3cret")).status).toBe(400);
    expect((await call({}, "s3cret")).status).toBe(400);
  });
});
