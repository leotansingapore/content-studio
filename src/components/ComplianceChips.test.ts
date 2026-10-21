// Write's compliance chips, moved out of GeneratePage.tsx unchanged: rendered to markup in node so a change to how
// they look for everyone shows up here.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ComplianceChips from "./ComplianceChips";
import { scanCompliance } from "@/lib/compliance";

// an icon by its class only, so a lucide upgrade that redraws one doesn't fail this
const html = (text: string) =>
  renderToStaticMarkup(createElement(ComplianceChips, { flags: scanCompliance(text), onDismiss: () => {} })).replace(/<svg[^>]*class="([^"]*)"[^>]*>[\s\S]*?<\/svg>/g, '<svg class="$1"/>');

describe("ComplianceChips", () => {
  it("renders nothing when nothing is flagged", () => {
    expect(html("")).toBe("");
    expect(html("A plain post about planning ahead.")).toBe("");
  });

  it("renders an error chip exactly as Write did", () => {
    const flag = scanCompliance("It is risk-free.")[0];
    expect(html("It is risk-free.")).toBe(
      '<div class="mb-3 flex flex-wrap gap-2"><div class="flex items-start gap-2 rounded-lg border px-2.5 py-1.5 text-[11px] border-destructive/50 bg-destructive/10 text-red-700 dark:text-red-300">' +
        '<svg class="lucide lucide-triangle-alert mt-0.5 h-3 w-3 shrink-0 text-destructive"/>' +
        '<div class="space-y-0.5"><div class="font-semibold uppercase tracking-[0.14em]">Compliance error<span class="ml-1.5 rounded bg-background/60 px-1 py-0.5 font-mono text-[10px] normal-case tracking-normal">risk-free</span></div>' +
        `<div class="text-[11px] leading-snug">${flag.message.replace(/'/g, "&#x27;")}</div></div>` +
        '<button type="button" class="-my-1 -mr-1.5 ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded hover:bg-background/40" aria-label="Dismiss flag"><svg class="lucide lucide-x h-3.5 w-3.5"/></button></div></div>',
    );
  });

  it("shows one chip per flag, amber for a warning and red for an error, each with its own dismiss", () => {
    const out = html("This plan is guaranteed and risk-free.");
    expect(out.match(/aria-label="Dismiss flag"/g)).toHaveLength(2);
    expect(out).toContain("Compliance warning");
    expect(out).toContain("border-amber-500/50 bg-amber-500/10 text-amber-900 dark:text-amber-200");
    expect(out).toContain("text-amber-600");
    expect(out).toContain(">guaranteed</span>");
    expect(out).toContain("Compliance error");
  });
});
