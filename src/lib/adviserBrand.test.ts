// adviserBrand: which brands keep today's adviser examples and libraries.
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: {}, SUPABASE_URL: "https://abc.supabase.co", SUPABASE_ANON_KEY: "" }));

import { adviserBrand } from "./profession";
import { addProfile, setActiveProfile } from "./profiles";
import { BRAND_KEY_PREFIX } from "./carousel";
import { brandDevice } from "@/test/brandDevice";
import { section, visiblePages } from "./nav";
import { nextAction, type DiagnosisResult } from "./diagnosis";

afterEach(() => vi.unstubAllGlobals());

describe("adviserBrand", () => {
  it("is an adviser's brand with no kit, a kit with nothing set, or the adviser chip as typed", () => {
    brandDevice("u1", null);
    expect(adviserBrand()).toBe(true);
    for (const p of [undefined, "", "Financial adviser", " financial ADVISOR "]) {
      brandDevice("u1", p);
      expect(adviserBrand()).toBe(true);
      expect(adviserBrand("u1")).toBe(true);
    }
  });

  it("is not one for any other work, read from the sign-in this device keeps when no user is given", () => {
    for (const p of ["Coach", "Real estate agent", "CPA"]) {
      brandDevice("u1", p);
      expect(adviserBrand()).toBe(false);
      expect(adviserBrand(null)).toBe(false);
      expect(adviserBrand("u1")).toBe(false);
    }
  });

  it("reads the open brand: a second brand's answer is its own", () => {
    const local = brandDevice("u1", "Financial adviser");
    const coach = addProfile("u1", "Coaching");
    local.setItem(BRAND_KEY_PREFIX + `u1~${coach.id}`, JSON.stringify({ profession: "Coach" }));
    expect(adviserBrand()).toBe(true);
    setActiveProfile("u1", coach.id);
    expect(adviserBrand()).toBe(false);
  });

  it("keeps today's screens with no sign-in on the device", () => {
    vi.stubGlobal("localStorage", undefined);
    vi.stubGlobal("window", undefined);
    expect(adviserBrand()).toBe(true);
  });
});

describe("the Singapore personal-finance libraries", () => {
  const radar = () => visiblePages(section("find").pages, "someone@example.com").map((p) => p.to);
  const ideasWeakest: DiagnosisResult = {
    overall: 10, levelLabel: "", areas: [{ id: "ideas", label: "Ideas", score: 10 }], weaknesses: [{ id: "ideas", label: "Ideas", score: 10 }], strengths: [],
  };

  it("stay in an adviser brand's nav, and its ideas mission opens Inspiration", () => {
    brandDevice("u1", "Financial adviser");
    expect(radar()).toEqual(["/swipe", "/trends", "/clone", "/inspiration", "/profiles", "/following"]);
    expect(nextAction(ideasWeakest).mission?.to).toBe("/inspiration");
  });

  it("leave any other brand's nav, and its ideas mission opens the weekly plan", () => {
    brandDevice("u1", "Coach");
    expect(radar()).toEqual(["/swipe", "/trends", "/clone", "/following"]);
    expect(nextAction(ideasWeakest).mission?.to).toBe("/plan");
  });
});
