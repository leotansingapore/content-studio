# The lapse check in every metered function, 13 Nov 2026

Item 3 of docs/handovers/2026-11-13-jilian-next.md.

Result: 29 of the 40 functions that call `consumeUsage` now refuse a lapsed subscriber before a use is counted. Most answer 402 `subscription_lapsed`. Three answer differently:

- `social` treats a lapsed subscriber as switched off: 404 "Not enabled.", or 200 `{enabled:false}` on the bare status call. It still lets them remove a brand's accounts.
- `remix`'s fit check returns its usual unknown fit (200).
- `text-voice`'s music mood returns the default mood (200).

The other 11 wait for your call, because a redeploy would also ship code beyond `_shared/`. Nothing changes today for any account without a `cs_subscriptions` row.

## How

- Downloaded each live function on its own (`supabase functions download <name> --use-api`) into a scratch folder.
- Compared every downloaded file with main at 410f1ecf.
- Redeployed only the functions whose sole differences sit in `_shared/`, one at a time, from main.
- After each deploy, before the next:
  - The version number went up and JWT verification stayed on.
  - A CORS preflight answered 200 from the function, so the new version boots.
  - A call with no sign-in got 401.
  - A fresh download matched main file for file and held the lapse check.

## Already had it (20)

Deployed from main after 557a0e9e (12 Nov, 2:46 PM), so their live code already carries the check: ai-image, brand-dna, carousel-copy, clone-reel, competitors, generate-social-content, hook-writer, idea-dump, linkedin-strategy, market, media-sort, reel-visuals, remix, remix-link, remix-patterns, slide-campaigns, social, social-plays, storyboard, video-assist.

`social` has the check. Its live `_shared/` is a little behind main (the subscription helper and one line of usageCaps.ts), which needs nothing now.

## Redeployed today (9)

| Function | Version | What the redeploy also shipped, all in `_shared/` |
| --- | --- | --- |
| feed-ideas | 111 → 112 | usageCaps.ts |
| mentions | 107 → 108 | usageCaps.ts |
| post-score | 107 → 108 | usageCaps.ts |
| script-desk | 2 → 3 | usageCaps.ts, compliance.ts |
| team-board | 92 → 93 | usageCaps.ts |
| text-voice | 117 → 118 | usageCaps.ts |
| viral-search | 65 → 66 | usageCaps.ts |
| writing-judge | 119 → 120 | usageCaps.ts, compliance.ts, auditRunner.ts, socialAudit.ts |
| youtube-captions | 106 → 107 | usageCaps.ts |

Some of these ran a usageCaps.ts from October, so they also took the caps added since then (My hooks, the script desk, Send to phone and others), as every function deployed this week did.

## Waiting for your call (11)

Each one would also ship the code below, outside `_shared/`. Its `_shared/` changes come along too.

| Function | Would also ship |
| --- | --- |
| ai-video | Its own index.ts: c039626d (a failed part gives the use back only when Higgsfield charged for no other part). ai-image/logic.ts: 15c99124 (GPT Image 2.6 Flare). brand-dna/logic.ts: 1788bf00 and 9993033c (brand read names). |
| assistant-act | post-score/logic.ts: 268438fe (the LinkedIn check). jev.ts: 110ae005 (askJev with pictures). |
| carousel-fit | clone-reel/logic.ts: ccec8955 (remix writes for the profession) and 7b23b9da (voice memory for every customer). |
| content-studio-mcp | social/logic.ts, social/posts.ts and zernio.ts: b9f6c4ad (multi-network auto-post after a disconnect). ai-image/logic.ts: 15c99124. compliance.ts: 23dfbfe7. It must keep `--no-verify-jwt`. |
| engage-assist | post-score/logic.ts: 268438fe. auditRunner.ts and socialAudit.ts: 792eba7a, b352d742, 3c47ad6e (audit for the profession, Apps like yours). |
| engage-picks | Its own index.ts and logic.ts: df427158 (each brand keeps its own audit). |
| notify | social/posts.ts and social/logic.ts: fe992425 and 3e9fedff (TikTok music and post settings for campaigns), b9f6c4ad. It must keep `--no-verify-jwt`. |
| stock-media | Its own logic.ts. The live copy matches no commit on main, so it was deployed from changes that never reached main. Main would add the 350-tall Pexels covers. |
| telegram | social/logic.ts: ceaf24ca (3 connected accounts per customer) and b9f6c4ad. The 3-account cap is on your list of calls to make. |
| track-accounts | Its own logic.ts: 26c0e5ba and 3c47ad6e (the shared Apify reader, 30 posts for Competitors). |
| week-pick | notify/logic.ts: seven commits from 25 to 28 Oct (time zones on due-post alerts, the Postmosis name, app.postmosis.com links, the Monday email's counts). |

Say which to redeploy and I will do them the same way, one at a time.
