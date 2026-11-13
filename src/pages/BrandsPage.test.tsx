// /brands: every brand as a card, its unfinished ones beside them, and New brand last.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { BrandDraft } from "@/lib/brandDrafts";

vi.mock("@/lib/supabase", () => ({
  SUPABASE_URL: "https://abc.supabase.co",
  supabase: { auth: { getUser: () => new Promise(() => undefined), getSession: () => new Promise(() => undefined), onAuthStateChange: () => ({}) } },
}));

const { BrandGrid } = await import("./BrandsPage");

const row = (id: string, name: string, over: Partial<{ logo: string | null; colour: string | null; host: string; boardBrand: string }> = {}) => ({ id, name, createdAt: "", logo: null, colour: null, host: "", ...over });
const draft = (id: string, over: Partial<BrandDraft> = {}): BrandDraft => ({ id, host: "", name: "", step: "site", updatedAt: "2026-11-13T10:00:00.000Z", form: {}, ...over });
const html = (props: Partial<Parameters<typeof BrandGrid>[0]> = {}) =>
  renderToStaticMarkup(
    createElement(MemoryRouter, null,
      createElement(BrandGrid, {
        groups: [{ name: null, rows: [row("me", "Leo Tan", { colour: "#0f766e" }), row("p1", "MoneyBees", { logo: "data:image/png;base64,AAAA", host: "moneybees.sg" })] }],
        drafts: [draft("d1", { name: "Acme", host: "acme.sg", step: "review", form: { colours: ["#112233"] } }), draft("d2", { host: "beta.sg" })],
        activeId: "p1",
        opening: null,
        onOpen: () => undefined,
        onRemove: () => undefined,
        ...props,
      })));
const count = (out: string, s: string) => out.split(s).length - 1;

describe("BrandGrid", () => {
  it("opens each brand on its calendar, with its logo or its initial on its colour, and its website", () => {
    const out = html();
    expect(out).toContain('href="/calendar?profile=me"');
    expect(out).toContain('href="/calendar?profile=p1"');
    expect(out).toContain('src="data:image/png;base64,AAAA"');
    expect(out).toMatch(/background-color:#0f766e[^>]*>L</);
    expect(out).toContain("moneybees.sg");
  });

  it("marks the open brand once", () => {
    const out = html();
    expect(count(out, 'aria-current="true"')).toBe(1);
    expect(out).toMatch(/aria-current="true"[^>]*href="\/calendar\?profile=p1"|href="\/calendar\?profile=p1"[^>]*aria-current="true"/);
    expect(count(out, ">Current<")).toBe(1);
  });

  it("shows each unfinished brand, resuming at its step, with a way to remove it", () => {
    const out = html();
    expect(out).toContain('href="/brands/new?draft=d1&amp;step=review"');
    expect(out).toContain('href="/brands/new?draft=d2"');
    expect(count(out, ">Unfinished<")).toBe(2);
    expect(out).toContain('aria-label="Remove unfinished brand Acme"');
    expect(out).toContain('aria-label="Remove unfinished brand beta.sg"');
    expect(out).toMatch(/background-color:#112233[^>]*>A</);
  });

  it("ends on New brand, and has no filled button", () => {
    const out = html();
    expect(out.lastIndexOf('href="/brands/new"')).toBeGreaterThan(out.lastIndexOf("Unfinished"));
    expect(out).toContain(">New brand<");
    expect(out).not.toContain("bg-primary text-primary-foreground");
  });

  it("puts unfinished brands and New brand with your own brands, not the demo ones", () => {
    const out = html({
      groups: [
        { name: "Your brands", rows: [row("me", "Leo Tan")] },
        { name: "Demo brands", rows: [row("p9", "Demo Cafe", { boardBrand: "dma-cafe" })] },
      ],
    });
    expect(out.indexOf("Demo brands")).toBeGreaterThan(out.lastIndexOf('href="/brands/new"'));
    expect(out.indexOf("Demo brands")).toBeGreaterThan(out.lastIndexOf("Unfinished"));
  });

  it("says which brand is opening", () => {
    expect(html({ opening: "me" })).toContain("Opening Leo Tan...");
  });

  it("uses plain ASCII words", () => {
    expect(/^[\x20-\x7e]*$/.test(html().replace(/\n/g, ""))).toBe(true);
  });
});
