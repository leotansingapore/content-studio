import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { demuxVideo, keyBefore } from "./mp4Demux";

// 48x32, 10 frames at 10 fps, a key frame every 5, made with ffmpeg; the expected
// times, offsets and sizes are what ffprobe reports for the same files
const fixture = (name: string) => new Blob([readFileSync(new URL(`./fixtures/${name}`, import.meta.url))]);
const round = (n: number) => Math.round(n * 1000) / 1000;

describe("reading an MP4's video track", () => {
  it("lists the frames of a plain file with B-frames, its moov at the end, past its sound track", async () => {
    const t = (await demuxVideo(fixture("bframes.mp4")))!;
    expect(t.codec).toBe("avc1.64000a");
    expect([t.width, t.height, t.rotation]).toEqual([48, 32, 0]);
    expect(t.description[0]).toBe(1);
    // the edit list moves the first frame to 0, as the browser shows it
    expect(t.samples.map((s) => round(s.pts))).toEqual([0, 0.3, 0.1, 0.2, 0.4, 0.5, 0.7, 0.6, 0.8, 0.9]);
    expect(t.samples.map((s) => s.key)).toEqual([true, false, false, false, false, true, false, false, false, false]);
    // the sound's chunks sit between the video's
    expect(t.samples.slice(0, 3).map((s) => [s.off, s.size])).toEqual([[48, 1184], [1471, 35], [1506, 13]]);
    expect(t.samples.slice(-1).map((s) => [s.off, s.size])).toEqual([[2951, 42]]);
  });

  it("lists the frames of a fragmented file, as the browser's recorder makes", async () => {
    const t = (await demuxVideo(fixture("frag.mp4")))!;
    expect(t.codec).toBe("avc1.42c00a");
    expect(t.samples.map((s) => round(s.pts))).toEqual([0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]);
    expect(t.samples.map((s) => s.key)).toEqual([true, false, false, false, false, true, false, false, false, false]);
    expect(t.samples.map((s) => [s.off, s.size])).toEqual([[921, 1150], [2071, 10], [2081, 53], [2134, 24], [2158, 67], [2357, 563], [2920, 50], [2970, 9], [2979, 39], [3018, 44]]);
  });

  it("reads the turn a phone stores for a portrait video", async () => {
    // ffmpeg's display_rotation 90 turns it a quarter anticlockwise: 270 clockwise
    const t = (await demuxVideo(fixture("rot90.mp4")))!;
    expect(t.rotation).toBe(270);
    expect(t.samples).toHaveLength(10);
  });

  it("builds the codec string for an HEVC track", async () => {
    const t = (await demuxVideo(fixture("hevc.mp4")))!;
    expect(t.codec).toMatch(/^hvc1\.1\.6\.L\d+\.90$/);
    expect(t.samples.map((s) => s.off)).toEqual([44, 572, 591, 654, 673, 692, 1275, 1317, 1333, 1352]);
  });

  it("gives null for a file that is not MP4", async () => {
    expect(await demuxVideo(new Blob([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0, 0, 0, 0, 0])]))).toBeNull();
    expect(await demuxVideo(new Blob([]))).toBeNull();
  });

  it("starts decoding from the last key frame showing at or before the time asked", async () => {
    const t = (await demuxVideo(fixture("bframes.mp4")))!;
    expect(keyBefore(t.samples, 0)).toBe(0);
    expect(keyBefore(t.samples, 0.45)).toBe(0);
    expect(keyBefore(t.samples, 0.5)).toBe(5);
    expect(keyBefore(t.samples, 9)).toBe(5);
  });
});
