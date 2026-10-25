// No sample pack in the browser: every voice and drum the score asks for falls back to its synth.
// Stands in for huashu-motion v0.3.1 (MIT) cli/lib/samples.js, Copyright (c) 2026 Huashu, licence in
// ../vendor/huashu/LICENSE, see ../vendor/huashu/NOTICE.md, which reads a recorded pack from disk:
// the same two exports score.ts reads, always empty.
export const sampler = (...args: unknown[]): null => (void args, null);
export const hit = (...args: unknown[]): null => (void args, null);
