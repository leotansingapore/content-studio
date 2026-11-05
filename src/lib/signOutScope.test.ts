// Leo 6 Nov 2026: signing out ends this browser's session only. supabase-js defaults to the global scope, which also
// signed out every other device on the account, so every call must name the local scope.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [p] : [];
  });

describe("sign out", () => {
  it("ends only this device's session wherever the app signs out", () => {
    const calls = files("src").flatMap((f) => (readFileSync(f, "utf8").match(/auth\.signOut\([^)]*\)/g) ?? []).map((c) => `${f}: ${c}`));
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.filter((c) => !c.includes('scope: "local"'))).toEqual([]);
  });
});
