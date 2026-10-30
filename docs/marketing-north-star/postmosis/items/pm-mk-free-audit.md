# A free audit of a public Instagram or TikTok profile ends with a walkthrough offer

Status: todo
App Postmosis (postmosis.com), owner Claude, phase 3 (Reach that compounds).

## Why

Taplio's free tools hub has 12 tools, among them one that turns a LinkedIn profile into ready-to-post drafts and a profile feedback tool (taplio.com/free-tools). AuthoredUp has 13 free tools that need no sign-up, one of them a hiring post audit (authoredup.com/tools). Both are in research/teardown.md, move 12.

An audit is the free tool closest to a sale, because it ends with what to fix, and Leo can fix it with them on a walkthrough.

## What we have today

Checked 30 Oct 2026 against content-studio origin/main (268438fe), ~/postmosis-site origin/main (2b81272) and the vault.

- The account audit runs for signed-in customers only. audit-social-account is deployed with JWT verification (its index.ts header, CLAUDE.md). It reads the last 30 posts of a public Instagram or TikTok account and gives double down, fix and stop advice with a profile score (product-truth.md).
- Each refresh costs about US$0.05 of Apify for Instagram and US$0.09 for TikTok, plus one gpt-4.1 call, with 6 refreshes per user per day (docs/account-audit.md).
- Its advice and profile score follow the brand's profession since 28 Oct (product-truth.md, "Shipped 28 Oct").
- postmosis.com has /features/social-media-audit and 9 browser tools, none of which calls a paid API (pm-seo-free-tools in the SEO book).
- Standing rule for a public endpoint that spends money: it ships default off, behind a flag, with caps in the database and a bot check (memory public-email-endpoint-default-off).

## What to do

1. Stop and ask Leo (dec-pm-free-audit): open a free public audit that costs a data call per run? Recommended: yes, default off at first, 20 runs a day, behind a bot check. It also needs a caps table, which is a schema change, and a bot check from a third party.
2. If yes: a new function, public-profile-audit, deployed --no-verify-jwt behind a flag that is off by default. It reuses _shared/socialAudit.ts and auditRunner.ts, reads fewer posts to cut the cost, and returns three findings only.
3. Caps in a new table from supabase/hub/0NN_public_audit.sql with its .test.sql: a global daily cap of 20 runs and one run per visitor per day by a hashed IP. Reviewed, then applied by hand with Leo's yes.
4. Claude builds /tools/profile-audit through the site's tools pipeline: a handle box, a network pick, the three findings, then a link to go through the rest with Leo, carrying ref=tools-profile-audit. Gates: the brief first, hook-check for the H1, aicheck under 15, brief-check.
5. Unit tests for the flag (off answers 503) and both caps. Nothing that spends money runs in a test. The first live run is on Leo's own account, with him watching.
6. Leo turns the flag on. After the first week Claude reports runs, spend (runs times the per-run cost above) and bookings with ref=tools-profile-audit.

## Done when

- Leo's answer is in dec-pm-free-audit's decided field.
- If yes: /tools/profile-audit is live, the function refuses with the flag off, the caps hold in tests, and a live run shows three findings and the walkthrough link.
- The first week's runs, spend and bookings are reported.

## Open questions

Each run costs a data call. Open a free public audit with a daily cap?
