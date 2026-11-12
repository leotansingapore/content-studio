# content-studio

## DEPLOY RULES (IMPORTANT — multiple agent sessions work this repo)

- This project is connected to Vercel Git: `git push origin main` IS the deploy.
  **Never run `vercel --prod` from your checkout** — on 2026-07-23 a CLI deploy
  from a stale checkout overwrote a newer git deploy on production. The only
  exception is a corrective redeploy after confirming your checkout is at
  `origin/main` tip.
- Always `git pull --rebase origin main` immediately before pushing; other
  sessions push frequently, plain `git push` will be rejected.
- After pushing, VERIFY the live bundle actually contains your change:
  fetch `https://consultant-content-studio.vercel.app/`, take the
  `assets/index-*.js` hash, and grep the bundle for a string you shipped.
  If an older bundle is live, a concurrent deploy clobbered you — redeploy
  from an up-to-date checkout.
- `git stash pop` conflicts leave files in "unmerged" state that silently
  block ALL commits until `git add`ed. Check `git status` before committing.

## Architecture notes

- Supabase project is the shared "academy" instance (hgdbflprrficdoyxmdxe),
  same as aia-product-compass-hub. Edge functions living there
  (`generate-brand-template`, `generate-collateral`)
  are called with the user's session token; this repo does not deploy them.
  Exception: the account audit's functions (`audit-social-account`,
  `refresh-social-audits`, `suggest-post-ideas`), plus `generate-social-content`
  (the post writer, versioned here from 28 Oct; aia-product-compass-hub's
  ContentStudio page calls it too and keeps its copy, which must not be deployed
  over this one), `idea-dump`,
  `clone-reel`, `reel-visuals`, `storyboard` and `carousel-copy`, and shared code in
  `supabase/functions/_shared/`, ARE versioned here and deployed with
  `supabase functions deploy <name> --project-ref hgdbflprrficdoyxmdxe --use-api`
  (JWT verification on). Their tables come from `supabase/hub/0NN_*.sql`,
  applied by hand. See `docs/account-audit.md`. Every AI writer takes the
  brand kit's `profession` ("What do you do?", `src/lib/profession.ts`,
  `supabase/functions/_shared/profession.ts`): none, or an adviser's, builds
  today's adviser prompt byte for byte (pinned in each function's `__pins__`).
  Reference copies of the
  unversioned functions live in `supabase/snapshots/functions/`.
- `content-studio-mcp` (Connect Claude) is the one function deployed WITHOUT
  JWT verification (`--no-verify-jwt`): Claude sends no Supabase token, the
  connection link in the URL is the credential. Links are revoked by a
  `content-studio-mcprevoked-` row that is never deleted, because the sync has
  no tombstones and re-uploads deleted keys from other devices. Never make
  revocation (or any security state) depend on deleting a synced key.
- Two public pages also run on functions deployed `--no-verify-jwt`:
  `preview-link` (/review/<token>, compliance preview links, 012) and
  `link-in-bio` (/l/<slug>, 015). Each holds the service key but may only
  call its two service_role-only SQL functions; anon has no grant on any
  table or function from 012-015. Design and caps: `docs/gap-tables-design.md`.
  `tracked-link` (019) works the same way for tracked short links: /t/<slug>
  is a vercel.json rewrite to it, and /t/report/<slug> is the public
  campaign report page. Design, caps and the visitor IP: `docs/tracked-links.md`.
- `notify` (phone alerts and the Monday results email, 016) is deployed
  `--no-verify-jwt` too: pg_cron calls it hourly with the `x-notify-secret`
  header (NOTIFY_CRON_SECRET, also in Vault as `cs_notify_cron_secret`), and
  it refuses anything without it. VAPID_KEYS holds the web push key pair; the
  public half is in `src/lib/notify.ts`. Test it with `{"dryRun": true}`.
  `social-sweep` (Zernio safety jobs: daily recount, weekly orphan sweep,
  021) is `--no-verify-jwt` the same way, with `x-social-sweep-secret`
  (SOCIAL_SWEEP_SECRET, Vault `cs_social_sweep_secret`).
- The script desk (Leo only, 033 `cs_ai_jobs`) never calls a model from Supabase: `script-desk`
  (JWT on) files each request as a job, and a worker on Leo's Mac (`scripts/script-worker/worker.mjs`, launchd
  `com.leo.script-worker`) runs it on his own Claude Code. The worker reaches `script-worker`, deployed
  `--no-verify-jwt`, with `x-script-worker-secret` (SCRIPT_WORKER_SECRET, keychain `cs-script-worker-secret`).
  Both serve NORTH_STAR_USERS' real ids only, never "*". A job holds inputs only: the reference prompts and message
  wording live in a private templates module on Leo's Mac (`~/.local/share/script-worker/templates.mjs`, its source
  outside git), never in this public repo, the database or the bundle. Don't add prompt text here. Research (/research,
  034) runs on the same worker: `ig_reels` and `ig_reel` read Instagram's public pages in headless Chromium
  (`scripts/script-worker/instagram.mjs`, 3 s apart, every read paused 6 hours at a login wall), `discover` runs
  Claude Code with web search only; reads have their own two slots and their own `research` cap.
- Connected social accounts go through Zernio (`social` function, JWT on,
  018 `cs_social_profiles`). Zernio accepts any id on the team, so every id
  from a request is checked against the caller's own Zernio profile first.
  Off unless ZERNIO_API_KEY is set and the caller is in SOCIAL_CONNECT_USERS.
  Rules, caps and secrets: `docs/zernio-connection.md`.
- Leo's posts board (/reels, moneybees-reels studio/api) is reached only through `team-board`
  (JWT on, 022 `cs_board_members`, not 011's `cs_team_members`): it sends the board BOARD_KEY plus the
  caller's role and brands, and the board decides every write. Leo invites people at /reels/team; they
  join at /join#<token>. Secrets: BOARD_KEY (same value on the moneybees-studio Vercel project),
  MB_STUDIO_URL, TEAM_OWNER_IDS, TEAM_CLAIM_DENY_IDS. Rules: `docs/team-roles.md`.
- Decisions in edge functions (classify, detect yes/no, score, rank, route,
  pick one) go through `supabase/functions/_shared/jev.ts` (TypeSafe Jev,
  pinned jev-1.13.0, TYPESAFE_API_KEY set as a secret 2026-10-08), never an
  LLM prompt or a keyword list; the LLM writes the words. Every caller works
  when Jev returns null. PEXELS_API_KEY is set for stock B-roll.
- All user data is localStorage-first under `content-studio-*` keys and
  mirrored cross-device by `src/lib/cloudSync.ts` (prefix-based). New
  persistent features MUST use the `content-studio-` key prefix or they will
  not sync.
- Nav: every page is listed once, in `src/lib/nav.ts` (SECTIONS), laid out as Fastlane's (Leo 2026-11-12, "FOLLOW
  THE USEFASTLANE LAYOUT"; `docs/nav-overhaul.md` is the map): Home, Campaigns, Studio, Brand, Competitor Radar,
  Analytics. Desktop has ONE sidebar (StudioLayout): those six, then the agent's chats with a plus (Leo) or the one
  New post button (everyone else), and one workspace card at the foot whose menu holds Settings, Help, the theme and
  Sign out. The open section's tabs are one row at the top of every page, rendered once by the shell (`SectionTabs`,
  from `sectionTabs()`): five at most (`MAX_TABS`), never a second row. Pages that do one job share a `group`: that
  tab shows an arrow when open and lists them (the picker), with `head` headings where one tab holds several kinds.
  `bare` pages (Home, the agent, North star) get no tabs; an `index` section (Settings) lists its pages as tiles at
  /settings and each page shows a way back. Filters stay on the page itself as chips. Pages must not render
  SectionTabs themselves. Phones get Home, Campaigns, Chats (Leo) or Studio, and More. The agent's chat (/agent) is
  three columns from lg (the shell gives it the whole panel). No address ever changes when a page moves: when adding
  a page, add it to a tab there, give it a one or two word `label` a stranger understands and its old names in `was`
  (Jump to searches them), and keep `src/lib/nav.test.ts` green; do not add a section or a sixth tab.
- Postmosis billing (`docs/postmosis-billing.md`): `postmosis-start` and `postmosis-webhook` are deployed WITHOUT
  JWT verification and hold the service key, `postmosis-portal` with it. All three are off until
  `POSTMOSIS_CHECKOUT_ON` and the three Stripe secrets are set. Paying never signs anyone in, and a checkout is
  attached to an existing account only when that subscription made the account or its Stripe customer is already
  on the account's row; anything else is held in `cs_held_checkouts`. An account with no `cs_subscriptions` row is
  never gated. The access rule is one file, `supabase/functions/_shared/subscription.ts`, imported by the app too;
  the server refuses a lapsed customer in `social` and in `consumeUsage` (`_shared/usageCaps.ts`).
- Theme: the studio is dark by default (Fastlane's look; Leo's default), Light, Dark or System (follows the device,
  live) per device from the account menu or the phone More sheet (`src/lib/theme.ts`, `cs-theme`). `index.html`
  darkens before first paint; public pages (/roadmap, /auth, /review, /l, /join, /t, /phone) stay light, and `theme.test.ts` keeps index.html's list equal to
  `PUBLIC_PATH`. Colour with tokens; a palette colour (`text-amber-800`, `bg-sky-50`) needs its `dark:` pair.
- Heavy pages are route-level `lazy()` in `src/App.tsx`; the `<Suspense>`
  lives around `<Outlet/>` in StudioLayout. Do NOT add a vite `manualChunks`
  object — the object form force-preloads lazy chunks.

## Testing

- `npm run build` (tsc + vite) must pass before any push.
- Academy demo logins work here: user@demo.com / demo123456.
