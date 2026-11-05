// One request for every caller that asks while it runs. auth-js holds a lock around each getUser/getSession; when ~50
// places ask at page open on a slow connection, a waiter takes the lock over after 5 s and the one it took it from
// rejects with "Lock broken by another request with the 'steal' option", so that page loads with no user (QA 6 Nov:
// 2 to 5% of loads). Sharing the request removes the race, and a lost lock is asked again once.

/** auth-js's messages for a lock another request took over. */
export const lockLost = (e: unknown) => /Lock .*(broken by another request|released because another request stole)/i.test(String((e as Error | undefined)?.message ?? ""));

export function shareCall<T>(fn: () => Promise<T>): () => Promise<T> {
  let running: Promise<T> | null = null;
  return () =>
    (running ??= fn()
      .catch((e) => (lockLost(e) ? fn() : Promise.reject(e)))
      .finally(() => {
        running = null;
      }));
}
