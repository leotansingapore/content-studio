import { afterEach, describe, expect, it, vi } from "vitest";
import { clearFormatJob, formatJobs, onFormatJob, setFormatJob, type FormatJob } from "./formatJob";

const job = (slug: string, over: Partial<FormatJob> = {}): FormatJob => ({
  slug,
  label: "Talking head",
  format: "video",
  state: "working",
  step: "Writing the script",
  href: `/make/${slug}`,
  ...over,
});

afterEach(() => formatJobs().forEach((j) => clearFormatJob(j.slug)));

describe("formatJob", () => {
  it("keeps one job per slug, the newest set", () => {
    setFormatJob(job("talking-head"));
    setFormatJob(job("hook-demo", { label: "Hook plus demo" }));
    setFormatJob(job("talking-head", { step: "Making the voiceover" }));
    expect(formatJobs()).toEqual([job("talking-head", { step: "Making the voiceover" }), job("hook-demo", { label: "Hook plus demo" })]);
  });

  it("clears one slug and leaves the others", () => {
    setFormatJob(job("talking-head"));
    setFormatJob(job("hook-demo"));
    clearFormatJob("talking-head");
    expect(formatJobs().map((j) => j.slug)).toEqual(["hook-demo"]);
  });

  it("keeps its own copy, so a caller changing its object changes nothing", () => {
    const j = job("talking-head");
    setFormatJob(j);
    j.step = "Changed outside";
    expect(formatJobs()[0].step).toBe("Writing the script");
  });

  it("calls each listener once per change, never for no change, and stops after unsubscribing", () => {
    const cb = vi.fn();
    const off = onFormatJob(cb);
    setFormatJob(job("talking-head"));
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenLastCalledWith([job("talking-head")]);
    setFormatJob(job("talking-head"));
    expect(cb).toHaveBeenCalledTimes(1);
    setFormatJob(job("talking-head", { state: "failed", step: undefined, error: "No credits left." }));
    expect(cb).toHaveBeenCalledTimes(2);
    clearFormatJob("talking-head");
    expect(cb).toHaveBeenCalledTimes(3);
    expect(cb).toHaveBeenLastCalledWith([]);
    clearFormatJob("talking-head");
    expect(cb).toHaveBeenCalledTimes(3);
    off();
    setFormatJob(job("hook-demo"));
    expect(cb).toHaveBeenCalledTimes(3);
  });
});
