// The brand menu with 37 brands on Leo's account, switched live in demos: a search box, your brands above the demo
// ones, and no way to remove a brand from a row.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Profile } from "@/lib/profiles";
import { BrandMenu, SEARCH_PAST } from "./ProfileSwitcher";

const noop = () => undefined;
const brand = (id: string, name: string, boardBrand?: string): Profile => ({ id, name, createdAt: "", ...(boardBrand ? { boardBrand } : {}) });
const many = [brand("me", "Me"), brand("mb", "MoneyBees", "moneybees"), ...Array.from({ length: 9 }, (_, k) => brand(`d${k}`, `Demo ${k}`, `dma-demo-${k}`))];
const menu = (profiles: Profile[], editing: string | null = null) => renderToStaticMarkup(
  <BrandMenu profiles={profiles} activeId="me" logos={{}} switching={null} removing={null} editing={editing} onEdit={noop} onSwitch={noop} onRename={noop} onRemove={noop} />,
);

describe("BrandMenu", () => {
  it("opens on a search box past 8 brands, your brands above the demo ones, and no Remove on any row", () => {
    const out = menu(many);
    expect(out).toContain('aria-label="Search brands"');
    expect(out.indexOf(">Your brands<")).toBeGreaterThan(-1);
    expect(out.indexOf(">Your brands<")).toBeLessThan(out.indexOf(">Demo brands<"));
    expect(out.indexOf(">MoneyBees<")).toBeLessThan(out.indexOf(">Demo brands<"));
    expect(out.indexOf(">Demo brands<")).toBeLessThan(out.indexOf(">Demo 0<"));
    expect(out).not.toMatch(/Remove/);
    expect(out).toContain('aria-label="Edit MoneyBees"');
  });

  it("keeps 8 brands or fewer a plain list: no search box", () => {
    const out = menu(many.slice(0, SEARCH_PAST));
    expect(out).not.toContain("Search brands");
    expect(out).toContain(">Demo 5<");
  });

  it("puts Remove inside the open brand's edit form only, never for the default brand", () => {
    const out = menu(many, "mb");
    expect(out.match(/Remove brand/g)).toHaveLength(1);
    expect(out).toContain('aria-label="New name for MoneyBees"');
    expect(menu(many, "me")).not.toMatch(/Remove/);
  });
});
