import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// A stand-in for the router's search params: the hooks read `url` and write through setParams like the real one.
let url = new URLSearchParams();
let writes: { arg: unknown; opts: { replace?: boolean } | undefined }[] = [];
// `stale` copies React Router 6.30: a functional update starts from the params of the last render, not the last write.
let stale = false;
vi.mock("react-router-dom", () => ({
  useSearchParams: () => {
    const rendered = url;
    return [
      url,
      (arg: unknown, opts?: { replace?: boolean }) => {
        writes.push({ arg, opts });
        const from = stale ? rendered : url;
        url = typeof arg === "function" ? (arg as (p: URLSearchParams) => URLSearchParams)(from) : new URLSearchParams(arg as string);
      },
    ];
  },
}));

const { pickValue, useUrlItem, useUrlList, useUrlState, withParam } = await import("./urlState");

const store = new Map<string, string>();
globalThis.localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: () => null,
  length: 0,
} as Storage;

/** Runs a hook once, the way a page render would, and hands back what it returned. */
function run<T>(hook: () => T, at = ""): T {
  url = new URLSearchParams(at);
  let out!: T;
  renderToStaticMarkup(createElement(() => ((out = hook()), null)));
  return out;
}

const VIEWS = ["month", "week", "upcoming"] as const;
const useView = () => useUrlState("view", "month", { allowed: VIEWS, remember: "k" });

beforeEach(() => {
  store.clear();
  writes = [];
  stale = false;
});

describe("useUrlState", () => {
  it("the URL beats the remembered pick, which beats the fallback", () => {
    store.set("k", "week");
    expect(run(useView, "view=upcoming")[0]).toBe("upcoming");
    expect(run(useView, "")[0]).toBe("week");
    store.clear();
    expect(run(useView, "")[0]).toBe("month");
  });

  it("an unknown value falls back quietly, to the remembered pick first", () => {
    expect(run(useView, "view=yearly")[0]).toBe("month");
    store.set("k", "week");
    expect(run(useView, "view=yearly")[0]).toBe("week");
    store.set("k", "garbage");
    expect(run(useView, "view=yearly")[0]).toBe("month");
  });

  it("picking keeps every other param, drops the default and remembers", () => {
    const [, set] = run(useView, "business=team-posts&view=week&teampost=tp3");
    set("month");
    expect(url.toString()).toBe("business=team-posts&teampost=tp3");
    expect(store.get("k")).toBe("month");
    set("upcoming");
    expect(url.toString()).toBe("business=team-posts&teampost=tp3&view=upcoming");
    expect(store.get("k")).toBe("upcoming");
  });

  it("replaces the history entry by default and pushes when asked", () => {
    run(useView, "")[1]("week");
    run(() => useUrlState("tab", "a", { push: true }), "")[1]("b");
    expect(writes.map((w) => w.opts?.replace)).toEqual([true, false]);
    expect(writes.every((w) => typeof w.arg === "function")).toBe(true);
  });
});

describe("useUrlList", () => {
  it("reads a comma list, drops values it does not know, and clears to no param", () => {
    const [value, set] = run(() => useUrlList("platform", { allowed: ["instagram", "tiktok"] }), "platform=instagram,fax,tiktok&q=cpf");
    expect(value).toEqual(["instagram", "tiktok"]);
    set(["tiktok"]);
    expect(url.toString()).toBe("platform=tiktok&q=cpf");
    set([]);
    expect(url.toString()).toBe("q=cpf");
    expect(writes.every((w) => w.opts?.replace === true)).toBe(true);
  });
});

describe("useUrlItem", () => {
  it("opening pushes, closing replaces, and both leave other params alone", () => {
    const [id, open, close] = run(() => useUrlItem("post"), "view=week");
    expect(id).toBeNull();
    open("abc");
    expect(url.toString()).toBe("view=week&post=abc");
    expect(run(() => useUrlItem("post"), url.toString())[0]).toBe("abc");
    close();
    expect(url.toString()).toBe("view=week");
    expect(writes.map((w) => w.opts?.replace)).toEqual([undefined, true]);
  });
});

describe("pickValue and withParam", () => {
  it("treat an empty param as missing and never touch the input", () => {
    expect(pickValue("", "week", "month")).toBe("week");
    const prev = new URLSearchParams("a=1&b=2");
    expect(withParam(prev, "a", "all", "all").toString()).toBe("b=2");
    expect(withParam(prev, "c", "3").toString()).toBe("a=1&b=2&c=3");
    expect(withParam(prev, "b", null).toString()).toBe("a=1");
    expect(prev.toString()).toBe("a=1&b=2");
  });
});

const { toggled, useUrlFlag, useUrlLabel, useUrlLabels, useUrlUpdate } = await import("./urlState");

describe("useUrlUpdate", () => {
  it("changes several params in one write, where two setters in one click keep only the last", () => {
    stale = true;
    const [[, setA], [, setB]] = run(() => [useUrlState("tab", "posts"), useUrlState("q", "")], "tab=news&q=cpf&sort=newest");
    setA("posts");
    setB("");
    expect(url.toString()).toBe("tab=news&sort=newest"); // the trap: tab=news came back
    const update = run(useUrlUpdate, "tab=news&q=cpf&sort=newest");
    writes = [];
    update({ tab: null, q: "", format: "carousel" });
    expect(url.toString()).toBe("sort=newest&format=carousel");
    expect(writes).toHaveLength(1);
    expect(writes[0].opts?.replace).toBe(true);
    run(useUrlUpdate, url.toString())({ post: "p1" }, { push: true });
    expect(url.toString()).toBe("sort=newest&format=carousel&post=p1");
    expect(writes.at(-1)?.opts?.replace).toBe(false);
  });
});

describe("label helpers", () => {
  const TOPICS = ["CPF", "Estate Planning", "Career / FA Life"] as const;

  it("toggled adds a value once and takes it out again", () => {
    expect(toggled(["a"], "b")).toEqual(["a", "b"]);
    expect(toggled(["a", "b"], "a")).toEqual(["b"]);
  });

  it("useUrlLabel reads a slug back to its label, ignores unknown ones, and writes slugs", () => {
    expect(run(() => useUrlLabel("topic", TOPICS), "topic=estate-planning")[0]).toBe("Estate Planning");
    expect(run(() => useUrlLabel("topic", TOPICS), "topic=Estate%20Planning")[0]).toBeNull();
    const [, set] = run(() => useUrlLabel("topic", TOPICS), "topic=gone&q=x");
    set("Career / FA Life");
    expect(url.toString()).toBe("topic=career-fa-life&q=x");
    set(null);
    expect(url.toString()).toBe("q=x");
  });

  it("useUrlLabels keeps the known labels in option order and clears to no param", () => {
    const [value, set] = run(() => useUrlLabels("pillar", ["Authority", "Tip", "CTA"]), "pillar=cta,bogus,authority");
    expect(value).toEqual(["Authority", "CTA"]);
    set(["Tip", "CTA"]);
    expect(url.toString()).toBe("pillar=tip%2Ccta");
    set([]);
    expect(url.toString()).toBe("");
  });

  it("useUrlFlag is on only for its own value", () => {
    expect(run(() => useUrlFlag("saved"), "saved=only")[0]).toBe(true);
    expect(run(() => useUrlFlag("saved"), "saved=yes")[0]).toBe(false);
    const [, set] = run(() => useUrlFlag("saved"), "q=a");
    set(true);
    expect(url.toString()).toBe("q=a&saved=only");
    set(false);
    expect(url.toString()).toBe("q=a");
  });
});
