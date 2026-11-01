import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: {} }));
import { landsHere, pictureTag } from "./ImagePicker";

describe("an AI picture made from the design editor", () => {
  const done = (designId: string) => ({ prompt: "p", state: "done" as const, mediaKey: "cimg-1", designId });
  const asked = pictureTag("dsg_a", "lyr_1");

  it("lands on the layer that asked for it", () => {
    expect(landsHere(done(asked), pictureTag("dsg_a", "lyr_1"))).toBe(true);
  });
  it("not on another layer, nor on the same layer id in another slideshow", () => {
    expect(landsHere(done(asked), pictureTag("dsg_a", "lyr_2"))).toBe(false);
    expect(landsHere(done(asked), pictureTag("dsg_b", "lyr_1"))).toBe(false);
  });
  it("not while it is still being made, nor from a picture asked for elsewhere", () => {
    expect(landsHere({ ...done(asked), state: "working" }, asked)).toBe(false);
    expect(landsHere({ prompt: "p", state: "done", mediaKey: "cimg-1" }, asked)).toBe(false);
    expect(landsHere(null, asked)).toBe(false);
  });
});
