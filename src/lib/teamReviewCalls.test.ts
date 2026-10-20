import { beforeEach, describe, expect, it, vi } from "vitest";

// A PostgREST query stub: every builder call is recorded, and awaiting it answers from `reply`.
type Call = [string, unknown[]];
const reply = vi.hoisted(() => ({ fn: (_table: string, _calls: Call[]) => ({ data: [] as unknown[], error: null as unknown }) }));
const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase", () => {
  const from = (table: string) => {
    const calls: Call[] = [];
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "gte", "lt", "order", "range", "limit", "in", "is"]) {
      q[m] = (...args: unknown[]) => {
        calls.push([m, args]);
        return q;
      };
    }
    q.then = (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) => Promise.resolve(reply.fn(table, calls)).then(ok, bad);
    return q;
  };
  return { supabase: { from, rpc } };
});

import { fetchAllEvents, joinTeam, type ReviewEvent } from "./teamReview";

const event = (id: number): ReviewEvent => ({
  id,
  team_id: "t1",
  actor_id: "u1",
  actor_name: "Mei",
  submission_id: null,
  kind: "submitted",
  detail: {},
  content_hash: "h",
  created_at: "2026-10-01T00:00:00Z",
});

beforeEach(() => rpc.mockReset());

describe("the audit export", () => {
  it("reads every page of the range, not just the first 1,000 events, and lists them oldest first", async () => {
    // 2,345 events, served newest first the way the query orders them
    const all = Array.from({ length: 2345 }, (_, i) => event(2345 - i));
    const ranges: unknown[][] = [];
    reply.fn = (table, calls) => {
      expect(table).toBe("cs_review_events");
      const [from, to] = calls.find(([m]) => m === "range")![1] as number[];
      ranges.push([from, to]);
      return { data: all.slice(from, to + 1), error: null };
    };
    const rows = await fetchAllEvents("t1", "2026-09-30T16:00:00.000Z", "2026-10-31T16:00:00.000Z");
    expect(ranges).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
    expect(rows).toHaveLength(2345);
    expect(rows[0].id).toBe(1);
    expect(rows[2344].id).toBe(2345);
  });

  it("fails the export with a plain reason when a page can't be read, rather than handing over part of it", async () => {
    let n = 0;
    reply.fn = () => (n++ === 0 ? { data: Array.from({ length: 1000 }, (_, i) => event(i + 1)), error: null } : { data: [], error: { message: "Failed to fetch" } });
    await expect(fetchAllEvents("t1", "a", "b")).rejects.toThrow("Couldn't reach the server. Check your connection and try again.");
  });
});

describe("joining a team", () => {
  it("says how many tries are left only when 3 or fewer remain", async () => {
    const wrong = (attempts_left: number) => ({ data: { ok: false, error: "invalid_code", message: "That code didn't work.", attempts_left }, error: null });
    rpc.mockResolvedValueOnce(wrong(5));
    await expect(joinTeam("abcde-fghjk", "Mei")).rejects.toThrow(/^That code didn't work\.$/);
    rpc.mockResolvedValueOnce(wrong(3));
    await expect(joinTeam("abcde-fghjk", "Mei")).rejects.toThrow("That code didn't work. 3 tries left this hour.");
    rpc.mockResolvedValueOnce(wrong(1));
    await expect(joinTeam("abcde-fghjk", "Mei")).rejects.toThrow("That code didn't work. 1 try left this hour.");
    // the code goes to the server as the server stores it
    expect(rpc).toHaveBeenCalledWith("cs_join_team", { p_code: "ABCDEFGHJK", p_display_name: "Mei" });
  });

  it("returns the team on a good code", async () => {
    rpc.mockResolvedValueOnce({ data: { ok: true, team_id: "t9", team_name: "Lee & Co" }, error: null });
    await expect(joinTeam("ABCDEFGHJK", "")).resolves.toEqual({ teamId: "t9", teamName: "Lee & Co" });
    expect(rpc).toHaveBeenCalledWith("cs_join_team", { p_code: "ABCDEFGHJK", p_display_name: null });
  });
});
