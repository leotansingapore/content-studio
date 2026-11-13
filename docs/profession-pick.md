# Profession pick from a brand read

Status: live from 13 Nov 2026 at `PROFESSION_MIN` 0.85, set from the shadow run (18 of 30 labelled sites filled, 0 wrong; 0.6 would have named postmosis.com a freelancer at 0.80).

## What it will do

When a site read comes back, Jev picks what the brand's owner does. The pick prefills
"What you do" in Brand identity on /welcome and /brands/new (a separate work step until 13 Nov). The person still confirms it.

- One Jev choice over the six choices, plus `other`.
- It reads the same words as the audience pick: the written one-liner, the audience
  detail and the site's description.
- It asks in the same Jev call as the audience pick, so a read makes no extra call.
- It prefills only when Jev's probability for the pick is at least `PROFESSION_MIN`.
  `other`, a low probability, or no answer leaves the step empty, as today.
- A wrong prefill is worse than an empty step. The cut is set from the shadow run.

Code: `supabase/functions/brand-dna/profession.ts`, tests in `profession.test.ts`.

## The shadow run

`supabase/functions/brand-dna/profession-shadow.ts` reads the 30 sites in
`fixtures/profession-sites.json`, each labelled by hand, and writes a report.
It never deploys: `index.ts` does not import it.

```
deno run -A supabase/functions/brand-dna/profession-shadow.ts
TYPESAFE_API_KEY=... OPENAI_API_KEY=... deno run -A supabase/functions/brand-dna/profession-shadow.ts --go
```

- The first line prints the count and the cost, then stops.
- With `--go` it reads each home page, writes the one-liner as a live read does,
  and asks Jev. Without `OPENAI_API_KEY` it reads each site's description only.
- About US$0.001 for Jev, plus one OpenAI call per site.
- The report goes to `$TMPDIR/profession-shadow/profession-shadow.md` (or `--out DIR`).
  It lists wrong prefills first, then picks within 0.15 of the cut, then every site.
- Answers are cached by request, so a second run asks again only what changed.

## How it went live (13 Nov 2026)

1. Set `PROFESSION_MIN` from the report.
2. In `index.ts`, add `profession: professionAsk` to the audience call and return
   `profession: professionFrom(answers)`.
3. In `BrandSetup.tsx`, fill What you do from `dna.profession` when it is empty.
4. Deploy `brand-dna` with JWT verification on.
