# huashu-motion code in the launch film

Source: https://github.com/alchaincyf/huashu-motion, v0.3.1, commit 52467f9, MIT.

Its clip runtime (`runtime/clip/`) came from https://github.com/alchaincyf/huashu-art-motion, `scripts/engine/`, commit 57d6760, and is MIT under its own copyright line.

- `LICENSE` is huashu-motion's root licence, copied byte for byte ("Copyright (c) 2026 Huashu").
- `LICENSE-clip` is `runtime/clip/LICENSE`, copied byte for byte (the alchaincyf copyright line).

| Our file | Ported from | Licence |
| --- | --- | --- |
| `motion.ts` | `runtime/clip/lib/motion.js`, with `clamp` and `lerp` from `runtime/clip/lib/util.js` | `LICENSE-clip` |
| `motion.ts` (`omSpring`, `springValue`, `random`) | `OM.spring`, `OM.springValue`, `OM.random` in `runtime/om.js` | `LICENSE` |
| `icons.ts` | the `ICON` table in `runtime/clip/grammars/t2_keynote_ui.js` and `UI.icon` in `runtime/clip/lib/ui.js` | `LICENSE-clip` |
| `synth/dsp.ts` | `cli/lib/dsp.js` | `LICENSE` |
| `synth/score.ts` | `cli/lib/score.js` | `LICENSE` |
| `synth/sound.ts` | `cli/lib/sound.js`: the effects, the kits, the buses, the levels and `mixdown` | `LICENSE` |
| `synth/samples.ts` | stands in for `cli/lib/samples.js` with no sample pack | `LICENSE` |

Each of those files names its source and carries its copyright line in its header.

Our own, after huashu's method (`references/rhythm.md`, `sound.md`, `contract.md`): `timeline.ts`, `layout.ts`, `draw.ts`, `edit.ts`, `sound.ts` and `sound.worker.ts`.

Not taken: the animation library huashu's templates ship and anything in its vendor folders; the cartoon character in the clip runtime, with the two grammars and the storytime template that draw it, which are not MIT; the demo films and GIFs; the sample pack; the Kokoro and whisper models; composer mode (`composer.js`, `composed.js`); `fx.js`, used only by an opt-in mix; and the signature corner huashu's engine adds to its films.
