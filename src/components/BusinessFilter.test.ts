import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

let url = new URLSearchParams();
vi.mock("react-router-dom", () => ({
  useSearchParams: () => [
    url,
    (arg: (p: URLSearchParams) => URLSearchParams) => {
      url = arg(url);
    },
  ],
}));

const { useBusinessFilter } = await import("./BusinessFilter");

const store = new Map<string, string>();
globalThis.localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, String(v)),
} as Storage;

const NAMES = ["Leo", "MoneyBees", "Team posts"];
function run(at: string, linked?: string) {
  url = new URLSearchParams(at);
  let out!: ReturnType<typeof useBusinessFilter>;
  renderToStaticMarkup(createElement(() => ((out = useBusinessFilter(NAMES, linked)), null)));
  return out;
}

beforeEach(() => store.clear());

describe("useBusinessFilter", () => {
  it("reads ?business= as the chip label's slug, over the remembered pick", () => {
    store.set("cs-calendar-business", "moneybees");
    expect(run("business=team-posts").bizOn).toBe("teamposts");
    expect(run("business=all").bizOn).toBe("all");
    expect(run("").bizOn).toBe("moneybees");
  });

  it("still reads a pick remembered before links existed (a key, not a slug)", () => {
    store.set("cs-calendar-business", "teamposts");
    expect(run("").bizOn).toBe("teamposts");
  });

  it("ignores a business this account does not have", () => {
    expect(run("business=acme").bizOn).toBe("all");
  });

  it("uses the business a link implies only when the link names none", () => {
    expect(run("teampost=tp3", "team-posts").bizOn).toBe("teamposts");
    expect(run("teampost=tp3&business=leo", "team-posts").bizOn).toBe("leo");
  });

  it("picking writes the slug to the URL and the memory, and keeps other params", () => {
    run("view=week").pick("teamposts");
    expect(url.toString()).toBe("view=week&business=team-posts");
    expect(store.get("cs-calendar-business")).toBe("team-posts");
    run(url.toString()).pick("all");
    expect(url.toString()).toBe("view=week");
  });
});
