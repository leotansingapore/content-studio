import { describe, expect, it } from "vitest";
import { isDirty } from "./ProductEditor";
import type { Product } from "@/lib/products";

const saved: Product = { id: "pd-abcd", name: "Tally Board", what: "A habit tracker.", forWho: "", pictures: ["cimg-abcdef"], sources: [""], use: true, from: "you", addedAt: "" };
const draft = { name: "Tally Board", what: "A habit tracker.", forWho: "", price: "", url: "", pictures: ["cimg-abcdef"], sources: [""] };

describe("isDirty", () => {
  it("is false for a product opened and left alone, and for a blank new one", () => {
    expect(isDirty(draft, saved)).toBe(false);
    expect(isDirty({ name: "", what: "", forWho: "", price: "", url: "", pictures: [], sources: [] })).toBe(false);
  });
  it("is true once a word or a picture changed", () => {
    expect(isDirty({ ...draft, what: "A habit tracker reps open daily." }, saved)).toBe(true);
    expect(isDirty({ ...draft, pictures: [], sources: [] }, saved)).toBe(true);
    expect(isDirty({ ...draft, name: "x", what: "", pictures: [], sources: [] })).toBe(true);
  });
});
