import { describe, expect, it } from "vitest";
import { allowedOrigin, parseCommentBody, safeJson, statusForComment, tokenFromPath } from "./logic";

const TOKEN = "pUqAjjhJR3eWI149_6bMwFB5w5tzxU_CnvmyJyicjwM";

describe("tokenFromPath", () => {
  it("takes a well-formed token from the last segment", () => {
    expect(tokenFromPath(`/preview-link/${TOKEN}`)).toBe(TOKEN);
    expect(tokenFromPath(`/functions/v1/preview-link/${TOKEN}/`)).toBe(TOKEN);
  });
  it("refuses anything else", () => {
    expect(tokenFromPath("/preview-link/")).toBeNull();
    expect(tokenFromPath(`/preview-link/${TOKEN}x`)).toBeNull();
    expect(tokenFromPath(`/preview-link/${TOKEN.slice(1)}`)).toBeNull();
    expect(tokenFromPath("/preview-link/%E0%A4%A")).toBeNull();
    expect(tokenFromPath(`/preview-link/${TOKEN.slice(0, 42)}+`)).toBeNull();
  });
});

describe("allowedOrigin", () => {
  it("allows the app, its previews and local dev", () => {
    expect(allowedOrigin("https://consultant-content-studio.vercel.app")).toBe("https://consultant-content-studio.vercel.app");
    expect(allowedOrigin("https://content-studio-abc123-leo.vercel.app")).not.toBeNull();
    expect(allowedOrigin("http://localhost:4173")).not.toBeNull();
  });
  it("refuses other sites and look-alikes", () => {
    expect(allowedOrigin(null)).toBeNull();
    expect(allowedOrigin("https://evil.example")).toBeNull();
    expect(allowedOrigin("https://consultant-content-studio.vercel.app.evil.example")).toBeNull();
    expect(allowedOrigin("http://consultant-content-studio.vercel.app")).toBeNull();
  });
});

describe("parseCommentBody", () => {
  it("reads name and body", () => {
    expect(parseCommentBody({ name: "Carol", body: "Add the disclaimer." })).toEqual({
      name: "Carol",
      body: "Add the disclaimer.",
      honeypot: false,
    });
  });
  it("flags a filled honeypot", () => {
    expect(parseCommentBody({ name: "x", body: "y", website: "http://spam" })?.honeypot).toBe(true);
    expect(parseCommentBody({ name: "x", body: "y", website: 1 })?.honeypot).toBe(true);
    expect(parseCommentBody({ name: "x", body: "y", website: "  " })?.honeypot).toBe(false);
  });
  it("refuses malformed bodies", () => {
    expect(parseCommentBody(null)).toBeNull();
    expect(parseCommentBody([])).toBeNull();
    expect(parseCommentBody({ name: "x" })).toBeNull();
    expect(parseCommentBody({ name: 1, body: "y" })).toBeNull();
  });
});

describe("statusForComment", () => {
  it("maps each result to a status", () => {
    expect(statusForComment({ ok: true })).toBe(200);
    expect(statusForComment({ ok: false, error: "not_found" })).toBe(404);
    expect(statusForComment({ ok: false, error: "rate_limited" })).toBe(429);
    expect(statusForComment({ ok: false, error: "invalid" })).toBe(400);
  });
});

describe("safeJson", () => {
  it("escapes markup but parses back to the same text", () => {
    const body = { body: `<script>alert("x")</script> & co` };
    const out = safeJson(body);
    expect(out).not.toMatch(/[<>&]/);
    expect(JSON.parse(out)).toEqual(body);
  });
});
