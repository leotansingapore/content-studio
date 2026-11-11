import { describe, expect, it } from "vitest";
import { baseOf, hashOf, listMerger, mergeById } from "./syncMerge";

type P = { id: string; text: string };
const p = (id: string, text = id): P => ({ id, text });
const base = (...posts: P[]) => Object.fromEntries(posts.map((x) => [x.id, hashOf(x)]));

describe("mergeById", () => {
  it("keeps a post added on either device: the laptop's and the phone's both survive", () => {
    const was = base(p("a"));
    const laptop = [p("l"), p("a")];
    const phone = [p("m"), p("a")];
    // the phone saved last: its order, with the laptop's new post on top
    expect(mergeById(laptop, phone, was, false).map((x) => x.id)).toEqual(["l", "m", "a"]);
    expect(mergeById(laptop, phone, was, true).map((x) => x.id)).toEqual(["m", "l", "a"]);
  });

  it("drops a post deleted on either device, unless the other edited it since", () => {
    const was = base(p("a"), p("b"), p("c"));
    // the phone deleted b; the laptop deleted c but the phone edited it
    const laptop = [p("a"), p("b")];
    const phone = [p("a"), p("c", "edited")];
    expect(mergeById(laptop, phone, was, true)).toEqual([p("c", "edited"), p("a")]);
  });

  it("takes the side that changed a post, and the newer save when both did", () => {
    const was = base(p("a"), p("b"));
    const laptop = [p("a", "laptop"), p("b", "laptop b")];
    const phone = [p("a"), p("b", "phone b")];
    expect(mergeById(laptop, phone, was, false)).toEqual([p("a", "laptop"), p("b", "phone b")]);
    expect(mergeById(laptop, phone, was, true)).toEqual([p("a", "laptop"), p("b", "laptop b")]);
  });

  it("settles on one order: the same posts in another order merge to the order of the side saved last", () => {
    const was = base(p("a"), p("b"));
    expect(mergeById([p("b"), p("a")], [p("a"), p("b")], was, false)).toEqual([p("a"), p("b")]);
    expect(mergeById([p("b"), p("a")], [p("a"), p("b")], was, true)).toEqual([p("b"), p("a")]);
  });

  it("with nothing synced before, keeps every post from both and never reads a missing one as deleted", () => {
    expect(mergeById([p("a"), p("b", "mine")], [p("b", "theirs"), p("c")], null, false)).toEqual([p("a"), p("b", "theirs"), p("c")]);
  });
});

describe("listMerger", () => {
  const m = listMerger<P>({ after: (list) => list.slice(0, 3) });
  it("merges two stored lists into one stored list, capped after the merge", () => {
    const was = JSON.stringify([p("a")]);
    const out = m.merge(JSON.stringify([p("l"), p("a")]), JSON.stringify([p("m"), p("n"), p("a")]), m.base(was), false);
    expect(JSON.parse(out!).map((x: P) => x.id)).toEqual(["l", "m", "n"]);
  });
  it("gives up (null) on a value that isn't a list of posts with ids, so the old whole-value rules apply", () => {
    expect(m.merge("older edit here", JSON.stringify([p("a")]), null, false)).toBeNull();
    expect(m.merge(JSON.stringify([{ text: "no id" }]), JSON.stringify([p("a")]), null, false)).toBeNull();
    expect(m.base("not json")).toBeNull();
  });
  it("gives up on a list where only some entries have ids, instead of merging the others away", () => {
    const mixed = JSON.stringify([p("a"), { text: "no id" }, { text: "no id either" }]);
    expect(m.merge(mixed, JSON.stringify([p("a")]), null, false)).toBeNull();
    expect(m.merge(JSON.stringify([p("a")]), mixed, null, false)).toBeNull();
  });
  it("records the posts a value holds by id and content", () => {
    expect(baseOf([p("a")])).toEqual({ a: hashOf(p("a")) });
    expect(hashOf(p("a"))).not.toBe(hashOf(p("a", "changed")));
  });
});
