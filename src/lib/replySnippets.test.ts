import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fillVariables, insertSnippet, loadForm, loadSnippets, MAX_SNIPPET_NAME, MAX_SNIPPETS, MAX_TEXT, ofKind, removeSnippet, saveForm, saveSnippet, snippetName } from "@/lib/replySnippets";
import { dmLinks, waDigits } from "@/lib/bioPage";
import { blankRanges } from "@/lib/platformCounters";
import { isSyncedKeyFor } from "@/lib/cloudSync";
import { loadEdit, saveEdit } from "@/lib/engageDrafts";

const store = new Map<string, string>();
vi.mock("@/lib/supabase", () => ({ supabase: {}, SUPABASE_URL: "https://x.supabase.co" }));

beforeEach(() => {
  store.clear();
  vi.stubGlobal("window", {
    localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) },
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("saved replies", () => {
  it("saves per profile under a synced key, newest first, and deletes", () => {
    const a = saveSnippet("u1", { name: " Calendar ", text: " Here's my calendar, pick any slot that works. " });
    expect(a.saved).toMatchObject({ name: "Calendar", text: "Here's my calendar, pick any slot that works." });
    saveSnippet("u1", { name: "Thanks", text: "Thanks for reaching out!" });
    expect(loadSnippets("u1").map((s) => s.name)).toEqual(["Thanks", "Calendar"]);
    expect([...store.keys()]).toEqual(["content-studio-snippets-u1"]);
    expect(loadSnippets("u2")).toEqual([]);
    expect(removeSnippet("u1", a.saved!.id).map((s) => s.name)).toEqual(["Thanks"]);
  });

  it("names a nameless one from its first words and edits in place", () => {
    const { saved } = saveSnippet("u1", { name: "", text: "Happy to send you the hospital plan guide now" });
    expect(saved?.name).toBe("Happy to send you the");
    const edited = saveSnippet("u1", { id: saved!.id, name: "Guide", text: "Sending the guide now" });
    expect(edited.list).toEqual([{ id: saved!.id, name: "Guide", text: "Sending the guide now" }]);
    expect(snippetName("Supercalifragilisticexpialidocious-and-then-some-more-words")).toHaveLength(MAX_SNIPPET_NAME);
  });

  it("refuses an empty one, the same text twice and a 31st", () => {
    expect(saveSnippet("u1", { name: "x", text: "   " }).problem).toBe("empty");
    saveSnippet("u1", { name: "a", text: "Same words" });
    expect(saveSnippet("u1", { name: "b", text: " Same words " }).problem).toBe("duplicate");
    for (let i = loadSnippets("u1").length; i < MAX_SNIPPETS; i++) saveSnippet("u1", { name: "", text: `Reply ${i}` });
    expect(loadSnippets("u1")).toHaveLength(MAX_SNIPPETS);
    expect(saveSnippet("u1", { name: "", text: "One more" }).problem).toBe("full");
    // a full list still takes an edit
    const first = loadSnippets("u1")[0];
    expect(saveSnippet("u1", { id: first.id, name: "Changed", text: first.text }).problem).toBeUndefined();
  });

  it("skips rows another device wrote badly", () => {
    store.set("content-studio-snippets-u1", JSON.stringify([{ id: "a", name: "ok", text: "fine" }, { id: "b", name: "blank", text: " " }, null, { name: "no id", text: "x" }]));
    expect(loadSnippets("u1").map((s) => s.id)).toEqual(["a"]);
    store.set("content-studio-snippets-u1", "{not json");
    expect(loadSnippets("u1")).toEqual([]);
  });
});

// Pinned on main 2fc410b0, before snippets gained kinds: the replies stored today (no kind, extra fields from
// another device, a 31st row) must load and insert in Engage exactly like this afterwards.
describe("today's stored replies (pinned)", () => {
  const rows = [
    { id: "s1", name: "Calendar", text: "Here's my calendar, pick any slot that works.", extra: "dropped" },
    { id: "s2", name: "Guide", text: "Happy to send you my 2-page guide on hospital plans. Which email should it go to?" },
    ...Array.from({ length: 29 }, (_, i) => ({ id: `r${i}`, name: `Reply ${i}`, text: `Reply text ${i}` })),
  ];

  it("load as the first 30, each as id, name and text", () => {
    store.set("content-studio-snippets-u1", JSON.stringify(rows));
    const list = loadSnippets("u1");
    expect(list).toHaveLength(30);
    expect(list[0]).toEqual({ id: "s1", name: "Calendar", text: "Here's my calendar, pick any slot that works." });
    expect(list[29]).toEqual({ id: "r27", name: "Reply 27", text: "Reply text 27" });
    expect(list.map((s) => s.id)).not.toContain("r28");
  });

  it("insert into a draft as before, and the full list refuses a new one", () => {
    store.set("content-studio-snippets-u1", JSON.stringify(rows));
    const [calendar] = loadSnippets("u1");
    expect(insertSnippet("Thanks Karen!", calendar.text)).toEqual({ text: "Thanks Karen! Here's my calendar, pick any slot that works.", caret: 59 });
    expect(insertSnippet("Hi [link] bye", calendar.text, 3, 9).text).toBe("Hi Here's my calendar, pick any slot that works. bye");
    expect(saveSnippet("u1", { name: "", text: "One more" }).problem).toBe("full");
    expect(saveSnippet("u1", { name: "x", text: "Reply text 3" })).toMatchObject({ problem: "duplicate", saved: { id: "r3" } });
  });
});

describe("kinds", () => {
  it("a row without a kind loads as a reply; a stored kind survives and an unknown one loads as a reply", () => {
    store.set(
      "content-studio-snippets-u1",
      JSON.stringify([
        { id: "a", name: "Old", text: "An old reply" },
        { id: "b", name: "Tags", text: "#cpf #retirement", kind: "hashtags" },
        { id: "c", name: "Odd", text: "Unknown kind", kind: "tweet" },
        { id: "d", name: "Said reply", text: "Kind reply", kind: "reply" },
      ]),
    );
    expect(loadSnippets("u1")).toEqual([
      { id: "a", name: "Old", text: "An old reply" },
      { id: "b", name: "Tags", text: "#cpf #retirement", kind: "hashtags" },
      { id: "c", name: "Odd", text: "Unknown kind" },
      { id: "d", name: "Said reply", text: "Kind reply" },
    ]);
    expect(ofKind(loadSnippets("u1"), "reply").map((s) => s.id)).toEqual(["a", "c", "d"]);
  });

  it("keeps 30 of each kind: 31 hashtag sets and 30 replies load as 30 and 30", () => {
    const rows = [
      ...Array.from({ length: 31 }, (_, i) => ({ id: `h${i}`, name: `Tags ${i}`, text: `#tag${i}`, kind: "hashtags" })),
      ...Array.from({ length: 30 }, (_, i) => ({ id: `r${i}`, name: `Reply ${i}`, text: `Reply ${i}` })),
    ];
    store.set("content-studio-snippets-u1", JSON.stringify(rows));
    const list = loadSnippets("u1");
    expect(ofKind(list, "hashtags")).toHaveLength(30);
    expect(ofKind(list, "reply")).toHaveLength(30);
    expect(list.map((s) => s.id)).not.toContain("h30");
  });

  it("refuses the 31st of one kind while another kind still saves, and checks duplicates within a kind", () => {
    for (let i = 0; i < 30; i++) expect(saveSnippet("u1", { name: "", text: `#tag${i}`, kind: "hashtags" }).problem).toBeUndefined();
    expect(saveSnippet("u1", { name: "", text: "#one #more", kind: "hashtags" }).problem).toBe("full");
    expect(saveSnippet("u1", { name: "", text: "Book 15 minutes with me.", kind: "ending" }).saved).toMatchObject({ kind: "ending" });
    // the same text as a hashtag set saves as a reply, but not twice as a set
    expect(saveSnippet("u1", { name: "", text: "#tag3" }).problem).toBeUndefined();
    expect(saveSnippet("u1", { name: "", text: "#tag3", kind: "hashtags" }).problem).toBe("duplicate");
    // a reply is stored without a kind, as before kinds existed
    expect(JSON.parse(store.get("content-studio-snippets-u1")!).find((r: { text: string; kind?: string }) => r.text === "#tag3" && !r.kind)).toBeTruthy();
  });

  it("an edit keeps the kind, and text is cut to its kind's limit", () => {
    const { saved } = saveSnippet("u1", { name: "Hook", text: "x".repeat(500), kind: "hook" });
    expect(saved!.text).toHaveLength(MAX_TEXT.hook);
    const edited = saveSnippet("u1", { id: saved!.id, name: "Hook", text: "y".repeat(500) });
    expect(edited.saved).toMatchObject({ kind: "hook", text: "y".repeat(200) });
    expect(loadSnippets("u1")[0].kind).toBe("hook");
    expect(saveSnippet("u1", { name: "", text: "p".repeat(3000), kind: "post" }).saved!.text).toHaveLength(2200);
    expect(saveSnippet("u1", { name: "", text: "t".repeat(400), kind: "hashtags" }).saved!.text).toHaveLength(300);
    expect(saveSnippet("u1", { name: "", text: "e".repeat(400), kind: "ending" }).saved!.text).toHaveLength(300);
  });

  it("tells an open Insert panel the list changed", () => {
    const changed = vi.fn();
    vi.stubGlobal("dispatchEvent", (e: Event) => changed(e.type));
    saveSnippet("u1", { name: "", text: "#cpf", kind: "hashtags" });
    expect(changed).toHaveBeenCalledWith("content-studio-snippets-changed");
  });

  it("a hashtag set rides today's synced key, so another device's Insert panel gets it", () => {
    const uid = "0b9f2c4e-1a2b-4c3d-8e9f-0a1b2c3d4e5f";
    saveSnippet(uid, { name: "", text: "#cpf #sg", kind: "hashtags" });
    expect([...store.keys()]).toEqual([`content-studio-snippets-${uid}`]);
    expect(isSyncedKeyFor(`content-studio-snippets-${uid}`, uid)).toBe(true);
  });

  it("keeps each kind's add form apart, the reply form under today's key", () => {
    saveForm("u1", { name: "Tags", text: "#cpf" }, "hashtags");
    saveForm("u1", { name: "Calendar", text: "Here's my" });
    expect(loadForm("u1", "hashtags")).toMatchObject({ name: "Tags", text: "#cpf" });
    expect(loadForm("u1")).toMatchObject({ name: "Calendar" });
    expect([...store.keys()].sort()).toEqual(["cs-snippet-form-hashtags-u1", "cs-snippet-form-u1"]);
  });
});

describe("fillVariables", () => {
  const brand = {
    color: "#1E3A8A",
    name: "Ada Tan",
    handle: "@adatan",
    role: "Financial adviser",
    offers: [{ name: "Free review", url: "adatan.sg/review" }],
    whatsapp: "9123 4567",
    whatsappText: "Hi Ada",
    instagram: "ada.tan",
  };

  it("fills the known tokens, with the same wa.me link Brand kit builds", () => {
    const r = fillVariables("{name} ({role}, {handle}): {offer} at {offer_link}. WhatsApp {whatsapp} or DM {instagram}.", brand);
    const wa = dmLinks({ instagram: "", facebook: "", whatsapp: brand.whatsapp, whatsappText: brand.whatsappText }).find((l) => l.id === "whatsapp")!.url;
    expect(wa).toBe(`https://wa.me/${waDigits(brand.whatsapp)}?text=Hi%20Ada`);
    expect(r).toEqual({
      text: `Ada Tan (Financial adviser, @adatan): Free review at https://adatan.sg/review. WhatsApp ${wa} or DM https://ig.me/m/ada.tan.`,
      missing: [],
    });
  });

  it("an empty value becomes a blank that Write marks, and is listed as missing", () => {
    const r = fillVariables("Chat with me on WhatsApp: {whatsapp} today.", { ...brand, whatsapp: "" });
    expect(r.text).toBe("Chat with me on WhatsApp: [your WhatsApp number] today.");
    expect(blankRanges(r.text)).toHaveLength(1);
    expect(r.missing).toEqual(["whatsapp"]);
  });

  it("a blank alone on its line is still listed as missing, though Write does not mark it", () => {
    const r = fillVariables("Thanks for reading.\n{offer_link}", null);
    expect(r.text).toBe("Thanks for reading.\n[your offer link]");
    expect(blankRanges(r.text)).toEqual([]);
    expect(r.missing).toEqual(["offer_link"]);
  });

  it("leaves an unknown token as typed, and starts the Instagram link from the Analytics account", () => {
    expect(fillVariables("{price} and {constructor} and {Name}", brand)).toEqual({ text: "{price} and {constructor} and {Name}", missing: [] });
    expect(fillVariables("{instagram}", { color: "#000", name: "", handle: "" }, { instagram: { handle: "@ada.ig" } }).text).toBe("https://ig.me/m/ada.ig");
  });
});

describe("insertSnippet", () => {
  it("goes at the end with a space when nothing is selected", () => {
    expect(insertSnippet("Thanks Karen!", "Here's my calendar.")).toEqual({ text: "Thanks Karen! Here's my calendar.", caret: 33 });
    expect(insertSnippet("", "Hi")).toEqual({ text: "Hi", caret: 2 });
    expect(insertSnippet("Line one\n", "two").text).toBe("Line one\ntwo");
  });

  it("replaces the selection", () => {
    expect(insertSnippet("Hi [link] bye", "calendly.com/ada", 3, 9)).toEqual({ text: "Hi calendly.com/ada bye", caret: 19 });
    expect(insertSnippet("Hi bye", "there", 2, 2).text).toBe("Hi there bye");
  });

  it("keeps a space after it when the caret sits just before a word", () => {
    expect(insertSnippet("Hi bye", "there", 3)).toEqual({ text: "Hi there bye", caret: 8 });
    expect(insertSnippet("Hi bye", "there,", 3).text).toBe("Hi there, bye");
    expect(insertSnippet("Hi !", "there", 3).text).toBe("Hi there!");
  });
});

describe("the add form", () => {
  it("keeps what is being typed on this device and clears when empty", () => {
    saveForm("u1", { name: "Calendar", text: "Here's my" });
    expect(loadForm("u1")).toEqual({ id: undefined, name: "Calendar", text: "Here's my" });
    expect([...store.keys()]).toEqual(["cs-snippet-form-u1"]);
    saveForm("u1", { name: "", text: "" });
    expect(loadForm("u1")).toEqual({ name: "", text: "" });
    expect(store.size).toBe(0);
  });
});

describe("draft edits", () => {
  it("keeps your edit of a draft on this device and forgets it when changed back", () => {
    expect(loadEdit("u1", "Thanks Sarah!")).toBeNull();
    saveEdit("u1", "Thanks Sarah!", "Thanks Sarah! Here's my calendar.");
    expect(loadEdit("u1", "Thanks Sarah!")).toBe("Thanks Sarah! Here's my calendar.");
    expect(loadEdit("u2", "Thanks Sarah!")).toBeNull();
    expect([...store.keys()]).toEqual(["cs-engage-edits-u1"]);
    saveEdit("u1", "Thanks Sarah!", "Thanks Sarah!");
    expect(loadEdit("u1", "Thanks Sarah!")).toBeNull();
  });

  it("keeps the newest 60", () => {
    for (let i = 0; i < 61; i++) saveEdit("u1", `d${i}`, `e${i}`);
    expect(loadEdit("u1", "d0")).toBeNull();
    expect(loadEdit("u1", "d1")).toBe("e1");
    expect(loadEdit("u1", "d60")).toBe("e60");
  });
});
