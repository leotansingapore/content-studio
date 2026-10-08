import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CardContent } from "./card";

const classes = (className?: string) =>
  (renderToStaticMarkup(createElement(CardContent, { className })).match(/class="([^"]*)"/)?.[1] ?? "").split(" ");
const padding = (className?: string) => classes(className).filter((c) => /^([a-z0-9]+:)*!?p[trblxy]?-/.test(c));

describe("CardContent padding", () => {
  it("keeps a page's own top padding at every width", () => {
    expect(padding("pt-6")).toEqual(["p-[var(--card-pad)]", "pt-6"]);
    expect(padding("space-y-3 py-4")).toEqual(["p-[var(--card-pad)]", "py-4"]);
  });

  it("lets a page replace the padding outright", () => {
    expect(padding("p-0")).toEqual(["p-0"]);
    expect(padding("p-4 sm:p-6")).toEqual(["p-4", "sm:p-6"]);
  });

  it("defaults to the responsive card padding with no top padding", () => {
    expect(padding()).toEqual(["p-[var(--card-pad)]", "pt-0"]);
    expect(classes()).toContain("md:[--card-pad:1.5rem]");
  });
});
