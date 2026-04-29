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

## Inspiration data

The Inspiration tab in the studio shows curated FC content examples. New FCs use these as starting vibes by clicking "Use as vibe", which pre-fills the generation form with that example's pillar, audience, topic, platform, and adds a hidden style reference into the generation prompt.

### Where the data lives

`src/data/inspiration.json` - a flat array of 50 curated entries pulled from Leo's brand corpus (Obsidian vault), the AIA scripts academy library, and pattern-derived posts based on the script-academy synthesis taxonomy.

### Entry shape

```json
{
  "id": "linkedin-cpf-myth-young-adult-001",
  "platform": "linkedin | instagram | facebook",
  "format": "text-only | carousel | short-video",
  "pillar": "Authority | Social | Tip | Hook | CTA",
  "audience": "young-adult | working-adult | pre-retiree | parent | general",
  "topic": "free-form short topic, e.g. CPF SA top-up at 32",
  "hook": "first 1-2 lines that stop the scroll",
  "content": "full post body, ASCII only, no em dashes or smart quotes",
  "why_it_works": "one-sentence structural reason it performs",
  "source": "leo-brand-corpus | scripts-academy | competitor-scrape | pattern-derived",
  "tags": ["cpf", "young-adult", "myth-busting"]
}
```

### How to add new entries

Just append to the JSON array. Constraints:

- ASCII only. No em dashes, smart quotes, or other Unicode special characters.
- Strip writer-tic phrases ("in plain English", "at a glance").
- No external-guru name-drops (Hormozi, Jeb Blount, etc.).
- Keep AIA product names. No HOLOS / MoneyBees / trainer brand refs.
- Every field must have a real value (no nulls, no empty strings).
- `id` must be unique and kebab-case.

### v1 vs the road ahead

This is a curated v1. The future plan is to cron-scrape Leo's high-performing posts plus competitor accounts (Wilfred Wong, Bryan Ching, Daniel Heng, etc.) via Apify Instagram + LinkedIn scrapers, run them through Claude for taxonomy classification, and append to this file as a nightly job. For now, manually appended entries are the source of truth.
