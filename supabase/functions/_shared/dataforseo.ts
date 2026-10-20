// DataForSEO's POST helper, moved out of market/index.ts (find-competitors) for market, competitors and
// viral-search. Secrets DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD; one task per request.

export const SINGAPORE = 2702;

/** The Basic header from DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD, or null when either is missing. */
export function dfsAuth(): string | null {
  const login = Deno.env.get("DATAFORSEO_LOGIN");
  const password = Deno.env.get("DATAFORSEO_PASSWORD");
  return login && password ? `Basic ${btoa(`${login}:${password}`)}` : null;
}

export async function dfs(path: string, task: Record<string, unknown>, auth: string, timeoutMs: number): Promise<unknown> {
  const res = await fetch(`https://api.dataforseo.com/v3/${path}`, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify([task]),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`DataForSEO answered ${res.status}`);
  return await res.json();
}
