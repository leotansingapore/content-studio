import { afterEach, describe, expect, it } from "vitest";
import { encoderDelay, pickEncoder } from "@/lib/fastExport";

const G = globalThis as Record<string, unknown>;

afterEach(() => {
  delete G.VideoEncoder;
});

describe("fastExport's encoder helpers, shared with the film export", () => {
  it("pickEncoder tries high, main, then baseline profile at the 1080p level", async () => {
    const asked: string[] = [];
    G.VideoEncoder = { isConfigSupported: async (c: VideoEncoderConfig) => (asked.push(c.codec), { supported: c.codec.startsWith("avc1.4d") }) };
    const cfg = await pickEncoder(1080, 1920, 8_000_000);
    expect(asked).toEqual(["avc1.640028", "avc1.4d0028"]);
    expect(cfg).toMatchObject({ codec: "avc1.4d0028", width: 1080, height: 1920, bitrate: 8_000_000, framerate: 30 });
    G.VideoEncoder = { isConfigSupported: async () => ({ supported: false }) };
    expect(await pickEncoder(1920, 1080, 8_000_000)).toBeNull();
    expect(typeof encoderDelay).toBe("function");
  });
});
