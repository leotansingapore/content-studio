// The app's one Supabase client shares the sign-in lookups every page makes as it opens (7e1379e1): getUser() and
// getSession() asked while one is running get that one's answer. getUser(token) asks about that token's user, so it
// must never be answered by the shared lookup of whoever is signed in on this device.
import { describe, expect, it, vi } from "vitest";

const calls = { getUser: [] as (string | undefined)[], getSession: 0 };
// each lookup waits here until the test lets every waiting one finish, so the asks overlap
let waiting: (() => void)[] = [];
const gate = () => new Promise<void>((r) => waiting.push(r));
const release = async () => {
  await Promise.resolve();
  for (const r of waiting.splice(0)) r();
};

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: {
      async getUser(jwt?: string) {
        calls.getUser.push(jwt);
        await gate();
        return { data: { user: { id: jwt ? `user-of-${jwt}` : "signed-in" } }, error: null };
      },
      async getSession() {
        calls.getSession++;
        await gate();
        return { data: { session: { user: { id: "signed-in" } } }, error: null };
      },
    },
  }),
}));

const { supabase } = await import("./supabase");

describe("the shared sign-in lookup", () => {
  it("asks once for every page that wants the signed-in user while a lookup runs", async () => {
    calls.getUser = [];
    const asks = [supabase.auth.getUser(), supabase.auth.getUser(), supabase.auth.getUser()];
    await release();
    const users = await Promise.all(asks);
    expect(calls.getUser).toEqual([undefined]);
    expect(users.map((u) => u.data.user?.id)).toEqual(["signed-in", "signed-in", "signed-in"]);
  });

  it("asks about a token's own user, never answering with the signed-in one", async () => {
    calls.getUser = [];
    const mine = supabase.auth.getUser();
    const theirs = supabase.auth.getUser("token-b");
    await release();
    const [a, b] = await Promise.all([mine, theirs]);
    expect(calls.getUser).toEqual([undefined, "token-b"]);
    expect(a.data.user?.id).toBe("signed-in");
    expect(b.data.user?.id).toBe("user-of-token-b");
  });

  it("shares the session lookup the same way", async () => {
    calls.getSession = 0;
    const asks = [supabase.auth.getSession(), supabase.auth.getSession()];
    await release();
    const [a, b] = await Promise.all(asks);
    expect(calls.getSession).toBe(1);
    expect(a).toBe(b);
  });
});
