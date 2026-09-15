# Account audit

**Your account audit** on `/analytics` reads a consultant's last 30 public
Instagram or TikTok posts. It rates each post against the account's own usual
numbers and lists what to double down on, fix and stop, citing the posts
behind each point. The best posts get a **Remix this** button that opens Write
with the post's idea.

- **Page:** [`src/components/AccountAudit.tsx`](../src/components/AccountAudit.tsx), shown on
  [`AnalyticsPage.tsx`](../src/pages/AnalyticsPage.tsx); client calls in
  [`src/lib/accountAudit.ts`](../src/lib/accountAudit.ts)
- **Judging logic (tested):** [`supabase/functions/_shared/socialAudit.ts`](../supabase/functions/_shared/socialAudit.ts)
- **Scrape, advice and writes:** [`supabase/functions/_shared/auditRunner.ts`](../supabase/functions/_shared/auditRunner.ts)
- **Edge functions:** `audit-social-account` (signed-in users) and
  `refresh-social-audits` (weekly job)
- **Tables and schedule:** [`supabase/hub/005_social_audits.sql`](../supabase/hub/005_social_audits.sql)

## How it works

1. The handles come from **Your accounts** on the same page, one per platform.
   Auditing a new handle replaces the old audit for that platform.
2. Opening Analytics calls `audit-social-account`, which returns the saved
   audit. It starts a refresh in the background when:
   - the audit has never run;
   - it is 20 or more hours old;
   - the last attempt failed more than 2 minutes ago;
   - the advice failed and 10 minutes have passed.

   The page re-reads the row every 5 seconds until the refresh finishes.
3. **The refresh reads the account.**
   - Instagram: `apify~instagram-profile-scraper` for followers, and
     `apify~instagram-post-scraper` (30 posts, `detailedData` for plays).
   - TikTok: `clockworks~tiktok-scraper` with `profiles` (30 latest videos).
4. **Every post gets a ratio:** its views ÷ the account's median views. Instagram
   photos and carousels have no public views, so they are compared on likes +
   comments ÷ the median for those posts. Posts under 48 hours old are not
   judged.
5. **OpenAI (`gpt-4.1`) writes the advice as JSON.** The validator only keeps
   points that:
   - cite post ids that exist;
   - pass the rules in `src/lib/compliance.ts`, mirrored in `socialAudit.ts`
     with a test that keeps the two identical;
   - fit the caps on count and length.

   Numbers always come from the scrape, never the model.
6. Each successful refresh adds a row to `cs_social_snapshots`, which powers the
   "Since Sep 8: followers +120" line.
7. pg_cron job `refresh-social-audits-hourly` calls `refresh-social-audits`.
   Each call refreshes up to 3 audits that are 6.5 or more days old and were
   opened in the last 30 days. A failed weekly refresh waits a day before
   retrying.

## Post ideas in your style

Under the advice, **Get 5 post ideas** calls `suggest-post-ideas` with the
audit id. The function:

1. Sends OpenAI (`gpt-4.1`, temperature 0.9) four things:
   - the account's best posts, with ratios and captions;
   - the posts that fell flat;
   - the first line of every other post;
   - every idea already suggested for this audit, with skipped ones marked.
2. Asks for 8 ideas and a one-sentence "winning formula". Each idea is a new
   topic in their winning style, or a clear twist on a winning topic.
3. Drops ideas that:
   - trip the compliance rules;
   - share half or more of their content words with a past idea, an existing
     post's first line, or an earlier idea in the same batch (`postIdeas.ts`).

   If fewer than 5 survive, it makes one more call.
4. Stores the batch in `cs_social_ideas` and returns it.

**5 different ideas** repeats this, so a new batch never repeats an earlier one.
**Skip** marks an idea `dismissed`, and the next prompt tells the model those
missed the mark. **Write this** marks it `used` and opens Write with the hook
and brief. Limit: 100 ideas per user per day.

## Limits and cost

- 6 refreshes per user per 24 hours, counted in `cs_social_audit_runs`.
- About US$0.05 of Apify for an Instagram refresh and US$0.09 for TikTok, plus
  one `gpt-4.1` call.
- Public numbers only. Reach, Instagram saves, watch time and audience data need
  Instagram Login or TikTok Login Kit, which require each platform's app review.

## Tables

| Table | What it holds | Who can read it |
| --- | --- | --- |
| `cs_social_audits` | One row per user, platform and handle: profile, rated posts, stats, advice, status | Owner (can also delete) |
| `cs_social_snapshots` | Summary numbers per successful refresh | Owner |
| `cs_social_audit_runs` | Every refresh started, for the daily cap | Service role only |

Only the edge functions write, using the service role.

## Deploying

```bash
supabase functions deploy audit-social-account --project-ref hgdbflprrficdoyxmdxe --use-api
supabase functions deploy refresh-social-audits --project-ref hgdbflprrficdoyxmdxe --use-api --no-verify-jwt
```

Secrets:
- `APIFY_API_KEY` and `OPENAI_API_KEY`, already set for other functions.
- `AUDIT_REFRESH_SECRET`: a random value. Store the same value in Vault as
  `cs_audit_refresh_secret`, where the cron job reads it.

Apply the SQL file once. It is safe to re-run.
