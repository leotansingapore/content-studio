// Films for the film/ tests: a 30 s Fast cuts film that passes every rhythm rule, and a short one.
import type { Film } from "./timeline.ts";

/** 60 beats at 120 bpm: hook, app, burst (the drop), features, proof, end. */
export function goodFilm(): Film {
  return {
    v: 1,
    kind: "launch",
    product: "devtool",
    energy: "fast",
    bpm: 120,
    style: 0,
    font: "brand",
    ground: "ink",
    accent: "brand",
    drop: "burst",
    scenes: [
      { id: "hook", kind: "type", beats: 8, cut: "hard", words: ["Your week.", "Planned.", "In one tap."], key: 2 },
      {
        id: "app",
        kind: "screen",
        beats: 12,
        cut: "flood",
        media: "cimg-app1",
        frame: "phone",
        camera: [{ beat: 0, to: "whole" }, { beat: 4, to: [0.1, 0.55, 0.8, 0.2] }, { beat: 8, to: "whole" }],
        tap: [{ beat: 3, at: [0.5, 0.62] }],
        highlight: { beat: 5, box: [0.1, 0.55, 0.8, 0.2], label: "AI coach" },
      },
      {
        id: "burst",
        kind: "montage",
        beats: 8,
        cut: "hard",
        anchor: "word",
        shots: ["Calls", "Notes", "Tasks", "Leads", "Goals", "Plans", "Wins", "Done"].map((word, i) => ({ media: i % 2 ? "cimg-app2" : "cimg-app1", word })),
      },
      {
        id: "features",
        kind: "cards",
        beats: 12,
        cut: "whip",
        cards: [
          { icon: "clock", title: "Plan your week", line: "Every call and task placed for you." },
          { icon: "check", title: "Track what's done", line: "Ticks off as you go." },
          { icon: "chart", title: "See your numbers", line: "One page for the month." },
        ],
      },
      { id: "proof", kind: "number", beats: 6, value: 12, suffix: " hrs", label: "saved a month" },
      { id: "end", kind: "logo", beats: 14, line: "Your week, planned.", cta: "activitytracker.io" },
    ],
    voice: { on: false, lines: {} },
  };
}

/** 16 beats, 8 s: a hook, a short burst, the end. */
export function shortFilm(): Film {
  const f = goodFilm();
  return {
    ...f,
    drop: "burst",
    scenes: [
      { id: "hook", kind: "type", beats: 4, words: ["Your week.", "Planned."], key: 1 },
      { id: "burst", kind: "montage", beats: 4, anchor: "word", shots: [{ word: "Calls" }, { word: "Notes" }, { word: "Tasks" }, { word: "Wins" }] },
      { id: "end", kind: "logo", beats: 8, line: "Your week, planned." },
    ],
  };
}
