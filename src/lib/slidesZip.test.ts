import { describe, expect, it } from "vitest";
import { unzipSync } from "fflate";
import { zipBlob } from "./carouselRender";
import { slideFileName, slidesZipName } from "./carousel";

describe("Download all as one zip", () => {
  it("packs every slide under its own name, byte for byte", async () => {
    const png = (n: number) => new Blob([new Uint8Array([137, 80, 78, 71, n, n + 1, n + 2])], { type: "image/png" });
    const files = [0, 1, 2].map((i) => ({ file: png(i * 10), name: slideFileName("Lead messages at 10pm?", i) }));
    const zip = await zipBlob(files);
    expect(zip.type).toBe("application/zip");
    const out = unzipSync(new Uint8Array(await zip.arrayBuffer()));
    expect(Object.keys(out)).toEqual(["lead-messages-at-10pm-01.png", "lead-messages-at-10pm-02.png", "lead-messages-at-10pm-03.png"]);
    expect([...out["lead-messages-at-10pm-02.png"]]).toEqual([137, 80, 78, 71, 10, 11, 12]);
    expect(slidesZipName("Lead messages at 10pm?")).toBe("lead-messages-at-10pm-slides.zip");
  });
});
