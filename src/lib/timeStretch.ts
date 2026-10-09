// Faster speech with its pitch kept, for the fast export of a sped-up edit
// (the editor offers 1 to 1.5x; the browser's player does the same live).
// WSOLA: the output is laid down in 40 ms windows that overlap by half, each
// read from about where the speed puts it, nudged up to 10 ms either way to the
// spot whose waveform best carries on from the window before. The joins then
// line up cycle for cycle, so the voice keeps its pitch and nothing clicks.

/** Seconds a window lasts, and how far it may be nudged to line up. */
const WINDOW = 0.04;
const SEEK = 0.01;

/**
 * The channels played `speed` times faster with the pitch kept: round(length / speed)
 * samples each. Every channel takes the same windows, so stereo stays in step, and a
 * sound at input time t comes out within SEEK of t / speed.
 */
export function stretch(channels: Float32Array[], speed: number, rate: number): Float32Array<ArrayBuffer>[] {
  const len = channels[0]?.length ?? 0;
  if (speed === 1 || !len) return channels.map((c) => c.slice());
  const outLen = Math.round(len / speed);
  const hop = Math.round((rate * WINDOW) / 2);
  const n = hop * 2;
  const tol = Math.round(rate * SEEK);
  // silence either side, so a window near either end reads zeros, not out of range
  const lead = tol;
  const padded = (c: Float32Array) => {
    const p = new Float32Array(lead + len + tol + n + hop);
    p.set(c, lead);
    return p;
  };
  const xs = channels.map(padded);
  // the windows are lined up on all channels mixed down
  const mono = xs.length === 1 ? xs[0] : xs[0].map((_, i) => xs.reduce((a, x) => a + x[i], 0));
  const win = new Float32Array(n).map((_, j) => 0.5 - 0.5 * Math.cos((2 * Math.PI * j) / n));
  const out = channels.map(() => new Float32Array(outLen + n));
  const wsum = new Float32Array(outLen + n);
  // how well the stretch at c carries on from ref (the input just after the last window read), per unit of loudness
  const match = (c: number, ref: number, step: number) => {
    let dot = 0;
    let e = 1e-9;
    for (let j = 0; j < hop; j += step) {
      const v = mono[c + j];
      dot += v * mono[ref + j];
      e += v * v;
    }
    return dot / Math.sqrt(e);
  };
  let prev = -1;
  for (let k = 0; k * hop < outLen; k++) {
    const target = lead + Math.round(k * hop * speed);
    let pos = target;
    if (prev >= 0) {
      const ref = prev + hop;
      const lo = Math.max(0, target - tol);
      const hi = target + tol;
      // coarse look every 4 samples, then the exact spot around the best
      let best = target;
      let score = match(target, ref, 2);
      for (let c = lo; c <= hi; c += 4) {
        const m = match(c, ref, 2);
        if (m > score) [score, best] = [m, c];
      }
      pos = best;
      score = match(best, ref, 1);
      for (let c = Math.max(lo, best - 3); c <= Math.min(hi, best + 3); c++) {
        const m = match(c, ref, 1);
        if (m > score) [score, pos] = [m, c];
      }
    }
    const at = k * hop;
    for (let j = 0; j < n; j++) wsum[at + j] += win[j];
    xs.forEach((x, ch) => {
      const o = out[ch];
      for (let j = 0; j < n; j++) o[at + j] += win[j] * x[pos + j];
    });
    prev = pos;
  }
  return out.map((o) => {
    const r = o.subarray(0, outLen);
    for (let i = 0; i < outLen; i++) if (wsum[i] > 1e-9) r[i] /= wsum[i];
    return r.slice();
  });
}
