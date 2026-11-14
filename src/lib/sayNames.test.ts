import { describe, expect, it } from "vitest";
import { sayNames, unsayWords } from "@/lib/sayNames";
import { sanitizeBrand } from "@/lib/carousel";

const names = [
  { name: "Postmosis", say: "Post-MOH-sis" },
  { name: "Money Bees", say: "Money Bees" },
  { name: "Ng & Co", say: "Ing and Co" },
];

describe("sayNames", () => {
  it("swaps each name, as a whole word in any case, for its respelling, and leaves the rest", () => {
    expect(sayNames("Try Postmosis today. postmosis's plan, not Postmosisx.", names)).toBe("Try Post-MOH-sis today. Post-MOH-sis's plan, not Postmosisx.");
    expect(sayNames("Ask Ng  &  Co about Money Bees", names)).toBe("Ask Ing and Co about Money Bees");
    expect(sayNames("Postmosis", [])).toBe("Postmosis");
    expect(sayNames("Postmosis", undefined)).toBe("Postmosis");
  });
});

describe("unsayWords", () => {
  const w = (word: string, s: number, e = s + 1) => ({ w: word, s, e });
  it("puts the name back over the respelling's word times, keeping its punctuation", () => {
    expect(unsayWords([w("Try", 0), w("Post-MOH-sis,", 1, 2.5), w("today.", 3)], names)).toEqual([w("Try", 0), w("Postmosis,", 1, 2.5), w("today.", 3)]);
    expect(unsayWords([w("Ask", 0), w("Ing", 1), w("and", 2), w("Co.", 3, 3.4)], names)).toEqual([w("Ask", 0), w("Ng & Co.", 1, 3.4)]);
    const plain = [w("Ask", 0), w("and", 1)];
    expect(unsayWords(plain, names)).toEqual(plain);
    expect(unsayWords(plain, [])).toBe(plain);
  });
  it("the brand kit keeps a name and its respelling only when both are there", () => {
    expect(sanitizeBrand({ say: [{ name: " Postmosis ", say: "Post-MOH-sis" }, { name: "x", say: " " }, "bad"] }).say).toEqual([{ name: "Postmosis", say: "Post-MOH-sis" }]);
  });
});
