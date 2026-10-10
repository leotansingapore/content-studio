import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { insertSnippet, loadForm, loadSnippets, MAX_SNIPPET_NAME, MAX_SNIPPETS, removeSnippet, saveForm, saveSnippet, snippetName } from "@/lib/replySnippets";
import { loadEdit, saveEdit } from "@/lib/engageDrafts";

const store = new Map<string, string>();
vi.mock("@/lib/supabase", () => ({ supabase: {} }));

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
