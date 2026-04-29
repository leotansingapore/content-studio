# Content Studio

Standalone social-content drafting tool for AIA financial consultants. Lifts the Content Studio screen from `aia-product-compass-hub` into its own Vite + React app, signed in with the academy Supabase.

## What it does

Pick a pillar (Interest, Identity, Topic, Market), an idea source (real client question, common mistake, news hook, etc.), a platform, a format, and a CTA style. The app calls the academy Supabase edge function `generate-social-content` with the user's authenticated session and returns a draft post.

## Stack

- Vite + React + TypeScript
- Tailwind CSS + shadcn/ui (dark mode by default)
- `@supabase/supabase-js` for auth and edge function invocation
- React Router for `/` (studio) and `/auth` (sign-in)

## Auth model (Option A)

- Uses the academy Supabase project (`hgdbflprrficdoyxmdxe`) only.
- Sign-in: email + password via `supabase.auth.signInWithPassword`.
- Session persists in this app's own localStorage (Supabase default). One sign-in per device.
- The edge function `generate-social-content` lives on the academy Supabase. This app does not redeploy it; it just calls it with the user's bearer token.

### Caveat: financial-app-only users

The full academy login flow (in `aia-product-compass-hub`) auto-provisions financial-app users into the academy Supabase via the `check-financial-eligibility` and `provision-financial-user` edge functions. This standalone app does not run that flow. So:

- If a user has only ever signed in to the financial app, they cannot sign in here yet.
- Workaround: sign in to the academy at least once first (which will auto-provision the academy user). After that, sign-in here works.

This is acceptable for v1. If too many users hit this, port `useSimplifiedAuth` over.

## Local dev

```bash
npm install
cp .env.example .env
# Fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env
npm run dev
```

App runs on http://localhost:5173.

## Build

```bash
npm run build
```

Outputs to `dist/`.

## Deploy

Vercel (auto-deployed from `main`):

```bash
vercel --prod --yes
```

Set env vars in Vercel:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## Source

Lifted from `~/Documents/New project/aia-product-compass-hub/src/pages/ContentStudio.tsx` and the shadcn primitives it imports (Card, Button, Label, Textarea, RadioGroup, Select, Toast).
