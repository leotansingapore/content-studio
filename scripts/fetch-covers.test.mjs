import { describe, expect, it } from "vitest";
import {
  isValidShortCode,
  mediaUrl,
  coverFileName,
  coverPublicPath,
  isUsableImage,
  COVER_SIZE,
} from "./fetch-covers.mjs";

describe("isValidShortCode", () => {
  it("accepts real Instagram shortcodes", () => {
    expect(isValidShortCode("DaNZHmIk4Gb")).toBe(true);
    expect(isValidShortCode("DSSYUOdDyJV")).toBe(true);
    expect(isValidShortCode("abc_-123")).toBe(true);
  });
  it("rejects anything that could escape a filesystem path", () => {
    expect(isValidShortCode("../../etc/passwd")).toBe(false);
    expect(isValidShortCode("a/b")).toBe(false);
    expect(isValidShortCode("with space")).toBe(false);
    expect(isValidShortCode("")).toBe(false);
    expect(isValidShortCode(undefined)).toBe(false);
    expect(isValidShortCode("abc")).toBe(false); // too short
  });
});

describe("paths and urls", () => {
  it("builds the public media url at the committed size", () => {
    expect(mediaUrl("ABC12")).toBe(
      `https://www.instagram.com/p/ABC12/media/?size=${COVER_SIZE}`,
    );
  });
  it("names the file and public path off the shortcode", () => {
    expect(coverFileName("ABC12")).toBe("ABC12.jpg");
    // Deliberately NOT under /swipe — that path is an app route.
    expect(coverPublicPath("ABC12")).toBe("/covers/ABC12.jpg");
  });
});

describe("isUsableImage", () => {
  it("accepts a real jpeg response", () => {
    expect(isUsableImage({ status: 200, contentType: "image/jpeg", bytes: 31358 })).toBe(true);
  });
  it("rejects non-200, non-image and tiny bodies", () => {
    // A 404 that still returns an HTML error body with image-ish length.
    expect(isUsableImage({ status: 404, contentType: "image/jpeg", bytes: 20940 })).toBe(false);
    expect(isUsableImage({ status: 200, contentType: "text/html", bytes: 50000 })).toBe(false);
    expect(isUsableImage({ status: 200, contentType: "image/gif", bytes: 43 })).toBe(false);
    expect(isUsableImage({ status: 200, contentType: null, bytes: 50000 })).toBe(false);
  });
});
