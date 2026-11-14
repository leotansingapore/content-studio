import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { brandOverview, type OverviewInput, type OverviewRow } from "@/lib/brandOverview";
import { ProfileGroups } from "./ProfileRows";

class MemStorage {
  s = new Map<string, string>();
  getItem(k: string) { return this.s.get(k) ?? null; }
  setItem(k: string, v: string) { this.s.set(k, v); }
  removeItem(k: string) { this.s.delete(k); }
  key(i: number) { return [...this.s.keys()][i] ?? null; }
  get length() { return this.s.size; }
}
beforeEach(() => {
  const storage = new MemStorage();
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("window", { localStorage: storage, dispatchEvent: () => true });
});
afterEach(() => vi.unstubAllGlobals());

const empty: OverviewInput = { leo: false, kit: null, positioning: null, voice: null };
const rows = brandOverview(empty).flatMap((g) => g.rows);
const byId = (id: string) => rows.find((r) => r.id === id) as OverviewRow;
const draw = (openId: string | null, next?: OverviewRow) =>
  renderToStaticMarkup(createElement(MemoryRouter, null, createElement(ProfileGroups, {
    groups: brandOverview(empty), uid: "u1", openId, next, onOpen: () => undefined, onClose: () => undefined, onSaved: () => undefined,
  })));

describe("Profile's open row", () => {
  it("names the next gap beside Done, so filling in goes field to field without going back to the top", () => {
    const html = draw("name", byId("does"));
    expect(html).toContain("Done");
    expect(html).toMatch(/<button[^>]*>Next: Say what you do/);
  });

  it("links a gap Profile does not edit in place to where it is filled, Your voice lower on this page", () => {
    expect(draw("topics", byId("voice"))).toMatch(/<a[^>]*href="\/playbook#voice"[^>]*>Next: Paste past posts/);
  });

  it("sends offers, colours and sign-off down to Brand kit's own sections on this page, never a second editor", () => {
    const html = draw("sells");
    expect(html).toMatch(/<a[^>]*href="\/playbook#offers"/);
    expect(html).toMatch(/<a[^>]*href="\/playbook#colour"/);
    expect(html).toMatch(/<a[^>]*href="\/playbook#sign-off"/);
    expect(html).not.toContain("Your offer");
  });

  it("shows no Next once nothing else is missing, and none while no row is open", () => {
    expect(draw("name")).not.toContain("Next:");
    expect(draw(null, byId("does"))).not.toContain("Next:");
  });
});
