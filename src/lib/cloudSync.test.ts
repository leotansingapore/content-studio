import { describe, expect, it } from "vitest";
import { decideSync } from "./cloudSync";

const OLD = "2026-07-01T00:00:00.000Z";
const NEW = "2026-07-09T00:00:00.000Z";

describe("decideSync", () => {
  it("takes the cloud copy when nothing exists locally", () =>
    expect(decideSync(null, null, NEW)).toBe("apply-cloud"));

  it("keeps and pushes local data that was never synced from this device", () =>
    expect(decideSync("local-data", null, NEW)).toBe("push-local"));

  it("applies cloud when the cloud row is newer than the last local write", () =>
    expect(decideSync("local-data", OLD, NEW)).toBe("apply-cloud"));

  it("keeps local when the local write is newer or equal", () => {
    expect(decideSync("local-data", NEW, OLD)).toBe("noop");
    expect(decideSync("local-data", NEW, NEW)).toBe("noop");
  });
});
