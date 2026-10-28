import { describe, expect, it } from "vitest";
import { adviserWordsIn, PROFESSIONS } from "../_shared/adviserWords";
import { HONEST_LINE } from "../_shared/profession";
import { handleRpc, LEO_INSTRUCTIONS, LEO_TOOLS, toldFor, type Link, type Store } from "./logic";

const UID = "ff72c375-389e-4dd0-86c4-a166307b8751";
const link: Link = { userId: UID, scope: UID, secret: "a".repeat(43) };
const second: Link = { ...link, scope: `${UID}~p1` };

/** A user's rows holding only brand kits, keyed by scope. */
const brands = (kits: Record<string, Record<string, unknown>> = {}): Store => ({
  get: async (k) => {
    const scope = k.startsWith("content-studio-carousel-brand-") ? k.slice("content-studio-carousel-brand-".length) : "";
    return kits[scope] ? JSON.stringify(kits[scope]) : null;
  },
  insert: async () => false,
  all: async () => [],
});

/** What Claude is told when it connects through a link: the instructions and the tool list. */
async function told(store: Store, l: Link = link, leo = false) {
  const init = (await handleRpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }, store, l, undefined, { leo })) as { result: { instructions: string } };
  const list = (await handleRpc({ jsonrpc: "2.0", id: 2, method: "tools/list" }, store, l, undefined, { leo })) as { result: { tools: unknown[] } };
  return { instructions: init.result.instructions, tools: list.result.tools };
}

// facts about the app, true for every brand: get_calendar's today and add_draft's scheduledFor are read in Singapore
const KEPT = ["default today in Singapore", "in Singapore time"];
const withoutKept = (text: string) => KEPT.reduce((t, k) => t.replaceAll(k, ""), text);

describe("Connect Claude for the brand's profession", () => {
  it("a brand with no profession set gets today's tools and instructions byte for byte", async () => {
    await expect(JSON.stringify(await told(brands()), null, 2)).toMatchFileSnapshot("./__pins__/adviser-tools.json");
  });

  it("an adviser, either spelling and any case, gets the same as none set", async () => {
    const none = await told(brands());
    for (const profession of ["", "  ", "Financial adviser", " financial ADVISOR "]) expect(await told(brands({ [UID]: { name: "Jane", profession } }))).toEqual(none);
  });

  it.each(PROFESSIONS)("$raw is told the workspace is theirs, with none of the adviser words", async ({ raw, said }) => {
    const t = await told(brands({ [UID]: { name: "Jane", profession: raw } }));
    expect(t.instructions).toBe(`Postmosis is a ${said}'s social media workspace. Read get_brand before drafting. ${HONEST_LINE}`);
    const text = JSON.stringify(t);
    expect(text).toContain(`List the ${said}'s posts`);
    expect(text).toContain(`where its wording is checked before posting. Write only facts the ${said} gave you.`);
    for (const k of KEPT) expect(text).toContain(k);
    expect(adviserWordsIn(withoutKept(text))).toEqual([]);
  });

  it("reads the profession from the link's own brand", async () => {
    const store = brands({ [`${UID}~p1`]: { name: "Studio", profession: "Coach" } });
    expect((await told(store, second)).instructions).toContain("Postmosis is a coach's social media workspace.");
    expect(await told(store, link)).toEqual(await told(brands()));
  });

  it("leaves Leo's links as they are, whatever the brand does", async () => {
    const t = await told(brands({ [UID]: { profession: "Coach" } }), link, true);
    expect(t).toEqual({ instructions: LEO_INSTRUCTIONS, tools: LEO_TOOLS });
  });

  it("puts the profession in as typed, never read as a replace pattern", () => {
    const t = toldFor("$&-maker");
    expect(t.instructions).toContain("Postmosis is a $&-maker's social media workspace.");
    expect(JSON.stringify(t.tools)).toContain("Write only facts the $&-maker gave you.");
  });
});
