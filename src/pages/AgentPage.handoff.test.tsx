import { StrictMode, createElement as h } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fx = vi.hoisted(() => ({
  sent: [] as string[],
  opts: [] as unknown[],
  id: "tmade1",
  thread: [] as { threadId: unknown; ask: unknown }[],
}));

vi.mock("@/lib/supabase", () => ({
  SUPABASE_URL: "https://abc.supabase.co",
  supabase: { auth: { getUser: () => new Promise(() => undefined), getSession: () => new Promise(() => undefined), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) }, from: () => ({}) },
}));
vi.mock("@/lib/useLeoOnly", () => ({ useLeoUser: () => ({ id: "u-leo", email: "leo@x.sg" }), useLeoOnly: () => true }));
vi.mock("@/lib/agentRun", () => ({ send: (_u: string, _t: string | null, text: string, o?: unknown) => (fx.sent.push(text), fx.opts.push(o), fx.id), turnOf: () => null }));
vi.mock("@/lib/agentWork", () => ({ workOf: () => ({ waiting: [], making: [], made: [] }) }));
vi.mock("@/components/agent/AgentThread", () => ({ default: (p: { threadId: unknown; ask: unknown }) => (fx.thread.push({ threadId: p.threadId, ask: p.ask }), null), useThreads: () => [] }));
vi.mock("@/components/agent/WorkPanel", () => ({ default: () => null }));
vi.mock("@/components/agent/ThreadList", () => ({ default: () => null }));
vi.mock("@/components/CopyLinkButton", () => ({ default: () => null }));

class FakeNode {
  childNodes: FakeNode[] = [];
  parentNode: FakeNode | null = null;
  nodeValue: string | null = null;
  attributes: Record<string, string> = {};
  style: Record<string, unknown> = { setProperty: (k: string, v: string) => void (this.style[k] = v), removeProperty: (k: string) => void delete this.style[k] };
  constructor(
    readonly nodeType: number,
    readonly nodeName: string,
    readonly ownerDocument: FakeNode | null,
    readonly namespaceURI: string | null,
  ) {}
  get tagName() {
    return this.nodeName;
  }
  get firstChild() {
    return this.childNodes[0] ?? null;
  }
  get lastChild() {
    return this.childNodes[this.childNodes.length - 1] ?? null;
  }
  get textContent(): string {
    return this.nodeType === 3 ? (this.nodeValue ?? "") : this.childNodes.map((c) => c.textContent).join("");
  }
  set textContent(v: string) {
    if (this.nodeType === 3) {
      this.nodeValue = v;
      return;
    }
    for (const c of this.childNodes) c.parentNode = null;
    this.childNodes = [];
    if (v) this.appendChild(doc.createTextNode(v));
  }
  appendChild(c: FakeNode) {
    return this.insertBefore(c, null);
  }
  insertBefore(c: FakeNode, ref: FakeNode | null) {
    c.parentNode?.removeChild(c);
    const i = ref ? this.childNodes.indexOf(ref) : -1;
    if (i < 0) this.childNodes.push(c);
    else this.childNodes.splice(i, 0, c);
    c.parentNode = this;
    return c;
  }
  removeChild(c: FakeNode) {
    const i = this.childNodes.indexOf(c);
    if (i >= 0) this.childNodes.splice(i, 1);
    c.parentNode = null;
    return c;
  }
  setAttribute(k: string, v: unknown) {
    this.attributes[k] = String(v);
  }
  setAttributeNS(_ns: string, k: string, v: unknown) {
    this.attributes[k] = String(v);
  }
  removeAttribute(k: string) {
    delete this.attributes[k];
  }
  getAttribute(k: string) {
    return this.attributes[k] ?? null;
  }
  addEventListener() {}
  removeEventListener() {}
  getBoundingClientRect() {
    return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 };
  }
}
class FakeDocument extends FakeNode {
  activeElement = null;
  documentElement: FakeNode;
  body: FakeNode;
  constructor() {
    super(9, "#document", null, null);
    this.documentElement = this.createElement("html");
    this.body = this.createElement("body");
  }
  createElement(tag: string) {
    return new FakeNode(1, tag.toUpperCase(), this, "http://www.w3.org/1999/xhtml");
  }
  createElementNS(ns: string, tag: string) {
    return new FakeNode(1, tag, this, ns);
  }
  createTextNode(text: string) {
    const n = new FakeNode(3, "#text", this, null);
    n.nodeValue = text;
    return n;
  }
  querySelector() {
    return null;
  }
}
const doc = new FakeDocument();

const store = new Map<string, string>();
const ls = {
  get length() {
    return store.size;
  },
  key: (i: number) => [...store.keys()][i] ?? null,
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
};

const ORIGIN = "http://localhost";
const loc = { pathname: "/", search: "", hash: "", origin: ORIGIN, href: `${ORIGIN}/`, assign() {}, replace() {} };
const entries: { state: unknown; url: string }[] = [];
let at = 0;
const goTo = (url: string) => {
  const u = new URL(url, loc.href);
  Object.assign(loc, { pathname: u.pathname, search: u.search, hash: u.hash, href: u.href });
};
const hist = {
  get state() {
    return entries[at]?.state ?? null;
  },
  get length() {
    return entries.length;
  },
  pushState(state: unknown, _t: string, url?: string) {
    entries.splice(at + 1);
    entries.push({ state, url: url ?? entries[at].url });
    at = entries.length - 1;
    if (url) goTo(url);
  },
  replaceState(state: unknown, _t: string, url?: string) {
    entries[at] = { state, url: url ?? entries[at].url };
    if (url) goTo(url);
  },
  go() {},
  back() {},
  forward() {},
};
const win = {
  document: doc,
  event: undefined,
  HTMLIFrameElement: class {},
  localStorage: ls,
  sessionStorage: ls,
  location: loc,
  history: hist,
  innerHeight: 800,
  scrollY: 0,
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent: () => true,
  matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  requestAnimationFrame: (cb: () => void) => setTimeout(cb, 0),
  cancelAnimationFrame: (t: ReturnType<typeof setTimeout>) => clearTimeout(t),
  setTimeout: (cb: () => void, ms?: number) => setTimeout(cb, ms),
  clearTimeout: (t: ReturnType<typeof setTimeout>) => clearTimeout(t),
};
vi.stubGlobal("window", win);
vi.stubGlobal("document", doc);
vi.stubGlobal("localStorage", ls);
vi.stubGlobal("sessionStorage", ls);
vi.stubGlobal("requestAnimationFrame", win.requestAnimationFrame);
vi.stubGlobal("cancelAnimationFrame", win.cancelAnimationFrame);

const { createRoot } = await import("react-dom/client");
const { flushSync } = await import("react-dom");
const { BrowserRouter, Outlet, Route, Routes, useLocation, useNavigate } = await import("react-router-dom");
const { useBrandAddress } = await import("@/lib/profiles");
const { links } = await import("@/lib/links");
const { STATIC_FORMATS } = await import("@/data/staticFormats");
const { default: AgentPage } = await import("./AgentPage");

const ASK = 'Make a "Lo-fi note" static ad about office workers who skip lunch';
const FROM = { label: "Static ads > Lo-fi note", path: "/make/static/lofi-note" };

function Shell({ uid }: { uid: string | null }) {
  const { pathname } = useLocation();
  useBrandAddress(uid);
  return h("div", { key: pathname }, h(Outlet));
}

let go: ReturnType<typeof useNavigate> | null = null;
function Start() {
  go = useNavigate();
  return null;
}

const tick = () => new Promise((r) => setTimeout(r, 20));
async function settle() {
  let last = "";
  for (let quiet = 0, i = 0; quiet < 4 && i < 100; i++) {
    await tick();
    const now = `${loc.pathname}${loc.search}|${JSON.stringify(hist.state)}|${fx.thread.length}`;
    quiet = now === last ? quiet + 1 : 0;
    last = now;
  }
}

async function arrive(o: { strict: boolean; transition: boolean; uid: string | null; state: unknown }) {
  entries.length = 0;
  at = 0;
  entries.push({ state: null, url: "/start" });
  goTo("/start");
  go = null;
  const tree = h(
    BrowserRouter,
    { window: win as never, future: { v7_startTransition: o.transition } },
    h(
      Routes,
      null,
      h(Route, { element: h(Shell, { uid: o.uid }) }, h(Route, { path: "/start", element: h(Start) }), h(Route, { path: "/agent", element: h(AgentPage) }), h(Route, { path: "/agent/:thread", element: h(AgentPage) })),
    ),
  );
  const root = createRoot(doc.createElement("div") as never);
  root.render(o.strict ? h(StrictMode, null, tree) : tree);
  await settle();
  flushSync(() => go!(links.agent({ ask: ASK }), { state: o.state }));
  await settle();
  const shown = fx.thread[fx.thread.length - 1];
  const out = { address: `${loc.pathname}${loc.search}`, state: (hist.state as { usr?: unknown } | null)?.usr ?? null, shown };
  root.unmount();
  return out;
}

beforeEach(() => {
  store.clear();
  fx.sent.length = 0;
  fx.opts.length = 0;
  fx.thread.length = 0;
  fx.id = "tmade1";
});

describe("a page handing the agent a request (/agent?ask= with { send: true, from })", () => {
  for (const strict of [true, false])
    for (const transition of [false, true])
      for (const uid of [null, "u-leo"])
        it(`sends once and opens the chat it made (StrictMode ${strict ? "on" : "off"}, transitions ${transition ? "on" : "off"}, the user ${uid ? "known" : "not known yet"})`, async () => {
          const r = await arrive({ strict, transition, uid, state: { send: true, from: FROM } });
          expect(fx.sent).toEqual([ASK]);
          expect(r.address).toBe(uid ? "/agent/tmade1?profile=me" : "/agent/tmade1");
          expect(r.state).toEqual({ from: FROM });
          expect(r.shown).toEqual({ threadId: "tmade1", ask: null });
        });

  it("puts the words in the composer, sent nowhere, when the new chat can't be saved", async () => {
    fx.id = "";
    const r = await arrive({ strict: true, transition: false, uid: null, state: { send: true, from: FROM } });
    expect(fx.sent).toEqual([ASK]);
    expect(r.address).toBe("/agent");
    expect(r.shown).toEqual({ threadId: null, ask: ASK });
  });

  it("only fills the composer from a pasted link, which carries no state", async () => {
    const r = await arrive({ strict: true, transition: false, uid: null, state: null });
    expect(fx.sent).toEqual([]);
    expect(r.address).toBe("/agent");
    expect(r.shown).toEqual({ threadId: null, ask: ASK });
  });

  it("sends a static format's layout and topic with the words only for a format we draw", async () => {
    const TOPIC = "Office workers who skip lunch";
    const r = await arrive({ strict: true, transition: false, uid: null, state: { send: true, from: FROM, layout: "lofi-note", topic: `  ${TOPIC}  ` } });
    expect([fx.sent, fx.opts]).toEqual([[ASK], [{ layout: "lofi-note", topic: TOPIC }]]);
    expect(r.state).toEqual({ from: FROM });
    STATIC_FORMATS.push({ slug: "future-format", name: "Future format", blurb: "Not drawn yet.", ready: false, scene: "A future scene." });
    try {
      for (const state of [{ layout: "headline", topic: TOPIC }, { layout: "future-format", topic: TOPIC }, { layout: "street-scene", topic: TOPIC }, { layout: 3, topic: TOPIC }, { layout: "lofi-note" }, { layout: "lofi-note", topic: " " }]) {
        fx.sent.length = 0;
        fx.opts.length = 0;
        await arrive({ strict: true, transition: false, uid: null, state: { send: true, from: FROM, ...state } });
        expect([fx.sent, fx.opts], JSON.stringify(state)).toEqual([[ASK], [undefined]]);
      }
    } finally {
      STATIC_FORMATS.pop();
    }
  });
});
