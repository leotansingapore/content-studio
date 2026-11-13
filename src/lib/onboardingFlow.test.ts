import { describe, expect, it } from "vitest";
import {
  APP_SECTIONS, colourGap, confirmLabel, distinctColours, firstOpenQuestion, flowKey, foundNetworks, hexOf, hostOf, isSerif, keptAnswers, keptNetworks, keptSaved, keptStep, mainPlatform, nextLine,
  nextSection, progressOf, QUESTIONS, readableInk, scoreOf, shouldSetUp, shownStep, SITE_SECTIONS, slideFontFor, webAddress, type Section,
} from "./onboardingFlow";
import { blankPixels, dominantColours, lightPixels } from "./logoImage";

describe("the website box", () => {
  it("takes a domain with a real ending, with or without https", () => {
    for (const ok of ["postmosis.com", "www.acme.sg", "https://acme.com.sg/about", "http://acme.io", "  acme.sg  ", "xn--80ak6aa92e.com", "my-brand.co.uk"]) expect(webAddress(ok), ok).not.toBeNull();
  });

  it("refuses what Holo refuses and anything the reader would turn away", () => {
    for (const bad of ["", "abc", "postmosis", "http://x", "a.b", "localhost:3000", "https://example", "not a url.com", "ftp://a.com", "acme.sg:8080", "user:pw@acme.sg", "-acme.sg", "acme..sg", "acme.123"]) {
      expect(webAddress(bad), bad).toBeNull();
    }
  });

  it("names the site by its host without www", () => {
    expect(hostOf("https://www.acme.sg/about")).toBe("acme.sg");
    expect(hostOf("postmosis.com")).toBe("postmosis.com");
    expect(hostOf("  not an address ")).toBe("not an address");
  });
});

describe("progress and the brand set up score", () => {
  it("fills the bar a quarter per step, then the last quarter section by section", () => {
    expect(progressOf("site", 0, 4)).toBe(20);
    expect(progressOf("work", 0, 4)).toBe(40);
    expect(progressOf("networks", 0, 4)).toBe(60);
    expect(progressOf("review", 0, 4)).toBe(75);
    expect(progressOf("review", 2, 4)).toBe(88);
    expect(progressOf("review", 4, 4)).toBe(100);
    expect(progressOf("review", 9, 4)).toBe(100);
  });

  it("leaves room for connecting and finishing when it sets up a new account's own brand", () => {
    expect(progressOf("site", 0, 4, "first")).toBe(12);
    expect(progressOf("networks", 0, 4, "first")).toBe(38);
    expect(progressOf("review", 0, 4, "first")).toBe(50);
    expect(progressOf("review", 4, 4, "first")).toBe(80);
    expect(progressOf("connect", 4, 4, "first")).toBe(88);
    expect(progressOf("finish", 4, 4, "first")).toBe(100);
    expect(confirmLabel("social", true, "Acme", false, "first")).toBe("Save my brand");
  });

  it("scores confirmed sections out of 100 and names the next one with its reach", () => {
    expect(scoreOf(0, 4)).toBe(0);
    expect(scoreOf(1, 4)).toBe(25);
    expect(scoreOf(3, 6)).toBe(50);
    expect(nextLine("identity", 0, 4, false)).toBe("Confirm brand identity to reach 25%");
    expect(nextLine("look", 1, 4, false)).toBe("Confirm visual identity to reach 50%");
    expect(nextLine("look", 1, 4, true)).toBe("Confirm visual identity to reach 50%");
    expect(nextLine(null, 4, 4, false)).toBe("All set. Create your brand when you're ready.");
    expect(nextLine(null, 4, 4, false, "first")).toBe("All set. Save your brand when you're ready.");
    expect(nextLine("products", 4, 5, true)).toBe("Confirm what you sell to reach 100%");
  });

  it("opens the first section not yet confirmed, in order", () => {
    expect(nextSection(new Set<Section>(), SITE_SECTIONS)).toBe("identity");
    expect(nextSection(new Set<Section>(["identity", "look"]), SITE_SECTIONS)).toBe("voice");
    expect(nextSection(new Set<Section>(SITE_SECTIONS), SITE_SECTIONS)).toBeNull();
    expect(nextSection(new Set<Section>(SITE_SECTIONS), APP_SECTIONS)).toBe("proof");
  });

  it("labels the last confirm as creating the brand", () => {
    expect(confirmLabel("identity", false, "Acme")).toBe("Confirm brand identity");
    expect(confirmLabel("look", false, "Acme")).toBe("Confirm visual identity");
    expect(confirmLabel("look", false, "Acme", true)).toBe("Confirm visual identity");
    expect(confirmLabel("social", true, " Acme ")).toBe("Create Acme");
    expect(confirmLabel("social", true, "  ")).toBe("Create brand");
  });
});

describe("colours", () => {
  it("reads a hex as #RRGGBB and refuses anything else", () => {
    expect(hexOf("#1f6feb")).toBe("#1F6FEB");
    expect(hexOf("abc")).toBe("#AABBCC");
    expect(hexOf(" #0F766E ")).toBe("#0F766E");
    for (const bad of ["", null, undefined, "#12", "red", "#12345g", "rgb(1,2,3)"]) expect(hexOf(bad)).toBeNull();
  });

  it("folds near twins and keeps the order", () => {
    expect(colourGap("#1555E0", "#144EEB")).toBeLessThan(60);
    expect(colourGap("#2563EB", "#7C5CF0")).toBeGreaterThan(60);
    expect(distinctColours(["#1555e0", "#144eeb", "#4c3cdd", "#7a34d5", "#4c80f0"], 4)).toEqual(["#1555E0", "#4C3CDD", "#7A34D5", "#4C80F0"]);
    expect(distinctColours(["#1555e0", "#144eeb", "#4c3cdd", "#7a34d5", "#4c80f0"], 2)).toEqual(["#1555E0", "#4C3CDD"]);
    expect(distinctColours([null, "nope", "#2563eb", "#7c5cf0", "#2563EB"], 4)).toEqual(["#2563EB", "#7C5CF0"]);
    expect(distinctColours(["#111111", "#222222", "#333333"], 2, 1)).toEqual(["#111111", "#222222"]);
  });

  it("puts dark ink on light colours and white on dark ones", () => {
    expect(readableInk("#FFE01B")).toBe("#111827");
    expect(readableInk("#1E3A8A")).toBe("#FFFFFF");
    expect(readableInk("#533AFD")).toBe("#FFFFFF");
  });
});

describe("the site's fonts as a slide look", () => {
  it("tells serif faces from sans ones", () => {
    for (const serif of ["Roboto Serif", "Playfair Display", "Merriweather", "Larken", "Self Modern", "DM Serif Display"]) expect(isSerif(serif), serif).toBe(true);
    for (const sans of ["Inter", "Geograph", "sohne-var", "Noto Sans", "PT Sans", "Montserrat"]) expect(isSerif(sans), sans).toBe(false);
  });

  it("picks Classic for a serif lead, Editorial when both are serif, Modern otherwise", () => {
    expect(slideFontFor(["Roboto Serif", "Inter"])).toBe("classic");
    expect(slideFontFor(["Inter", "Playfair Display"])).toBe("classic");
    expect(slideFontFor(["Lora", "Merriweather"])).toBe("serif");
    expect(slideFontFor(["Inter", "Montserrat"])).toBe("modern");
    expect(slideFontFor([])).toBe("modern");
    expect(slideFontFor(undefined)).toBe("modern");
  });
});

describe("the questions while it reads", () => {
  it("asks three, each with its own answers, now that where you post has its own step", () => {
    expect(QUESTIONS.map((q) => q.key)).toEqual(["cadence", "goal", "audience"]);
    for (const q of QUESTIONS) expect(q.options.length).toBeGreaterThanOrEqual(4);
  });

  it("keeps only answers it offered, and starts at the first one not given", () => {
    expect(keptAnswers({ platform: "linkedin", cadence: 3, goal: "time", audience: "parent" })).toEqual({ cadence: 3, goal: "time", audience: "parent" });
    expect(keptAnswers({ cadence: "3", goal: 7, audience: null, extra: 1 })).toEqual({});
    expect(keptAnswers(null)).toEqual({});
    expect(firstOpenQuestion({})).toBe(0);
    expect(firstOpenQuestion({ cadence: 3 })).toBe(1);
    expect(firstOpenQuestion({ cadence: 1, goal: "clients", audience: "general" })).toBe(QUESTIONS.length);
  });
});

describe("the reading steps", () => {
  it("move on a timer, hold on the last until the read is back, then all tick", () => {
    expect(shownStep(0, false, 6)).toBe(0);
    expect(shownStep(4500, false, 6)).toBe(2);
    expect(shownStep(600_000, false, 6)).toBe(5);
    expect(shownStep(100, true, 6)).toBe(6);
  });
});

describe("logo pixels", () => {
  const pixels = (list: [number, number, number, number][], repeat = 1) => {
    const out = new Uint8ClampedArray(list.length * repeat * 4);
    let i = 0;
    for (let r = 0; r < repeat; r++) for (const p of list) out.set(p, (i++) * 4);
    return out;
  };

  it("finds a logo's colours, most used first, without greys, white, black or see-through", () => {
    const data = pixels([
      ...Array(60).fill([37, 99, 235, 255]),
      ...Array(30).fill([124, 92, 240, 255]),
      ...Array(40).fill([255, 255, 255, 255]),
      ...Array(40).fill([20, 20, 20, 255]),
      ...Array(40).fill([128, 128, 128, 255]),
      ...Array(80).fill([255, 0, 0, 10]),
    ] as [number, number, number, number][]);
    expect(dominantColours(data)).toEqual(["#2563EB", "#7C5CF0"]);
  });

  it("drops a colour under 3% of the logo, and gives nothing for a black-and-white mark", () => {
    const speck = pixels([...Array(99).fill([37, 99, 235, 255]), [255, 128, 0, 255]] as [number, number, number, number][], 1);
    expect(dominantColours(speck)).toEqual(["#2563EB"]);
    expect(dominantColours(pixels([[0, 0, 0, 255], [255, 255, 255, 255]], 50))).toEqual([]);
    expect(dominantColours(new Uint8ClampedArray(0))).toEqual([]);
  });

  it("finds the colours of a logo drawn in a gradient, where no single shade covers 3%", () => {
    const steps = Array.from({ length: 200 }, (_, i) => {
      const t = i / 199;
      return [Math.round(10 + 69 * t), Math.round(26 + 153 * t), Math.round(74 + 143 * t), 255] as [number, number, number, number];
    });
    const got = dominantColours(pixels(steps, 1));
    expect(got.length).toBeGreaterThan(0);
    for (const c of got) expect(parseInt(c.slice(5, 7), 16)).toBeGreaterThan(parseInt(c.slice(1, 3), 16));
  });

  it("gives a logo the dark tile when the light tile would hide more of it, and keeps a logo with its own background on the light one", () => {
    const clear: [number, number, number, number][] = Array(300).fill([0, 0, 0, 0]);
    expect(lightPixels(pixels([...clear, ...Array(100).fill([255, 255, 255, 255])] as [number, number, number, number][]))).toBe(true);
    expect(lightPixels(pixels([...clear, ...Array(51).fill([255, 255, 255, 255]), ...Array(49).fill([37, 99, 235, 255])] as [number, number, number, number][]))).toBe(true);
    expect(lightPixels(pixels([...clear, ...Array(80).fill([250, 250, 250, 255]), ...Array(20).fill([220, 38, 38, 255])] as [number, number, number, number][]))).toBe(true);
    expect(lightPixels(pixels([...clear, ...Array(70).fill([17, 24, 39, 255]), ...Array(30).fill([37, 99, 235, 255])] as [number, number, number, number][]))).toBe(false);
    expect(lightPixels(pixels([...clear, ...Array(100).fill([37, 99, 235, 255])] as [number, number, number, number][]))).toBe(false);
    expect(lightPixels(pixels([...Array(80).fill([250, 250, 250, 255]), ...Array(20).fill([37, 99, 235, 255])] as [number, number, number, number][]))).toBe(false);
    expect(lightPixels(pixels([[0, 0, 0, 0]], 100))).toBe(false);
    expect(lightPixels(pixels([[17, 24, 39, 255]], 100))).toBe(false);
  });

  it("calls a drawing blank when almost nothing shows or one flat colour fills it all", () => {
    expect(blankPixels(pixels([[0, 0, 0, 0]], 400))).toBe(true);
    expect(blankPixels(pixels([[10, 20, 30, 255]], 400))).toBe(true);
    expect(blankPixels(pixels([...Array(300).fill([0, 0, 0, 0]), ...Array(100).fill([0, 0, 0, 255])] as [number, number, number, number][]))).toBe(false);
    expect(blankPixels(pixels([...Array(200).fill([37, 99, 235, 255]), ...Array(200).fill([255, 255, 255, 255])] as [number, number, number, number][]))).toBe(false);
  });
});

describe("where you post", () => {
  it("keeps the networks it offers, once each, in the order they were picked", () => {
    expect(keptNetworks(["tiktok", "x", "instagram", "tiktok", 3, "threads"])).toEqual(["tiktok", "instagram", "threads"]);
    expect(keptNetworks("instagram")).toEqual([]);
  });

  it("ticks the networks whose handles the read found, never X", () => {
    expect(foundNetworks({ instagram: "acme", facebook: " ", linkedin: "company/acme", x: "acme" } as Record<string, string>)).toEqual(["instagram", "linkedin"]);
  });

  it("plans for the first picked network a plan can hold", () => {
    expect(mainPlatform(["youtube", "linkedin", "instagram"])).toBe("linkedin");
    expect(mainPlatform(["threads", "youtube"])).toBeUndefined();
    expect(mainPlatform([])).toBeUndefined();
  });

  it("plans for the network the person put first, when they picked it and a plan can hold it", () => {
    expect(mainPlatform(["instagram", "linkedin"], "linkedin")).toBe("linkedin");
    expect(mainPlatform(["instagram", "linkedin"], "tiktok")).toBe("instagram");
    expect(mainPlatform(["youtube", "facebook"], "youtube")).toBe("facebook");
    expect(mainPlatform(["instagram"], null)).toBe("instagram");
  });
});

describe("who /welcome sets up", () => {
  const fresh = { savedKept: false, synced: true, onMe: true, onboarded: false, hasProfession: false, used: false, kept: false };

  it("runs for a new account on its own brand, or one that left a set-up half done", () => {
    expect(shouldSetUp(fresh)).toBe(true);
    expect(shouldSetUp({ ...fresh, hasProfession: true, used: true, kept: true })).toBe(true);
  });

  it("leaves every established account on the page it had", () => {
    expect(shouldSetUp({ ...fresh, hasProfession: true })).toBe(false);
    expect(shouldSetUp({ ...fresh, used: true })).toBe(false);
    expect(shouldSetUp({ ...fresh, onboarded: true, kept: true })).toBe(false);
    expect(shouldSetUp({ ...fresh, onMe: false })).toBe(false);
  });

  it("waits for the first cloud pull, so a device that hasn't heard from the cloud never overwrites it", () => {
    expect(shouldSetUp({ ...fresh, synced: false })).toBe(false);
    expect(shouldSetUp({ ...fresh, synced: false, kept: true })).toBe(false);
  });

  it("lets a saved set-up finish its connect and finish steps without waiting for the cloud or the open brand", () => {
    expect(shouldSetUp({ ...fresh, savedKept: true, kept: true, synced: false, onMe: false, hasProfession: true, used: true })).toBe(true);
    expect(shouldSetUp({ ...fresh, savedKept: true, kept: true, onboarded: true })).toBe(false);
    expect(keptSaved(JSON.stringify({ saved: true }))).toBe(true);
    expect(keptSaved(JSON.stringify({ saved: "yes" }))).toBe(false);
    expect(keptSaved("{bad")).toBe(false);
    expect(keptSaved(null)).toBe(false);
  });

  it("resumes on the step it was left on", () => {
    expect(keptStep(JSON.stringify({ step: "networks" }))).toBe("networks");
    expect(keptStep(JSON.stringify({ step: "nowhere" }))).toBeNull();
    expect(keptStep("{bad")).toBeNull();
    expect(keptStep(null)).toBeNull();
  });

  it("keeps the set-up under a synced key for the account", () => {
    expect(flowKey("u1")).toBe("content-studio-onboarding-u1");
  });
});
