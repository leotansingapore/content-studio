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

Every example is a **team-generic template**. Any AIA financial consultant on the team should be able to read an entry and think "I could write a version of this about my own life, my own clients, my own voice." No biographical content from any single FC's personal brand. Personalisation comes from generic-yet-specific scenarios (e.g. "a 27-year-old asked me whether topping up SA was worth it") that any FC can adapt.

### Curriculum grounding

Every entry maps to a specific concept from the First 60 Days Digital Influence module (Days 40, 41, 42) via the `curriculum_anchor` field. This way, an FC reading an example also sees the framework it instantiates ("Day 41 Idea Mine - Client Question", "Day 42 Pillar - Identity", "Day 42 Authority Post Structure", etc.).

### Where the data lives

`src/data/inspiration.json` - a flat array of 50 curated entries grounded in the Day 40/41/42 frameworks and the scripts academy taxonomy.

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
  "source": "scripts-academy | curriculum-derived | pattern-derived",
  "curriculum_anchor": "day-41:idea-mine:client-question",
  "tags": ["cpf", "young-adult", "myth-busting"]
}
```

### Source values

- `scripts-academy` - structurally aligned to a pattern in the AIA scripts academy library.
- `curriculum-derived` - structured directly from a Day 40 / 41 / 42 framework.
- `pattern-derived` - net-new pattern not specifically tied to a curriculum day.

### Curriculum anchor values

Use the named sections from Days 40/41/42. Examples:

- `day-40:reconnection-move`
- `day-40:two-prong:authority`
- `day-40:two-prong:social`
- `day-41:idea-mine:client-question`
- `day-41:idea-mine:common-mistake`
- `day-41:idea-mine:trending-news`
- `day-41:idea-mine:behind-the-scenes`
- `day-41:authority-social-cta-structure`
- `day-41:engagement:dm-to-meeting`
- `day-42:pillar:interest`
- `day-42:pillar:identity`
- `day-42:pillar:topic`
- `day-42:pillar:market`
- `day-42:authority-post-structure`

### How to add new entries

Just append to the JSON array. Constraints:

- ASCII only. No em dashes, smart quotes, or other Unicode special characters.
- Team-generic. No FC-specific biographical anchors (e.g. specific schools, employers, named life events). Personalisation comes from realistic, generic-yet-specific scenarios.
- Strip writer-tic phrases ("in plain English", "at a glance").
- No external-guru name-drops.
- Keep AIA product names. No HOLOS / MoneyBees / trainer brand refs.
- Every field must have a real value (no nulls, no empty strings).
- `id` must be unique and kebab-case.
- `curriculum_anchor` must reference an actual Day 40/41/42 section.

### v1 vs the road ahead

This is a curated v1. The future plan is to cron-scrape FC and competitor accounts via Apify Instagram + LinkedIn scrapers, run them through Claude for taxonomy classification (including curriculum anchor mapping), and append to this file as a nightly job. For now, manually appended entries are the source of truth.
