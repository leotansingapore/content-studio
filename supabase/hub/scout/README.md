# Hub trend scout

Researches what is trending per niche every 5 hours and writes drops into
`hub_trends` (industry-wide rows + client-adapted rows for allowlisted clients
with brand notes). Uses `claude -p` (Max plan, no API cost) and the Supabase
service role key.

## Layout

- Source of truth: this folder (`supabase/hub/scout/hub-trend-scout.mjs`).
- Deployed copy: `~/.local/bin/hub-trend-scout.mjs` (launchd cannot read
  `~/Documents` due to TCC, so the script must live outside it).
- State + env: `~/.local/state/hub-scout/` (`.env`, `scout.log`, `launchd.log`).
- launchd job: `~/Library/LaunchAgents/com.leo.hub-trend-scout.plist`,
  label `com.leo.hub-trend-scout`, StartInterval 18000.

## Env file (`~/.local/state/hub-scout/.env`, chmod 600)

```
SUPABASE_URL=https://hgdbflprrficdoyxmdxe.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service role key>
MARKET=Singapore   # optional, defaults to Singapore
```

## Reference accounts (`~/.local/state/hub-scout/reference-accounts.json`, optional)

Real local creators the research grounds itself in, grouped by a niche regex.
Regenerate the financial-advisor group from the repo's advisors.json:

```
jq '{groups: [{match: "financ|insur|advis|wealth", accounts: [.[] | select(.tier == 1 and (.platform | ascii_downcase | contains("instagram"))) | (.handle + " (" + .name + ")")] | .[0:20]}]}' \
  src/data/advisors.json > ~/.local/state/hub-scout/reference-accounts.json
```

## Deploy after editing

```
cp supabase/hub/scout/hub-trend-scout.mjs ~/.local/bin/hub-trend-scout.mjs
```

## Operate

```
node ~/.local/bin/hub-trend-scout.mjs                     # manual run
launchctl bootstrap gui/501 ~/Library/LaunchAgents/com.leo.hub-trend-scout.plist
launchctl kickstart gui/501/com.leo.hub-trend-scout       # fire now
launchctl bootout gui/501/com.leo.hub-trend-scout         # disable
tail -f ~/.local/state/hub-scout/scout.log
```

Niches come from `hub_allowlist.niche` + `hub_memberships.industry` (client or
active members). No niches = the run exits quietly. A missed run (Mac asleep)
just means the next one catches up.
