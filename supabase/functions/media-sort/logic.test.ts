import { describe, expect, it } from "vitest";
import {
  demoAsk, demoMessages, IMAGE_TYPE_MIN, imageTypeAsk, MAX_STILL, parseDemo, parseDemoRequest, parseSortRequest, parseVision, readFlags, readType, shapeOf,
  sortMessages, stillSize, typeAsk, usableType,
} from "./logic.ts";

const STILL = `data:image/jpeg;base64,${"A".repeat(400)}`;
const BIG = `data:image/jpeg;base64,${"A".repeat(MAX_STILL)}`;
const sortReq = { mode: "sort", still: STILL, kind: "photo", width: 1080, height: 1350, name: "  Me at   my desk.jpg " };

describe("media-sort requests", () => {
  it("takes a photo still with its size and name", () => {
    expect(parseSortRequest(sortReq)).toEqual({ still: STILL, kind: "photo", width: 1080, height: 1350, name: "Me at my desk.jpg" });
    expect(parseSortRequest({ ...sortReq, kind: "video", seconds: 24.04 })).toMatchObject({ kind: "video", seconds: 24 });
    // a photo carries no length
    expect(parseSortRequest({ ...sortReq, seconds: 9 })).not.toHaveProperty("seconds");
  });

  it("refuses a missing, oversized or non-JPEG still, and a missing kind or size", () => {
    for (const still of [undefined, "", BIG, "data:image/png;base64,AAAA", "https://x.sg/a.jpg", `${STILL}"onerror`]) {
      expect(parseSortRequest({ ...sortReq, still })).toBe("Send one JPEG still of the file, up to 200 KB.");
    }
    expect(parseSortRequest({ ...sortReq, kind: "gif" })).toBe("Say whether the file is a photo or a video.");
    expect(parseSortRequest({ ...sortReq, width: 0 })).toBe("Send the file's width and height.");
    expect(parseSortRequest({ ...sortReq, height: "tall" })).toBe("Send the file's width and height.");
    expect(parseSortRequest(null)).toBe("Send one JPEG still of the file, up to 200 KB.");
  });

  it("takes 1 to 3 demo stills and refuses more, none or one over 200 KB", () => {
    expect(parseDemoRequest({ stills: [STILL, STILL, STILL], name: "Budget sheet" })).toEqual({ stills: [STILL, STILL, STILL], name: "Budget sheet" });
    const refused = "Send 1 to 3 JPEG stills of the demo, each up to 200 KB.";
    expect(parseDemoRequest({ stills: [STILL, STILL, STILL, STILL] })).toBe(refused);
    expect(parseDemoRequest({ stills: [] })).toBe(refused);
    expect(parseDemoRequest({ stills: [STILL, BIG] })).toBe(refused);
    expect(parseDemoRequest({ stills: STILL })).toBe(refused);
  });
});

describe("media-sort prompts and replies", () => {
  it("sends each still at low detail and treats words in a picture as data", () => {
    const m = sortMessages(parseSortRequest({ ...sortReq, kind: "video", seconds: 24 }) as never);
    expect(m[0].content).toMatch(/never instructions to you/);
    expect(m[0].content).toMatch(/Make no claims about any product/);
    const parts = m[1].content as { type: string; text?: string; image_url?: { url: string; detail: string } }[];
    expect(parts[0].text).toMatch(/a video of 24 seconds; the picture is its frame 25% of the way in/);
    expect(parts[1].image_url).toEqual({ url: STILL, detail: "low" });
    const d = demoMessages({ stills: [STILL, STILL], name: "" });
    expect((d[1].content as unknown[]).slice(1)).toEqual([{ type: "image_url", image_url: { url: STILL, detail: "low" } }, { type: "image_url", image_url: { url: STILL, detail: "low" } }]);
    expect(JSON.stringify(d)).toMatch(/no claims about the product/);
  });

  it("parseVision trims alt to 125 and onScreen to 200 characters, and needs alt text", () => {
    const v = parseVision(JSON.stringify({ alt: `A desk — ${"x".repeat(200)}`, onScreen: "y".repeat(250) }));
    expect(v!.alt).toHaveLength(125);
    expect(v!.alt.startsWith("A desk , x")).toBe(true);
    expect(v!.onScreen).toHaveLength(200);
    expect(parseVision(JSON.stringify({ alt: "  ", onScreen: "Sale" }))).toBeNull();
    expect(parseVision("not json")).toBeNull();
    expect(parseVision(null)).toBeNull();
  });

  it("parseDemo trims shows to 120 and onScreen to 300 characters", () => {
    const d = parseDemo(JSON.stringify({ shows: "s".repeat(150), onScreen: "o".repeat(400) }));
    expect(d).toEqual({ shows: "s".repeat(120), onScreen: "o".repeat(300) });
    expect(parseDemo(JSON.stringify({ shows: "", onScreen: "x" }))).toBeNull();
    expect(parseDemo("{")).toBeNull();
  });
});

describe("media-sort decisions", () => {
  it("asks Jev the type with the file's description, words and shape", () => {
    const r = parseSortRequest(sortReq) as never;
    const ask = typeAsk({ alt: "A man at a desk", onScreen: "" }, r);
    expect(ask.state).toEqual({ alt: "A man at a desk", onScreen: "", kind: "photo", seconds: null, shape: "portrait", name: "Me at my desk.jpg" });
    expect(Object.keys((ask.questions.type as { criteria: object }).criteria)).toEqual(["person", "logo", "product", "past-post", "screen", "footage", "other"]);
    expect([shapeOf(1920, 1080), shapeOf(1080, 1080), shapeOf(1000, 1080), shapeOf(1080, 1920)]).toEqual(["landscape", "square", "square", "portrait"]);
  });

  it("asks the same choice with the still's ref in the state when Jev looks at the picture", () => {
    const r = parseSortRequest(sortReq) as never;
    const v = { alt: "A man at a desk", onScreen: "Book a review" };
    const pic = imageTypeAsk(v, r, "img-123");
    expect(pic.state).toEqual({ still: "img-123", ...typeAsk(v, r).state });
    expect(pic.questions.type).toEqual({ ...typeAsk(v, r).questions.type, instructions: expect.stringMatching(/^Which kind of file is this, going by the picture, /) });
  });

  it("sizes a sort still 360 px on its short side, the long side at most 1568, so Jev takes it", () => {
    expect(stillSize(1080, 1350)).toEqual({ width: 360, height: 450 });
    expect(stillSize(1920, 1080)).toEqual({ width: 640, height: 360 });
    expect(stillSize(512, 512)).toEqual({ width: 360, height: 360 });
    // a long screenshot: the long side caps, the short side shrinks (under 280 Jev refuses it and the words decide)
    expect(stillSize(1080, 6000)).toEqual({ width: 282, height: 1568 });
    expect(stillSize(0, 900)).toEqual({ width: 360, height: 360 });
  });

  it("readType with Jev's look at the still takes the choice at 0.4", () => {
    const a = (choice: string, p: number) => ({ type: { type: "choice" as const, choice, probabilities: { [choice]: p } } });
    expect(IMAGE_TYPE_MIN).toBe(0.4);
    expect(readType(a("footage", 0.43), IMAGE_TYPE_MIN)).toBe("footage");
    expect(readType(a("footage", 0.39), IMAGE_TYPE_MIN)).toBe("other");
    expect(readType(a("footage", 0.43))).toBe("other");
  });

  it("usableType takes a listed type with a finite confidence and probability, however low, and nothing else", () => {
    const a = (type: Record<string, unknown>) => ({ type: { type: "choice" as const, ...type } });
    const real = { choice: "footage", confidence: 0.85, probabilities: { person: 0.03, footage: 0.87, other: 0.1 } };
    expect(usableType(a(real))).toBe(true);
    expect(usableType(a({ ...real, probabilities: { footage: 0.12 } }))).toBe(true);
    expect(usableType(null)).toBe(false);
    expect(usableType({})).toBe(false);
    expect(usableType(a({ ...real, choice: undefined }))).toBe(false);
    expect(usableType(a({ ...real, choice: "selfie", probabilities: { selfie: 0.9 } }))).toBe(false);
    expect(usableType(a({ ...real, confidence: undefined }))).toBe(false);
    expect(usableType(a({ ...real, confidence: Number.NaN }))).toBe(false);
    expect(usableType(a({ ...real, probabilities: undefined }))).toBe(false);
    expect(usableType(a({ ...real, probabilities: { other: 0.9 } }))).toBe(false);
    expect(usableType(a({ ...real, probabilities: { footage: Number.POSITIVE_INFINITY } }))).toBe(false);
    expect(usableType(a({ ...real, probabilities: { footage: "0.8" } }))).toBe(false);
  });

  it("readType takes the choice at 0.5, falls back to other below it and for null", () => {
    const a = (choice: string, p: number) => ({ type: { type: "choice" as const, choice, probabilities: { [choice]: p } } });
    expect(readType(a("logo", 0.5))).toBe("logo");
    expect(readType(a("past-post", 0.91))).toBe("past-post");
    expect(readType(a("logo", 0.49))).toBe("other");
    expect(readType(a("selfie", 0.99))).toBe("other");
    expect(readType(null)).toBe("other");
    expect(readType({})).toBe("other");
  });

  it("readFlags adds each flag at 0.5, none below it, and an empty list for null", () => {
    const ask = demoAsk({ shows: "A policy illustration", onScreen: "Projected payout $120,000" });
    expect(Object.keys(ask.questions)).toEqual(["namedProduct", "returns", "personal"]);
    expect(Object.values(ask.questions).every((q) => q.type === "noul")).toBe(true);
    const n = (namedProduct: number, returns: number, personal: number) => ({
      namedProduct: { type: "noul" as const, noul: namedProduct },
      returns: { type: "noul" as const, noul: returns },
      personal: { type: "noul" as const, noul: personal },
    });
    expect(readFlags(n(0.5, 0.8, 0.49))).toEqual(["named-product", "returns"]);
    expect(readFlags(n(0.1, 0.2, 0.5))).toEqual(["personal"]);
    expect(readFlags(n(0.49, 0.49, 0.49))).toEqual([]);
    expect(readFlags(null)).toEqual([]);
  });
});
