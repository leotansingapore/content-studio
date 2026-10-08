// How many passes Find clips makes over a recording: the LLM reads up to about
// 40 minutes of transcript at a time, so a 2-hour podcast is read in 3 passes,
// each one use of the "video-clips" cap. No imports: the editor (ClipFinder)
// reads it too, to say how many uses a find takes.

/** About this much of the recording per pass. */
export const CLIP_WINDOW = 40 * 60;
/** Each pass after the first starts this much before the last one ended, so a clip across the join is seen whole. */
export const WINDOW_OVERLAP = 90;

/** Passes over a recording this long: 1 up to about 44 minutes, 3 for 2 hours. */
export const clipPasses = (duration: number) => Math.max(1, Math.ceil(duration / CLIP_WINDOW - 0.1));
