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
- All user data is localStorage-first under `content-studio-*` keys and
  mirrored cross-device by `src/lib/cloudSync.ts` (prefix-based). New
  persistent features MUST use the `content-studio-` key prefix or they will
  not sync.
- Merged nav: sections are grouped (Write, Pipeline, Performance, Learn,
  My Playbook) via `src/components/SectionTabs.tsx`. When adding a page, add
  it to a tab group + the `also:` list of its sidebar entry in
  `src/pages/StudioLayout.tsx` — do not add new top-level sidebar items
  without checking the grouping.
- Heavy pages are route-level `lazy()` in `src/App.tsx`; the `<Suspense>`
  lives around `<Outlet/>` in StudioLayout. Do NOT add a vite `manualChunks`
  object — the object form force-preloads lazy chunks.

## Testing

- `npm run build` (tsc + vite) must pass before any push.
- Academy demo logins work here: user@demo.com / demo123456.
