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
  (`generate-social-content`, `generate-brand-template`, `generate-collateral`)
  are called with the user's session token; this repo does not deploy them.
  Exception: the account audit's functions (`audit-social-account`,
  `refresh-social-audits`, `suggest-post-ideas`), plus `idea-dump`,
  `clone-reel`, `reel-visuals`, `storyboard` and `carousel-copy`, and shared code in
  `supabase/functions/_shared/`, ARE versioned here and deployed with
  `supabase functions deploy <name> --project-ref hgdbflprrficdoyxmdxe --use-api`
  (JWT verification on). Their tables come from `supabase/hub/0NN_*.sql`,
  applied by hand. See `docs/account-audit.md`. Reference copies of the
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
- `notify` (phone alerts and the Monday results email, 016) is deployed
  `--no-verify-jwt` too: pg_cron calls it hourly with the `x-notify-secret`
  header (NOTIFY_CRON_SECRET, also in Vault as `cs_notify_cron_secret`), and
  it refuses anything without it. VAPID_KEYS holds the web push key pair; the
  public half is in `src/lib/notify.ts`. Test it with `{"dryRun": true}`.
- Connected social accounts go through Zernio (`social` function, JWT on,
  018 `cs_social_profiles`). Zernio accepts any id on the team, so every id
  from a request is checked against the caller's own Zernio profile first.
  Off unless ZERNIO_API_KEY is set and the caller is in SOCIAL_CONNECT_USERS.
  Rules, caps and secrets: `docs/zernio-connection.md`.
- Decisions in edge functions (classify, detect yes/no, score, rank, route,
  pick one) go through `supabase/functions/_shared/jev.ts` (TypeSafe Jev,
  pinned jev-1.13.0, TYPESAFE_API_KEY set as a secret 2026-10-08), never an
  LLM prompt or a keyword list; the LLM writes the words. Every caller works
  when Jev returns null. PEXELS_API_KEY is set for stock B-roll.
- All user data is localStorage-first under `content-studio-*` keys and
  mirrored cross-device by `src/lib/cloudSync.ts` (prefix-based). New
  persistent features MUST use the `content-studio-` key prefix or they will
  not sync.
- Nav: every page is listed once, in `src/lib/nav.ts` (SECTIONS). Desktop
  has two rails (rail 1 = sections, rail 2 = the open section's pages);
  phones get the bottom bar, the More sheet and, for `tabbed` sections,
  `SectionTabs` on the page (hidden from lg up, where rail 2 does that job).
  When adding a page, add it to a section there and keep `src/lib/nav.test.ts`
  green; do not add a new section without checking the grouping.
- Heavy pages are route-level `lazy()` in `src/App.tsx`; the `<Suspense>`
  lives around `<Outlet/>` in StudioLayout. Do NOT add a vite `manualChunks`
  object — the object form force-preloads lazy chunks.

## Testing

- `npm run build` (tsc + vite) must pass before any push.
- Academy demo logins work here: user@demo.com / demo123456.
