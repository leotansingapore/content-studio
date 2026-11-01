// A server save that waits for a pause in the edits (the campaign studio's half second). `later` starts the wait
// again with the newest save; `now` sends a waiting one at once and resolves when none is in flight, for leaving the
// page and for an action that reads the saved copy. Saves go one after another, so an older one never lands last.
export function saveSoon(ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let waiting: (() => Promise<unknown>) | null = null;
  let sending: Promise<unknown> = Promise.resolve();
  const now = () => {
    clearTimeout(timer);
    const job = waiting;
    waiting = null;
    if (job) sending = sending.catch(() => undefined).then(job);
    return sending.catch(() => undefined);
  };
  return {
    later(job: () => Promise<unknown>) {
      waiting = job;
      clearTimeout(timer);
      timer = setTimeout(() => void now(), ms);
    },
    now,
  };
}
