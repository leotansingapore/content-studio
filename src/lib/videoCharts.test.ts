import { describe, expect, it } from "vitest";
import { defaultSettings, type EditSettings, type Word } from "./videoEdit";
import { CHART, MAX_ROWS, barShares, chartAnim, chartSize, chartValue, isCompare, newChart, sanitizeCharts, shownRows, sideSpot, WIDE_MIN, type Chart } from "./videoCharts";
import { EXPORT_VERSIONS } from "./exportVersions";
import { exportSize } from "./videoEdit";
import { chartOfFigure, chartShows, chartSpot, faceCols, findFigures, motionOf } from "./videoMotion";

const rows = (...pairs: [string, string][]) => pairs.map(([label, value]) => ({ label, value }));
const chart = (s: number, r = rows(["Bank", "0.05%"], ["CPF SA", "4%"]), p: Partial<Chart> = {}): Chart => ({ id: `c${s}`, kind: "bars", title: "", rows: r, s, e: s + 1, ...p });

describe("the number in a typed value", () => {
  it("reads money, percentages and sizes for the bar's length", () => {
    expect(chartValue("0.05%")).toBe(0.05);
    expect(chartValue("CPF OA 2.5%")).toBe(2.5);
    expect(chartValue("$1,200")).toBe(1200);
    expect(chartValue("S$1.2 million")).toBe(1.2e6);
    expect(chartValue("500k")).toBe(5e5);
    expect(chartValue("$1.2M")).toBe(1.2e6);
    expect(chartValue("1.5bn")).toBe(1.5e9);
    expect(chartValue("10 months")).toBe(10);
    expect(chartValue("-2%")).toBe(-2);
  });
  it("has none in plain words", () => {
    expect(chartValue("CPF")).toBeNull();
    expect(chartValue("")).toBeNull();
  });
});

describe("bar lengths", () => {
  it("are each value over the biggest", () => {
    expect(barShares(rows(["Bank", "0.05%"], ["CPF OA", "2.5%"], ["CPF SA", "4%"]))).toEqual([0.0125, 0.625, 1]);
    expect(barShares(rows(["Now", "$500k"], ["At 65", "S$1.2 million"]))[0]).toBeCloseTo(0.4167, 3);
  });
  it("give no bar to a value with no number, zero or below", () => {
    expect(barShares(rows(["A", "n/a"], ["B", "-3%"], ["C", "0"], ["D", "6%"]))).toEqual([0, 0, 0, 1]);
    expect(barShares(rows(["A", "-1"], ["B", "none"]))).toEqual([0, 0]);
  });
});

describe("keeping charts", () => {
  it("keeps well-formed charts and cuts text to its limits", () => {
    const long = "x".repeat(100);
    const [c] = sanitizeCharts([{ id: "c1", kind: "compare", title: long, rows: [{ label: long, value: long }, { label: "B", value: "4%" }], s: 2, e: 3 }]);
    expect(c.kind).toBe("compare");
    expect(c.title).toHaveLength(40);
    expect(c.rows[0].label).toHaveLength(24);
    expect(c.rows[0].value).toHaveLength(14);
  });
  it("drops broken ones and caps rows at 5 and charts at 10", () => {
    expect(sanitizeCharts("x")).toEqual([]);
    expect(sanitizeCharts([null, { id: 1, rows: [], s: 0, e: 1 }, { id: "a", rows: [], s: 2, e: 1 }, { id: "b", rows: [], s: -1, e: 1 }, { id: "c", s: 0, e: 1 }])).toEqual([]);
    const [c] = sanitizeCharts([{ id: "c", kind: "pie", rows: Array(8).fill({ label: "A", value: "1" }).concat([5]), s: 0, e: 1 }]);
    expect(c.kind).toBe("bars");
    expect(c.rows).toHaveLength(MAX_ROWS);
    expect(sanitizeCharts(Array(12).fill(chart(1)))).toHaveLength(10);
  });
  it("shows only rows with something in them, and two numbers only with exactly two", () => {
    const c = chart(0, rows(["Bank", "0.05%"], ["", ""], ["CPF", "4%"]), { kind: "compare" });
    expect(shownRows(c)).toHaveLength(2);
    expect(isCompare(c)).toBe(true);
    expect(isCompare({ ...c, rows: [...c.rows, { label: "SRS", value: "" }] })).toBe(false);
  });
  it("starts a new chart with two empty rows as bars", () => {
    const c = newChart(3.456, 3.2);
    expect([c.kind, c.rows, c.s, c.e]).toEqual(["bars", rows(["", ""], ["", ""]), 3.46, 3.56]);
  });
});

describe("a chart from a figure said in the video", () => {
  const said = (text: string): Word[] => text.split(" ").map((w, i) => ({ w, s: i * 0.5, e: i * 0.5 + 0.4 }));
  it("puts the figure as said in the first row and leaves a row to fill in, on the figure's words", () => {
    const words = said("Your SA earns 4 percent a year.");
    const c = chartOfFigure(findFigures(words)[0], words);
    expect([c.kind, c.rows, c.s, c.e]).toEqual(["compare", rows(["a year", "4%"], ["", ""]), 1.5, 2.4]);
  });
});

describe("charts on the edit", () => {
  const segs = [{ start: 0, end: 30 }];
  it("come in a beat before their line and stay 4 s", () => {
    expect(chartShows([chart(10)], segs, 1, 30, 0).map((c) => [c.from, c.to])).toEqual([[9.7, 13.7]]);
  });
  it("follow the cuts and the speed, and are dropped when their line is cut out", () => {
    const cut = [{ start: 0, end: 5 }, { start: 8, end: 30 }];
    expect(chartShows([chart(10)], cut, 1, 27, 0)[0].from).toBeCloseTo(6.7);
    expect(chartShows([chart(10)], segs, 2, 15, 0)[0].from).toBeCloseTo(4.7);
    expect(chartShows([chart(6)], cut, 1, 27, 0)).toEqual([]);
  });
  it("wait for the hook card, and need 2 s before the end", () => {
    expect(chartShows([chart(1)], segs, 1, 30, 3)[0].from).toBe(3);
    expect(chartShows([chart(28.5)], segs, 1, 30, 0)).toEqual([]);
    expect(chartShows([chart(27)], segs, 1, 30, 0)[0].to).toBe(30);
  });
  it("show one at a time: a later chart cuts the earlier short, unless that leaves it under 2 s", () => {
    expect(chartShows([chart(13), chart(10)], segs, 1, 30, 0).map((c) => [c.chart.s, c.from, c.to])).toEqual([[10, 9.7, 12.7], [13, 12.7, 16.7]]);
    expect(chartShows([chart(10), chart(11)], segs, 1, 30, 0).map((c) => c.chart.s)).toEqual([10]);
  });
  it("skip a chart with nothing typed in it", () => {
    expect(chartShows([chart(10, rows(["", ""], ["  ", ""]))], segs, 1, 30, 0)).toEqual([]);
  });
});

describe("charts with the other motion", () => {
  const segs = [{ start: 0, end: 30 }];
  const words: Word[] = [{ w: "only", s: 9.6, e: 10 }, { w: "$500.", s: 10, e: 10.6 }, { w: "Then", s: 20, e: 20.3 }, { w: "4%.", s: 20.3, e: 20.8 }];
  const s = (p: Partial<EditSettings>): EditSettings => ({ ...defaultSettings("bold"), numberCards: true, sfx: true, ...p });
  const caps = [{ words, s: 9.6, e: 20.8 }];
  it("take the place of a number card that would show at the same time, and whoosh in", () => {
    const m = motionOf(s({ charts: [chart(10)] }), segs, caps, 30);
    expect(m.charts.map((c) => c.from)).toEqual([9.7]);
    expect(m.cards.map((c) => c.fig.value)).toEqual([4]);
    expect(m.cues.map((c) => c.at)).toEqual([9.7, 19.8]);
  });
  it("are read through the same checks as stored settings", () => {
    expect(motionOf(s({ charts: [{ id: "x" }] as unknown as Chart[] }), segs, caps, 30).charts).toEqual([]);
  });
});

describe("the chart's animation", () => {
  it("fades and rises in over 0.25 s, then each bar grows in turn, and fades over its last 0.25 s", () => {
    const at = (t: number) => chartAnim(10, 14, 10 + t, 3);
    expect(at(0)).toEqual({ alpha: 0, rise: 0, bars: [0, 0, 0] });
    expect(at(CHART.arrive).rise).toBe(1);
    expect(at(CHART.arrive).bars).toEqual([0, 0, 0]);
    const mid = at(CHART.arrive + CHART.stagger);
    expect(mid.bars[0]).toBeGreaterThan(0);
    expect(mid.bars[1]).toBeCloseTo(0);
    expect(at(CHART.arrive + 2 * CHART.stagger + CHART.grow).bars).toEqual([1, 1, 1]);
    expect(at(2).alpha).toBe(1);
    expect(at(3.875).alpha).toBeCloseTo(0.5);
  });
});

describe("the chart's size and place", () => {
  it("grows with its rows and its title", () => {
    const two = chartSize(chart(0), 1);
    const five = chartSize(chart(0, rows(["a", "1"], ["b", "2"], ["c", "3"], ["d", "4"], ["e", "5"])), 1);
    expect(two.w).toBe(900);
    expect(five.h - two.h).toBe(3 * (64 + 18));
    expect(chartSize(chart(0, undefined, { title: "Interest a year" }), 1).h).toBeGreaterThan(two.h);
    expect(chartSize(chart(0, undefined, { kind: "compare" }), 2).w).toBe(1520);
  });
  it("goes beside the face on a wide frame, on the side with more room, above the captions", () => {
    const r = sideSpot(1920, 1080, 900, 400, [0.2, 0.45], [0.8, 0.9]);
    expect(r.x).toBeGreaterThan(1920 * 0.45 + (900 * r.scale) / 2);
    expect(r.top + 400 * r.scale).toBeLessThanOrEqual(0.78 * 1080 + 0.01);
    expect(sideSpot(1920, 1080, 900, 900, [0.2, 0.45], [0.1, 0.2]).top).toBeGreaterThanOrEqual(0.22 * 1080);
    const l = sideSpot(1920, 1080, 900, 400, [0.55, 0.8], null);
    expect(l.x + (900 * l.scale) / 2).toBeLessThan(0.55 * 1920);
  });
  it("shrinks to fit the room beside a big face, never under half size", () => {
    const r = sideSpot(1920, 1080, 900, 400, [0.3, 0.7], null);
    expect(r.scale).toBeLessThan(1);
    const [a, b] = [r.x - (900 * r.scale) / 2, r.x + (900 * r.scale) / 2];
    expect(a >= 0.7 * 1920 || b <= 0.3 * 1920).toBe(true);
    expect(sideSpot(1920, 1080, 900, 400, [0.1, 0.9], null).scale).toBe(0.5);
  });
  it("on a wide frame the card is narrower and never smaller than WIDE_MIN, beside a centred face", () => {
    expect(chartSize(chart(0), 1, true).w).toBe(760);
    expect(chartSize(chart(0), 1).w).toBe(900);
    const { w, h } = chartSize(chart(0), 1, true);
    const r = sideSpot(1920, 1080, w, h, [0.4, 0.6], [0.8, 0.9], WIDE_MIN);
    expect(r.scale).toBeGreaterThanOrEqual(WIDE_MIN);
    expect(r.fits).toBe(true);
    expect(r.x - (w * r.scale) / 2 >= 0.6 * 1920 || r.x + (w * r.scale) / 2 <= 0.4 * 1920).toBe(true);
    // a face too wide for a readable card beside it: the card keeps its size, the face is no reason to shrink it
    expect(sideSpot(1920, 1080, w, h, [0.2, 0.8], null, WIDE_MIN)).toMatchObject({ scale: 0.8, fits: false });
  });
  it("finds the face's columns on a wide frame: in the middle on blur, where the crop puts it on fill", () => {
    const box = { x0: 0.4, y0: 0.2, x1: 0.6, y1: 0.4 };
    const blur = faceCols(box, { fit: "blur", focusX: 0.5 }, 1920, 1080, 1080, 1920)!;
    expect((blur[0] + blur[1]) / 2).toBeCloseTo(0.5);
    expect(blur[1] - blur[0]).toBeCloseTo((0.2 * 1080 * (1080 / 1920)) / 1920);
    const fill = faceCols({ ...box, x0: 0.1, x1: 0.3 }, { fit: "fill", focusX: 0.5 }, 1920, 1080, 1920, 1080)!;
    expect(fill[0]).toBeCloseTo(0.1);
    expect(faceCols(null, { fit: "fill", focusX: 0.5 }, 1920, 1080, 1, 1)).toBeNull();
  });
  it("on a tall frame goes clear of the head and the captions, full size when it fits", () => {
    const r = chartSpot(1080, 1920, 900, 400, { head: [0.1, 0.45], core: [0.2, 0.45], cols: [0.3, 0.7] }, [0.7, 0.8]);
    expect([r.x, r.top, r.scale]).toEqual([540, expect.closeTo(0.47 * 1920), 1]);
  });
  it("else beside the face when half a card fits there", () => {
    const r = chartSpot(1080, 1080, 900, 400, { head: [0.04, 0.9], core: [0.3, 0.9], cols: [0.6, 0.9] }, [0.75, 0.85]);
    expect(r.scale).toBeGreaterThanOrEqual(0.5);
    expect(r.x + (900 * r.scale) / 2).toBeLessThan(0.6 * 1080);
  });
  it("else over the hair but clear of the face from the forehead down, then 70% at the top", () => {
    const face = { head: [0.05, 0.62] as [number, number], core: [0.3, 0.62] as [number, number], cols: [0.2, 0.8] as [number, number] };
    expect(chartSpot(1080, 1920, 900, 400, face, [0.64, 0.76])).toEqual({ x: 540, top: 0.12 * 1920, scale: 0.85 });
    expect(chartSpot(1080, 1920, 900, 400, { ...face, core: [0.15, 0.62] }, [0.64, 0.76])).toEqual({ x: 540, top: 0.12 * 1920, scale: 0.7 });
  });
});

describe("the chart in every size of the multi-size export", () => {
  const five = chart(0, rows(["a", "1"], ["b", "2"], ["c", "3"], ["d", "4"], ["e", "5"]), { title: "Interest a year" });
  const cases = [chart(0), five, chart(0, undefined, { kind: "compare" })];
  for (const v of EXPORT_VERSIONS) {
    it(`${v.label}: whole in the frame, off the captions, and off the face`, () => {
      const { w: W, h: H } = exportSize({ aspect: v.aspect, exportFor: v.exportFor, exportAs: "video" }, 30, 1080, 1920);
      const u = Math.min(W, H) / 1080;
      // a talking head in the middle of the frame, captions in the lower third
      const head: [number, number] = [0.1, 0.4];
      const cap: [number, number] = [0.68, 0.8];
      const cols: [number, number] = W > H ? [0.4, 0.6] : [0.25, 0.75];
      for (const c of cases) {
        const { w, h } = chartSize(c, u, W > H);
        const r = W > H ? sideSpot(W, H, w, h, cols, cap, WIDE_MIN) : chartSpot(W, H, w, h, { head, core: [0.16, 0.4], cols }, cap);
        const [l, rt, t, b] = [r.x - (w * r.scale) / 2, r.x + (w * r.scale) / 2, r.top, r.top + h * r.scale];
        expect([l >= 0, rt <= W, t >= 0, b <= H]).toEqual([true, true, true, true]);
        // readable: half size on a tall or square frame, WIDE_MIN on a wide one, where the same pixels are a smaller share of the width
        expect(r.scale).toBeGreaterThanOrEqual(W > H ? 0.8 : 0.5);
        expect(r.scale * 44 * u / W).toBeGreaterThanOrEqual(W > H ? 0.017 : 0.02);
        expect(b <= cap[0] * H + 0.5 || t >= cap[1] * H - 0.5).toBe(true);
        const clearOfHead = b <= head[0] * H + 0.5 || t >= head[1] * H - 0.5;
        const besideFace = rt <= cols[0] * W + 0.5 || l >= cols[1] * W - 0.5;
        expect([c.title || c.kind, r, clearOfHead || besideFace]).toEqual([c.title || c.kind, r, true]);
      }
    });
  }
});

