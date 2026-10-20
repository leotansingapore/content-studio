# Claude, MCP and API access

`agent-mcp-api` | agent | phase 6 | status: partial | /north-star#agent-mcp-api

## Leo asked

No direct ask; from the competitor research.

## How the best do it

Fastlane's Settings has a CONNECTIONS group with "API" / "Keys, and extra content made through the API." beside "Integrations" / "Social accounts, ad accounts and your website." (notes-4, 2.17), which Leo did not open. Its developer docs at [developers.usefastlane.ai](https://developers.usefastlane.ai/) have an API section and an MCP section, though the endpoint and tool names need JavaScript to read (unverified).

![Fastlane 5:46](../../../public/north-star/fastlane/t346.webp)

Most of the field ships an MCP server now:

- Atria's server signs in with OAuth and no API key: in Claude it is Customize > Connectors > + > Add custom connector, checked by asking "List my Atria ad accounts" ([source](https://docs.tryatria.com/docs/mcp-quickstart.md)). OpusClip and Postiz sign in the same way ([OpusClip](https://help.opus.pro/api-reference/agent-setup.md), [Postiz](https://postiz.com/)).
- Writes wait for a person at OpusClip, which splits 13 read tools from 14 write tools that need approval ([source](https://help.opus.pro/api-reference/agent-setup.md)), at Planable, whose line is "Nothing publishes without a human signing off." ([source](https://releasebot.io/updates/planable)), and at Taplio, whose MCP queues drafts so "Nothing posts until the user confirms" ([source](https://taplio.com/)).
- Predis.ai's assistant reports the credit cost and balance and waits before charging ([source](https://predis.ai/mcp/)), Gethookd returns `used_credits` and `remaining_credits` on every response ([source](https://www.gethookd.ai/mcp)), and Revid.ai estimates a render's credits without an API key and offers a `--dry-run` flag ([source](https://www.revid.ai/llms.txt)).
- What sells these servers is the data behind them. Sandcastles exposes formats, hooks, competitors, outlier breakdowns and scripts, with questions free and 1 credit to analyse a new video ([source](https://www.sandcastles.ai/mcp)), while Virlo's documented prompt ranks videos by virality, keeps the top 24 and adapts the top 5 hooks into a 20 to 30 second script that cites its source ([source](https://virlo.ai/claude)).

Limits people publish: Atria 600 MCP calls a month on Core and unlimited above ([source](https://www.tryatria.com/pricing)); Buffer 1, 3 or 5 API keys and 3,000, 7,500 or 15,000 requests per 30 days by plan ([source](https://buffer.com/pricing)); Blotato 1,800 API requests an hour, with posts made through `POST /v2/posts` ([source](https://www.blotato.com/)). Predis.ai also exposes its presets as slash commands inside Claude (/carousel, /hook-variants, /reference-ad), and Blotato publishes a pack of Claude skills (post-writer, post-grader, repurpose, viral-hooks and more) ([source](https://help.blotato.com/llms.txt)).

## What we have today

- Connect Claude is live for every signed-in user at `/connect` (`src/pages/ConnectPage.tsx`, `src/lib/claudeConnect.ts`), in the Playbook tabs.
  - `Make a connection link` creates `<SUPABASE_URL>/functions/v1/content-studio-mcp/<scope>.<secret>` for the active brand. Only SHA-256 of the secret is stored, in the synced row `content-studio-mcplink-<hash>-<scope>` (`{ createdAt }`), and the link is shown once.
  - The page gives the Claude app steps ("Settings, Connectors, Add custom connector") and a Claude Code line, `claude mcp add --transport http content-studio <link>`, then three sample asks.
  - `Links in use` lists each link by date with `Turn off`, which writes a revoked row `content-studio-mcprevoked-<hash>-<scope>` and removes the link row. Only the toast's Undo (`restoreLink`) deletes the revoked row again; if a sync brings it back, the link stays off.
  - While the fresh link is on screen the page pings it (`linkIsLive`, a JSON-RPC `ping`) every 1.5 s, up to 10 times, to show `Ready.`
- The server `supabase/functions/content-studio-mcp` (deployed `--no-verify-jwt`; the link is the credential) speaks JSON-RPC over plain HTTP POST: `initialize`, `ping`, `tools/list`, `tools/call`, protocol versions 2025-06-18, 2025-03-26 and 2024-11-05, at most 20 messages a batch, 64 KB a body.
- Six tools, all pinned to the link's user and brand: `list_posts`, `get_post`, `get_calendar`, `get_results`, `get_brand`, and `add_draft`, which inserts into 20 inbox slots `content-studio-mcpdraft-claude-sNN-<scope>` that `absorbClaudeDrafts` (`src/lib/draftHistory.ts`) folds into My posts on the next open.
- The server's instructions: "Content Studio is a Singapore financial adviser's social media workspace. Read get_brand before drafting. Posts must suit MAS advertising rules: no guarantees, no 'risk-free', no promises of returns."
- `index.ts` reads only the link row's `key` (not its `data`), and its `Store` has `get(key)` and `insert(key, data)` only, with no prefix read.
- Server-side compliance rules already exist in one place: `COMPLIANCE_RULES` and `complianceIssues(text)` in `supabase/functions/_shared/socialAudit.ts`, a mirror of `COMPLIANCE_FLAGS` (ids and patterns only, no severity or message) that `socialAudit.test.ts` keeps identical to `src/lib/compliance.ts`.
- `profilesFrom(uid, rows)` in `supabase/functions/notify/logic.ts` is exported and already parses each brand's drafts, goals (with positioning) and followed accounts the way the Monday email reads them.
- Missing: anything Claude could remix from (tracked posts, competitor ads), a compliance check Claude can call, the weekly numbers, prompts (slash commands in Claude), any note of what Claude added, a daily limit (the code comment says there is no throttle), and any word that the same link works from Zapier, Make, n8n or a script.

## Build

Connect Claude is already open to everyone; the new tools, prompts and page sections ship behind `leoOnly`. The link carries a user id and no email, so the server checks it with the north-star server gate the earlier items set up, `isAllowed(Deno.env.get("NORTH_STAR_USERS"), uid)` from `supabase/functions/market/logic.ts` (the secret holds Leo's two uids, `40f07a18-...` and `13b28b1d-...`; see brand-from-website's open question if `_shared/leoOnly.ts` shipped first), and answers the new tools and prompts only for links that pass; for everyone else `tools/list` stays the six tools of today.

Files:

- `supabase/functions/content-studio-mcp/logic.ts` and `logic.test.ts`: the tools, prompts and limit below.
- `supabase/functions/content-studio-mcp/index.ts`: read the link row's `data` along with its key (for the link's name), pass a usage client to `handleRpc`, and give the store an `all(prefix)` read for the activity rows.
- No change to `supabase/functions/notify/logic.ts`: `get_week` reads the rows `profilesFrom` needs (`content-studio-profiles-<uid>` and the scope's `-drafts-`, `-goals-`, `-positioning-`, `-following-`) through the store, calls the exported `profilesFrom(uid, rows)`, and takes the profile whose id matches the link's scope (`me` when the scope is the bare uid).
- `supabase/functions/_shared/compliance.ts`: `COMPLIANCE_FLAGS`, `scanCompliance` and `hasComplianceErrors` moved out of `src/lib/compliance.ts`, which re-exports them unchanged. `_shared/socialAudit.ts` then imports the rules from there and drops its `COMPLIANCE_RULES` mirror and the test that kept the two equal. agent-skills makes this move; if this item ships first, it does.
- `src/pages/ConnectPage.tsx`, `src/lib/claudeConnect.ts`: the link name, the tools list and the API section.
- `supabase/functions/_shared/usageCaps.ts`: one cap.

### Screens and states

`/connect`, with the existing page kept as it is and three changes for Leo's sign-ins:

```
Connect Claude
Name this link  [Claude              ]   (optional)
[Make a connection link]

Your connection link            [Copy]
Claude app or claude.ai: Settings, Connectors, Add custom connector...
Claude Code: claude mcp add --transport http content-studio <link>   [Copy]

Use it from Zapier, Make, n8n or a script                          #api
curl -X POST <link> -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1,
  "method":"tools/call","params":{"name":"add_draft","arguments":{"text":"..."}}}'  [Copy]

What Claude can do                                                  #tools
list_posts      Your posts, newest first
check_post      MAS wording check on any text
...

Links in use                                                        #links
Claude       Made 19 Oct 2026     See what it added >     [Turn off]
Zapier       Made 20 Oct 2026     See what it added >     [Turn off]
```

- `Name this link`: optional text, up to 30 characters, default `Claude`, stored with the link. The list shows the name, or `Made <date>` alone for older links without one.
- `Use it from Zapier, Make, n8n or a script` shows only while a fresh link is on screen (the link is never shown again), with the curl line built from it and a `Copy` button. Under it: `Each call is JSON-RPC 2.0 over POST. Use the tool names below. 500 calls a day.`
- `What Claude can do`: one row per tool from `TOOLS` (name and a plain description written for this list), so the page and the server never disagree.
- `See what it added >` links to `/activity?view=claude` (agent-activity).
- States already on the page stay as they are: `Checking the link...`, `Ready.`, `Not live yet. It goes live once this device is online.`, and the turn-off toast with Undo.

Server, new tools (all read the link's own brand only):

- `check_post` `{ text }`: runs `scanCompliance` and returns `{ flags: [{ match, severity, message }], ok: boolean }`, where `ok` is `!hasComplianceErrors(flags)`, plus the line `Warnings only: the adviser decides. Fix every error before add_draft.` "guaranteed" alone is a `warn`, so `ok` stays true; "risk-free" is an `error`. Free.
- `get_week`: `weekReport` over the brand's posts, tracked accounts and goal for the last 7 days against the 7 before, as `{ facts: reportFacts lines, moves: weekMoves }`. No Jev call: Claude reads the moves itself. Free.
- `list_following_posts` `{ limit?: 1..30, default 15 }`: the newest posts of the accounts the brand follows (`content-studio-following-<scope>`): handle, platform, url, caption (first 600 characters), posted date and numbers, plus `new: true` for posts from the latest check. These are the sources Claude remixes from. When find-competitor-ads and find-competitor-posts ship, they add `list_competitor_ads` and `list_competitor_posts` in the same shape.
- `list_skills`: the built-in and saved skills from agent-skills (name, slash, what it does).
- `get_activity` `{ days?: 1..30, default 7 }`: the brand's activity events from agent-activity's rows, newest first, at most 100.
- `add_draft` (exists): after it saves, it also inserts an activity inbox row, so `/activity` shows `Added a draft: "<hook>"` from `Claude` with details `Through your "<link name>" link.` The event id is the draft id (`claude-<base36>`), the same id agent-activity's `absorbClaudeDrafts` log uses, so the draft shows once.

Server, prompts (MCP `prompts/list` and `prompts/get`; `initialize` adds `prompts: { listChanged: false }` to capabilities). Claude shows these as ready-made asks or slash commands, depending on the client (unverified for the Claude app; Claude Code lists MCP prompts as slash commands):

- `remix_post`, whose one argument `source` takes a link or pasted text, sends: "Read get_brand. Take the structure of this post, its hook type, beats and format, and write a new post for this adviser in their voice. Never reuse its words, brand or claims. Run check_post, fix every error, then save it with add_draft and tell me what you kept and what you changed."
- `weekly_retro`: "Call get_week. Tell me in five lines how my last 7 days went against the 7 before, then pick the one move from the list you would make this week and say why."
- `check_before_posting` (argument `id`): "Call get_post for this id, run check_post on its text, and tell me what to fix before it goes out. Do not change the post."
- One prompt per saved skill from agent-skills, named after its slash, with an `id` argument when it works on a post.

Limits and refusals:

- Each `tools/call` counts one use of a new cap `mcp-calls` (500 a day per user); `initialize`, `ping`, `tools/list` and the prompt calls do not count. Over the cap the call returns `isError` with `Content Studio's daily limit of 500 calls is used. It resets at 8am Singapore time.`; if the counter cannot be read it returns `Content Studio can't take this call for a moment. Try again shortly.` (fail closed, like every cap).
- `add_draft` keeps its 20-slot inbox and its refusal: `20 drafts from Claude are waiting. Open Content Studio once to bring them into My posts, then try again.`
- A dead or turned-off link keeps today's 404: `This connection link isn't active. Make a new one in Content Studio > Connect Claude.`
- There are no paid tools in this item: nothing through the link spends Higgsfield, ElevenLabs or OpenAI money.

### Copy

Every string above is exact. Updated server instructions: "Content Studio is a Singapore financial adviser's social media workspace. Read get_brand before drafting. When you remix someone else's post, keep its structure and write new words: never copy its wording, brand or claims. Posts must suit MAS advertising rules: no guarantees, no 'risk-free', no promises of returns, no named insurer products, no invented numbers. Run check_post before add_draft."

### Data

- The link row becomes `{ createdAt, name? }` in `content-studio-mcplink-<hash>-<scope>`; older rows without a name keep working. `ClaudeLink` in `src/lib/claudeConnect.ts` gains `name?`, `loadLinks` reads it, and `restoreLink` (Undo) writes it back.
- Activity rows from the server: insert-only `content-studio-activityin-<id>-<scope>` (agent-activity absorbs them).
- Everything else reads rows that already exist: `content-studio-drafts-`, `-following-`, `-goals-`, `-positioning-`, `-chatskills-`, `-activity-`. No table, no migration.

### AI and cost

- No model call on our side: the adviser's own Claude does the writing and the thinking, and our server only reads and saves. Each call is one Supabase function invocation and one or two row reads.
- New cap in `DAILY_LIMITS`: `"mcp-calls": 500`, commented "Tool calls through a Connect Claude link (content-studio-mcp): reads and add_draft; no paid work. Guards against a runaway Zapier loop."
- No Jev question: nothing here decides. `get_week` hands Claude the candidate moves without a pick.

### Deep links

- `/connect` stays a page with no state, now with anchors `#api`, `#tools` and `#links` read by `useScrollToHash` (`src/lib/urlState.ts`). In `docs/deep-links.md`, `/connect` shares the "(none)" row with `/home`, `/bio` and others; take it out of that row and give it a row of its own that lists the anchors.
- `See what it added` uses `links.activity({ view: "claude" })` from agent-activity.

## Done when

- [ ] On Leo's account, Claude Code with a fresh link lists the new tools and the three prompts; on another account `tools/list` returns the same six tools as before.
- [ ] Running `remix_post` on a tracked post from `list_following_posts` gives a draft in My posts that keeps the structure, passed `check_post`, and shows in `/activity` as a Claude row naming the link.
- [ ] `check_post` on "guaranteed returns, risk-free" returns two flags (`guarantee` warn, `risk-free` error) with `ok: false`, and a clean post returns no flags with `ok: true`.
- [ ] `get_week` returns the same facts as Analytics' This week card for the same brand.
- [ ] The curl line copied from `/connect` adds a draft from a terminal.
- [ ] The 501st tool call of a day returns the limit message, and a refused call saves nothing.
- [ ] Turning a named link off still kills it at once, and Undo brings it back.
- [ ] 390 px and 1440 px checked by eye on `/connect`; the curl line wraps inside its box.
- [ ] `npm run build`, the full `npx vitest run` and the function's own tests pass; the item flips in `src/data/northStar.ts`.

## Tests

`supabase/functions/content-studio-mcp/logic.test.ts` (extend, fake Store):

- `tools/list` returns 6 tools for a non-Leo link and 11 for Leo's; `initialize` advertises prompts for Leo's link only.
- `check_post` returns the guarantee flag as `warn` with its message and `ok: true`, adds the risk-free `error` and `ok: false` when both words are there, and returns no flags and `ok: true` for clean text.
- `get_week` over fake drafts, following and goals rows, for a bare-uid link and a `uid~p1` link, equals `reportFacts(weekReport(...))` and `weekMoves(...)` built from `profilesFrom` for that brand.
- `list_following_posts` respects `limit`, clips captions to 600 and marks fresh posts `new`.
- `get_activity` returns at most 100 events within `days`, newest first.
- `add_draft` inserts the inbox row and an activity inbox row with the link name.
- A cap refusal returns `isError` with the limit text and inserts nothing; an unreadable counter returns the try-again text.
- `prompts/get` for `remix_post` fills the `source` argument into the message, and an unknown prompt name returns JSON-RPC error -32602.
- `src/lib/claudeConnect.test.ts` (extend): `createLink` stores the name, clipped to 30; a row without a name loads; `restoreLink` keeps the name.

## Open questions

- OAuth sign-in in place of the link (Atria, OpusClip, Postiz) would let Claude connect without copying a secret. That is an auth change, so Leo decides; the link stays until he does.
- Read-only links (no `add_draft`) for tools Leo does not fully trust: an auth-shaped change, Leo's call.
- Paid makes from Claude (a picture, an AI video) should wait for agent-budget and agent-approvals, and then follow Predis.ai by stating the price and waiting for a yes in Content Studio; when that happens is Leo's call.
- Should the new tools go to every Connect Claude user once tested? Leo's word, "on for everyone".

## Related

agent-skills, agent-activity, agent-chat, agent-approvals, agent-budget, find-competitor-ads, find-competitor-posts, trust-compliance-check, remix-any-link, learn-weekly-report
