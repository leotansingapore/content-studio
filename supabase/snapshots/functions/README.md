# Edge function snapshots (reference copies, not deployed from here)

Content Studio calls these four edge functions, but they are deployed on the
shared "academy" Supabase project (`hgdbflprrficdoyxmdxe`), not from this repo.
They were downloaded on 2026-09-15 so the AI backend's prompts and logic are
versioned and reviewable alongside the app.

| Function | Live version when copied | Called from |
|---|---|---|
| `generate-social-content` | 46 | `src/pages/GeneratePage.tsx`, `src/pages/VoicePage.tsx`, `src/lib/batchGenerate.ts` |
| `generate-brand-template` | 50 | `src/pages/FadsPage.tsx` |
| `generate-collateral` | 41 | `src/pages/FadsPage.tsx` |
| `analyze-ig-creator` | 25 | `src/components/CreatorLookup.tsx`, `src/lib/creatorAnalysis.ts` |

They sit outside `supabase/functions/` on purpose, so a bulk
`supabase functions deploy` from this repo can never redeploy them.

Before changing one:

1. Confirm who owns it. The same project also serves `aia-product-compass-hub`.
2. Download the live version and diff it against the copy here; someone may
   have deployed since:
   `supabase functions download <name> --project-ref hgdbflprrficdoyxmdxe --use-api --workdir <scratch dir>`
3. Deploy it by name with the same JWT setting it has today, then update the
   copy and the version in this table.
