import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { blankDna } from "@/lib/addBrand";
import type { ReviewRow } from "@/lib/productScan";
import { ReviewStep, type ReviewProps } from "./ReviewStep";

// The review's "What you sell" section as every account sees it: each found row's picture from the site beside its
// name and line, and no picture at all when the scan found none.
const row = (i: number, picture?: string): ReviewRow => ({
  i,
  row: { name: `Plan ${i}`, what: `What plan ${i} does.`, forWho: "", generic: "a plan", ...(picture ? { picture } : {}), offerP: 0.9, namedP: 0.1 },
  group: "yours",
  ticked: true,
  added: false,
  named: false,
});
const noop = () => undefined;
const draw = (rows: ReviewRow[], leo = false) =>
  renderToStaticMarkup(
    createElement(ReviewStep, {
      titleId: "t", manual: false, host: "acme.sg", leo, dna: blankDna("acme.sg"), patch: noop, profession: "Adviser", onProfession: noop,
      sections: ["products"], done: new Set(), current: "products", expanded: new Set(), onToggle: noop, onConfirm: noop, onCreate: noop, createNote: null,
      colours: ["#2563EB"], suggested: [], presets: [], onColours: noop, lang: null, onLang: noop, slideFont: "modern", onSlideFont: noop, app: null, onTick: noop,
      products: { busy: false, host: "acme.sg", rows },
    } satisfies ReviewProps),
  );

describe("ReviewStep: what you sell", () => {
  it("shows a found row's site picture as a small fixed-size thumbnail, sent with no referrer, beside its name and line", () => {
    const html = draw([row(0, "https://acme.sg/ret.png")]);
    const img = html.match(/<img[^>]*src="https:\/\/acme.sg\/ret.png"[^>]*>/)?.[0] ?? "";
    expect(img).toContain('referrerPolicy="no-referrer"');
    expect(img).toContain('alt=""');
    expect(img).toMatch(/class="[^"]*\bh-full w-full object-cover/);
    // the box holds its size whatever the picture is
    expect(html).toMatch(/<span class="[^"]*\bh-12 w-12 shrink-0 overflow-hidden[^"]*"><img/);
    expect(html).toContain("Plan 0");
    expect(html).toContain("What plan 0 does.");
  });

  it("draws no picture for a row the scan found none for", () => {
    const html = draw([row(0), row(1, "https://acme.sg/b.jpg")]);
    expect(html.match(/<img/g)).toHaveLength(1);
    expect(html).toContain("Plan 0");
  });

  it("points no one at Brand > Products for pictures any more", () => {
    for (const leo of [false, true]) expect(draw([row(0, "https://acme.sg/ret.png")], leo)).not.toContain("Brand &gt; Products");
  });
});
