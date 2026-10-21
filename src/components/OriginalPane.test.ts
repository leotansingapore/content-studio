// The original's words on Write's compare pane: the whole ad or post when this device still holds it, the 400-character
// snapshot otherwise (the 21 Oct dogfood showed an ad cut at "Which means replyi").
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OriginalPane } from "./OriginalPane";
import type { RemixSource } from "@/lib/remixSource";

const source: RemixSource = { key: "ad:1", kind: "ad", author: "Aaron", caption: "Follow up today. Which means replyi", remixedAt: "2026-10-21T01:20:00.000Z" };
const html = (text?: string) => renderToStaticMarkup(createElement(OriginalPane, { source, text }));

describe("OriginalPane", () => {
  it("shows the whole original when it is longer than the snapshot", () => {
    const whole = "Follow up today. Which means replying with a next step, not forty things on it.";
    expect(html(whole)).toContain("not forty things on it.");
    expect(html(whole)).not.toContain("replyi<");
  });

  it("keeps the snapshot when no longer text is found", () => {
    expect(html()).toContain("Which means replyi");
    expect(html("Follow up")).toContain("Which means replyi");
  });
});
