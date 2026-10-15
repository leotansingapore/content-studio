# Your market (Discover > Your market, /market)

Leo approved 2026-10-15: `who=leo, geo=5w, scope=core`. Source: the market-loop skill (`~/.claude/skills/market-loop`), which condenses MIA (mia.ambr.io): watch the market, tag what moved, write a post from it, remember what was dismissed.

## What the adviser gets

One page. They give their name, website and who they serve (prefilled from Brand kit and Plan positioning), pick up to 5 client questions, and press **Check my market**. The digest shows three groups, each item tagged Act or Watch, with a source link and **Write a post from this**:

1. **News on your topics.** The Mentions keywords (existing list; the lookup reuses `mentions/logic.ts`), each story judged by Jev against who they serve. Repeats of one story are folded together. A keyword with at least 3 relevant stories and at least twice its average over earlier checks says "picking up".
2. **Are you in the AI answer?** For each client question, ChatGPT search's answer (DataForSEO `ai_optimization/chat_gpt/llm_scraper/live/advanced`, `force_web_search`): position (not mentioned, passing, named, cited) and the sites the answer used.
3. **Competitors doing well.** Posts in Following (already checked there) that drew at least 1.5 times their own account's average likes and comments, from accounts with 4 or more posts. No new scraping.

Dismiss hides an item for good. Writing from an item marks it Written.

## Limits (approved)

- Leo only: server allow-list `MARKET_USERS` (user ids separated by commas, or `*`), same shape as `SOCIAL_CONNECT_USERS`. Off for everyone else, nav entry hidden.
- One check a week per adviser, up to 5 questions: about USD 0.02 a check (USD 0.004 a read, measured on the AT run 2026-10-15). Enforced on the server: refuse when any `cs_ai_usage` row for `market-check` exists in the 6 UTC days before today, then `consumeUsage(market-check)` with a daily limit of 1 (atomic, so same-day races fail too). Plus `market-check-global` 20 a day on `GLOBAL_COUNTER_USER`.
- Set-up suggestions: `market-suggest` 5 a day.
- No new tables, no migration, no new dependency, no cron.

## Server: edge function `market` (JWT verified)

`index.ts` wires Supabase, DataForSEO, OpenAI and Jev; `logic.ts` holds every rule and is tested with vitest (no Deno imports).

| action | Body | Does |
|---|---|---|
| status | none | `{enabled}` for this caller; no paid call |
| suggest | name, site, audience, topics | The website goes in by name only and is never fetched (no request to an address the adviser typed). OpenAI writes up to 8 news keywords and 8 client questions. Jev keeps those a person this adviser serves would search or ask (noul at least 0.5), at most 5 each. |
| check | name, site, audience, topics, questions (at most 5), keywords (the Mentions list, at most 5), posts (at most 10) | Weekly gate first, so a refused check spends nothing. Then in parallel: one ChatGPT read per question; the news for each keyword (the same DataForSEO request and parser as `mentions`); one Jev call per news item (relevant noul, act/watch choice); one Jev same-story choice per relevant item against earlier relevant items (at most 10 candidates); one Jev act/watch per post. Returns the digest. |

Rules in `logic.ts`:
- Position: cited when a source URL's host is the adviser's site host; not mentioned when neither name nor alias is in the answer; else Jev passing or named (named when Jev is unavailable).
- Jev unavailable on a news item: kept, tagged Watch, marked unjudged. Never dropped silently.
- Relevant means noul at least 0.5 (the AT run's threshold).
- Inputs are cleaned and capped (lengths, counts, URLs) before any paid call.

## Client

- `src/lib/market.ts`: the synced key `content-studio-market-${scoped(uid)}` = `{ name, site, audience, questions[], checks[] (last 12 digests), dismissed[] (last 300 keys), written[] }`; the status cache (6 hours, like `socialConnect.ts`); pure helpers: momentum, outperforming posts, visible items, Write links.
- `src/lib/marketJob.ts`: the running check lives above the router so leaving the page does not lose it; steps reported as it goes (news, AI answers, judging).
- `src/pages/MarketPage.tsx`: set-up card when nothing is set; otherwise the digest with one primary button. A disabled button says when the next check opens.
- Write links: news uses `storyWriteUrl`; an AI-answer gap uses `idea=real-question` with the question and the cited sites in `ctx`; a competitor post uses the CreatorLookup remix wording.
- Nav: Discover > Your market, `show: marketShown`; Jump to keywords; `navRoutes.test.ts` stays green.
- Deep links (`docs/deep-links.md`): `/market?show=act|all` (default act, replace) and `/market?view=setup` (replace).

## Testing

- `supabase/functions/market/logic.test.ts`: input cleaning, weekly gate decision, DataForSEO answer parsing, position rules, relevance threshold, unjudged fallback. Each case proven to fail with its guarded line removed.
- `src/lib/market.test.ts`: momentum, outperformers, dismiss and written, Write links, storage round trip.
- Full vitest and `npm run build`; the page at 390 and 1440 with no overflow and no console errors.
- Live: one real check on the deployed function before the push is called done.

## Not in v1

Weekly automatic runs and a Monday email line (need pg_cron), competitor website change watch, other answer engines, other markets than Singapore.
