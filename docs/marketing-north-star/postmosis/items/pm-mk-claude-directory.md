# Postmosis is listed in Claude's connector directory

Status: todo
App Postmosis (postmosis.com), owner Claude, phase 4 (Paid and partners).

## Why

Taplio is an official Claude connector and has run Meta ads about it since 23 Oct 2026 ("Wait, Claude can do my LinkedIn?", Meta Ad Library, q=Taplio). Its menu also offers 26 free Claude Skills (taplio.com/claude-skills-for-linkedin). Both are in research/teardown.md, move 20. The brief notes that all six competitors it read now offer MCP (product-marketing.md).

A directory listing puts Postmosis in front of people who already run their work through Claude.

## What we have today

Checked 30 Oct 2026 against content-studio origin/main (268438fe) and the live site.

- Connect Claude works through a private per-brand link in the URL. content-studio-mcp is deployed without JWT verification and the link is the credential; links are revoked by a row that is never deleted (CLAUDE.md).
- Everyone gets list_posts, get_post, get_calendar, get_results, get_brand and add_draft (product-truth.md, supabase/functions/content-studio-mcp/logic.ts). The other tools are Leo only.
- The function has no OAuth flow and no tool annotations (grep of supabase/functions/content-studio-mcp, 30 Oct).
- postmosis.com/features/claude explains it. Open Claude skill pages belong to pm-seo-claude-skills in the SEO book.

## What to do

1. Stop and ask Leo (dec-pm-claude-oauth): add OAuth sign-in to Connect Claude for the listing? Recommended: later. It is an auth change.
2. If yes, Claude first reads the directory's current submission rules and the MCP authorization spec, then writes a plan for review: OAuth against the app's sign-in, the link flow kept for existing connections, and annotations on every tool (the five readers read-only, add_draft a write).
3. Build it with tests, have it reviewed, and deploy with Leo's ok. Connect Claude through OAuth on a test brand and check that an old link still works.
4. Submit to the directory with Leo's ok. The listing text goes through aicheck under 15 and brief-check.
5. Each month Claude counts connections made through OAuth.

## Done when

- Leo's answer is in dec-pm-claude-oauth's decided field.
- If yes: OAuth sign-in works, existing links still work, every tool carries annotations, the tests pass, and the listing is submitted.

## Open questions

Add OAuth sign-in to Connect Claude for the listing? This is dec-pm-claude-oauth; the recommendation is later.
