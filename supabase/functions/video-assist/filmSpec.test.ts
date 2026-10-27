import { describe, expect, it } from "vitest";
import { BPM, filmEvents, filmWords, parseFilm, rhythmIssues, sceneStarts, type Film, type FilmCtx, type FilmScene } from "./filmSpec";

const SCREENS = ["cimg-mh2k9x01ab", "cimg-mh2k9x02cd", "cvid-mh2k9x03ef"];
const CTX: FilmCtx = { media: SCREENS, kit: { color: "#1A2B3C", palette: [{ name: "navy", hex: "#0B1F4D" }] }, length: 30 };

// a good 30 s film at 120 bpm (60 beats), already in the parser's shape: the spec's example, its burst moved to the middle
const SCENES: FilmScene[] = [
  { id: "hook", beats: 8, cut: "hard", kind: "type", words: ["Your week.", "Planned.", "In one tap."], key: 2 },
  {
    id: "app",
    beats: 16,
    cut: "flood",
    kind: "screen",
    media: "cimg-mh2k9x01ab",
    frame: "phone",
    camera: [{ beat: 0, to: "whole" }, { beat: 4, to: [0.1, 0.55, 0.8, 0.2] }, { beat: 10, to: "whole" }],
    tap: [{ beat: 3, at: [0.5, 0.62] }],
    highlight: { beat: 5, box: [0.1, 0.55, 0.8, 0.2], label: "AI coach" },
  },
  {
    id: "burst",
    beats: 8,
    kind: "montage",
    anchor: "word",
    shots: [
      { media: "cimg-mh2k9x02cd", word: "Calls" },
      { media: "cvid-mh2k9x03ef", word: "Notes" },
      { word: "Tasks" },
      { media: "cimg-mh2k9x01ab", word: "Plans" },
      { word: "Wins" },
      { word: "Done" },
    ],
  },
  {
    id: "features",
    beats: 12,
    kind: "cards",
    cards: [
      { icon: "clock", title: "Plan your week", line: "Your coach lays out the week from your goals." },
      { icon: "check", title: "Tick it off", line: "One tap marks it done." },
      { icon: "chart", title: "See your pace", line: "A chart of how the week went." },
    ],
  },
  { id: "proof", beats: 6, kind: "number", value: 12, suffix: " hrs", label: "saved a month" },
  { id: "end", beats: 10, kind: "logo", line: "Your week, planned.", cta: "activitytracker.io" },
];
const GOOD: Film = {
  v: 1,
  kind: "launch",
  product: "devtool",
  energy: "fast",
  bpm: 120,
  style: 0,
  font: "brand",
  ground: "ink",
  accent: "palette:navy",
  drop: "burst",
  scenes: SCENES,
  voice: { on: false, lines: { hook: "Your week, planned in one tap." } },
};
const copy = (): Film => JSON.parse(JSON.stringify(GOOD));
const withScene = (i: number, patch: Record<string, unknown>) => {
  const f = copy() as unknown as { scenes: Record<string, unknown>[] };
  f.scenes[i] = { ...f.scenes[i], ...patch };
  return f;
};
const problems = (raw: unknown, ctx = CTX) => {
  const r = parseFilm(raw, ctx);
  return r.ok ? [] : r.problems;
};

describe("parseFilm", () => {
  it("keeps a valid spec as it is, and gives the same answer for its own output", () => {
    expect(parseFilm(GOOD, CTX)).toEqual({ ok: true, film: GOOD, notes: [] });
    const once = parseFilm(GOOD, CTX);
    expect(once.ok && parseFilm(once.film, CTX)).toEqual(once);
  });

  it("refuses a scene kind it can't draw", () => {
    expect(problems(withScene(3, { kind: "spiral" }))).toEqual(['The scene "features" has a kind we can\'t draw ("spiral").']);
  });

  it("refuses two scenes with one id", () => {
    expect(problems(withScene(1, { id: "hook" }))).toEqual(['Two scenes are called "hook".']);
  });

  it("refuses a web address in any text but the end card's cta", () => {
    expect(problems(withScene(0, { words: ["Go to activitytracker.io now"] }))).toEqual(['The scene "hook" has a web address; only the end card\'s cta may.']);
    expect(problems(withScene(3, { cards: [{ icon: "clock", title: "Plan", line: "See https://x.co/a" }] }))).toHaveLength(1);
    expect(problems(withScene(5, { line: "www.activitytracker.io" }))).toHaveLength(1);
    expect(problems({ ...copy(), voice: { on: true, lines: { hook: "Visit activitytracker.io today" } } })).toEqual(["The voice has a web address; only the end card's cta may."]);
    expect(problems(withScene(5, { cta: "https://activitytracker.io" }))).toEqual([]);
  });

  it("refuses a Media key the brand lacks, and checks only the key's shape when no list is sent", () => {
    expect(problems(withScene(1, { media: "cimg-notmine0001" }))).toEqual(['The scene "app" uses a screen that isn\'t in the brand\'s Media.']);
    expect(problems(withScene(2, { shots: [...SCENES[2].kind === "montage" ? SCENES[2].shots : [], { media: "https://x.com/a.png", word: "Hi" }] }))).toHaveLength(1);
    expect(problems(withScene(1, { media: "cimg-notmine0001" }), { ...CTX, media: undefined })).toEqual([]);
  });

  it("refuses a hex colour outside the kit, and maps one inside it to its role", () => {
    expect(problems({ ...copy(), accent: "#ff0000" })).toEqual(["The accent colour #ff0000 isn't in the brand kit."]);
    expect(problems({ ...copy(), ground: "#ff0000" })).toEqual(["The ground colour #ff0000 isn't in the brand kit."]);
    const brand = parseFilm({ ...copy(), accent: "#1a2b3c", ground: "#1A2B3C" }, CTX);
    expect(brand.ok && [brand.film.accent, brand.film.ground]).toEqual(["brand", "brand"]);
    const navy = parseFilm({ ...copy(), accent: "#0b1f4d" }, CTX);
    expect(navy.ok && navy.film.accent).toBe("palette:navy");
  });

  it("refuses a film with no scenes, more than 10, or a drop that names no scene", () => {
    expect(problems({ ...copy(), scenes: [] })).toEqual(["The film has no scenes."]);
    expect(problems({ ...copy(), scenes: Array.from({ length: 11 }, (_, i) => ({ ...SCENES[0], id: `s${i}` })) })).toEqual(["The film has 11 scenes; 10 at most."]);
    expect(problems({ ...copy(), drop: "middle" })).toEqual(['The drop names no scene ("middle").']);
  });

  it("clamps the beats so the film lands on its length within a bar, every scene on whole beats", () => {
    const long = copy();
    long.scenes.forEach((s) => (s.beats = Math.round(s.beats * 1.4) + 0.4));
    const r = parseFilm(long, CTX);
    if (!r.ok) throw new Error(r.problems.join(" "));
    expect(r.film.scenes.reduce((n, s) => n + s.beats, 0)).toBe(60);
    expect(r.film.scenes.every((s) => Number.isInteger(s.beats) && s.beats >= 1)).toBe(true);
    // within a bar of 60 beats it is left as written
    const near = withScene(5, { beats: 13 });
    const kept = parseFilm(near, CTX);
    expect(kept.ok && kept.film.scenes[5].beats).toBe(13);
    // the same scenes at 15 s and on Quiet (92 bpm): 23 beats
    const short = parseFilm({ ...copy(), energy: "quiet" }, { ...CTX, length: 15 });
    expect(short.ok && [short.film.bpm, short.film.scenes.reduce((n, s) => n + s.beats, 0)]).toEqual([BPM.quiet, 23]);
  });

  it("trims the last holds of an edited film to 60 seconds and says so", () => {
    const r = parseFilm(withScene(5, { beats: 32 }), { ...CTX, length: undefined });
    expect(r.ok && r.notes).toEqual([]);
    const over = copy();
    over.scenes.forEach((s) => (s.beats = 30));
    const t = parseFilm(over, { ...CTX, length: undefined });
    if (!t.ok) throw new Error(t.problems.join(" "));
    expect(t.film.scenes.reduce((n, s) => n + s.beats, 0)).toBe(120);
    expect(t.film.scenes.map((s) => s.beats)).toEqual([30, 30, 30, 28, 1, 1]);
    expect(t.notes).toEqual(["Trimmed the end to keep the film to 60 seconds."]);
  });

  it("caps the words in each field", () => {
    const r = parseFilm(
      withScene(3, { cards: [{ icon: "spaceship", title: "One two three four five six seven", line: "a b c d e f g h i j k l m n o" }] }),
      CTX,
    );
    if (!r.ok) throw new Error(r.problems.join(" "));
    expect(r.film.scenes[3]).toMatchObject({ cards: [{ icon: "check", title: "One two three four five", line: "a b c d e f g h i j k l" }] });
    const t = parseFilm(withScene(0, { words: ["one two three four five six seven eight", "  ", 7] }), CTX);
    expect(t.ok && t.film.scenes[0]).toMatchObject({ words: ["one two three four five six"] });
  });

  it("keeps events inside their scene and boxes inside the picture, and reads the voice's lines as the model writes them", () => {
    const r = parseFilm(
      {
        ...withScene(1, { camera: [{ beat: 99, to: [0.9, 0.9, 0.5, 0.5] }, { beat: 2, to: [0, 0, 0, 1] }], tap: [{ beat: -3, at: [2, 0.5] }] }),
        voice: { on: true, lines: [{ scene: "hook", line: "Your week." }, { scene: "nowhere", line: "Dropped." }] },
      },
      CTX,
    );
    if (!r.ok) throw new Error(r.problems.join(" "));
    expect(r.film.scenes[1]).toMatchObject({ camera: [{ beat: 15, to: [0.9, 0.9, 0.1, 0.1] }], tap: [{ beat: 0, at: [1, 0.5] }] });
    expect(r.film.voice).toEqual({ on: true, lines: { hook: "Your week." } });
  });

  it("keeps the voice's line for a scene whose id the model wrote in capitals or with a space, as it keeps the scene", () => {
    const raw = { ...withScene(0, { id: "Hook " }), drop: "Burst", voice: { on: true, lines: [{ scene: "Hook ", line: "Your week." }, { scene: "END", line: "Planned." }] } };
    const r = parseFilm(raw, CTX);
    if (!r.ok) throw new Error(r.problems.join(" "));
    expect([r.film.scenes[0].id, r.film.drop]).toEqual(["hook", "burst"]);
    expect(r.film.voice.lines).toEqual({ hook: "Your week.", end: "Planned." });
  });
});

describe("the beat grid", () => {
  it("starts every scene on a whole beat at each energy's tempo", () => {
    expect(sceneStarts(GOOD)).toEqual([0, 8, 24, 32, 44, 50]);
    for (const energy of ["fast", "continuous", "quiet"] as const) {
      const r = parseFilm({ ...copy(), energy }, CTX);
      if (!r.ok) throw new Error(r.problems.join(" "));
      expect(r.film.bpm).toBe(BPM[energy]);
      expect(sceneStarts(r.film).every(Number.isInteger)).toBe(true);
      expect(filmEvents(r.film).every((e) => Number.isInteger(e.beat))).toBe(true);
    }
  });

  it("puts each kind's events on the beats the studio draws them", () => {
    const at = (scene: string) => filmEvents(GOOD).filter((e) => e.scene === scene).map((e) => `${e.beat} ${e.kind}`);
    expect(at("hook")).toEqual(["0 cut", "0 word", "1 word", "2 word"]);
    // beat 0's camera is the opening framing; a move stops a beat later on Fast cuts
    expect(at("app")).toEqual(["8 cut", "8 screen", "11 tap", "12 camera", "13 camera-stop", "13 highlight", "18 camera", "19 camera-stop"]);
    expect(at("burst")).toEqual(["24 cut", "24 shot", "24 drop", "25 shot", "26 shot", "27 shot", "28 shot", "29 shot"]);
    expect(at("features")).toEqual(["32 cut", "32 card", "35 card", "38 card"]);
    expect(at("proof")).toEqual(["44 cut", "44 count", "48 count-end"]);
    expect(at("end")).toEqual(["50 cut", "50 logo", "51 line", "52 cta"]);
  });

  it("finds nothing wrong with a good film", () => {
    expect(rhythmIssues(GOOD)).toEqual([]);
  });

  it("finds a first event after 3 seconds", () => {
    expect(rhythmIssues(withScene(0, { words: ["Your week."] }) as unknown as Film)).toEqual(["Nothing new happens in the first 3 seconds."]);
  });

  it("finds a stretch of 3 bars with nothing new", () => {
    expect(rhythmIssues(withScene(1, { camera: [], tap: [], highlight: undefined }) as unknown as Film)).toEqual(["Nothing happens from 0:04 to 0:12."]);
  });

  it("finds Fast cuts with no burst near the middle, and asks no burst of a quiet film", () => {
    const late = copy();
    late.scenes = [late.scenes[0], late.scenes[1], late.scenes[3], late.scenes[4], late.scenes[2], late.scenes[5]];
    expect(rhythmIssues(late)).toEqual(["There's no burst of fast cuts near the middle.", "The drop doesn't land on a bar line."]);
    expect(rhythmIssues({ ...late, energy: "quiet", drop: "features" })).toEqual([]);
  });

  it("finds a drop off the bar line", () => {
    expect(rhythmIssues({ ...GOOD, drop: "end" })).toEqual(["The drop doesn't land on a bar line."]);
  });

  it("finds a logo held under 1.5 seconds, and a film that doesn't end on it", () => {
    expect(rhythmIssues(withScene(5, { beats: 2 }) as unknown as Film)).toEqual(["The logo shows for under 1.5 seconds."]);
    expect(rhythmIssues({ ...GOOD, scenes: GOOD.scenes.slice(0, 5) })).toEqual(["The film doesn't end on the logo."]);
  });
});

describe("filmWords", () => {
  it("lists every word on screen and in the voice", () => {
    expect(filmWords(GOOD)).toEqual([
      "Your week.",
      "Planned.",
      "In one tap.",
      "AI coach",
      "Calls",
      "Notes",
      "Tasks",
      "Plans",
      "Wins",
      "Done",
      "Plan your week",
      "Your coach lays out the week from your goals.",
      "Tick it off",
      "One tap marks it done.",
      "See your pace",
      "A chart of how the week went.",
      "12 hrs saved a month",
      "Your week, planned.",
      "activitytracker.io",
      "Your week, planned in one tap.",
    ]);
  });
});
