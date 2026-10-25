# People who passed CMFAS post how they did it

Status: todo
App CMFAS Prep, owner Leo + Claude, phase 6 (SearchBlueprint and CMFAS).

## Why

Kenyon of Sideshift (21:59 to 22:44): the niches performing best are "so narrowly defined that it feels like the target audience is actually just not big enough", and there it is "a lot easier to find those winning formats and have them last a lot longer because you have way less competitors in the space." People sitting M9 or RES 5 this month are that kind of audience: small, anxious, and searching for exactly one thing.

The plan in 03-strategy-and-workflow.md keeps CMFAS Prep off paid ads, because a S$29.90 to S$79.90 product is hard to make work on Meta (Oren's price-point point). Someone who just passed, saying how, on their own account, is the cheapest proof there is, and the same videos reach would-be advisers for FINternship.

## What we have today

Checked 26 Oct 2026, against origin/main of ~/examprep-app (fe477b75), the app at app.cmfas-exams-prep.com.

- What we sell is called a pass: Single Exam Pass S$29.90, two-paper passes S$49.90, and the Financial Adviser Starter Bundle at S$79.90 for RES 5, M9, M9A and HI with three months' access (src/lib/plans.ts, src/lib/plan-cards.ts).
- So "pass holders" in our notes means people who bought a pass. The app marks a mock as passed or below the pass mark (src/components/results-view.tsx), but nothing records who passed the real SCI exam. The card's `ours` line reads as if we know who passed; we do not.
- Every signed-in user already has a referral link: /referral and /api/referral give app.cmfas-exams-prep.com/?ref=CODE, with 10% off a friend's first purchase and 10% store credit to the referrer, recorded in cmfas_referrals.
- Mail to the support address bounces because the domain has no MX record (leaks-cmfas-mail, todo; memory cmfas-support-email-no-mx). Replies to anything we send from it would be lost today.
- FINternship interns sit these papers and are reached through the FINTERNSHIP FASTRACK Telegram group.
- The weekly blog detector com.cmfas.weekly-content (Mondays 08:00) is the only marketing job running for CMFAS Prep.
- Buyer and pass counts are in private-notes.md on Leo's Mac (card cmfas-pass-stories).

## What to do

1. Leo and Claude fix the mail first (leaks-cmfas-mail), so replies to step 2 reach someone.
2. Claude drafts one short email to everyone whose pass has ended: did you sit the paper, did you pass, and would you post 30 seconds on how you prepared. Leo approves the wording and the send, because it messages customers. Leo posts the same ask once in FINTERNSHIP FASTRACK for interns. Nobody is asked twice.
3. Claude writes a one-page brief from loop-brief-template for "how I passed M9" style videos, 30 to 60 seconds, on the person's own Instagram or TikTok: the paper, how many weeks they studied, what they used, and the one trap that nearly caught them. Two reference videos: the best "how I passed" posts Claude finds for CMFAS or similar licensing exams.
4. Each person posts with their own /referral link in the caption or bio, plus `utm_source=<platform>&utm_medium=creator&utm_content=<handle>` added after the ref code.
5. Before anything posts, Jev checks the caption and the whisper-cli transcript for a promise of passing, a pass rate or the word guaranteed (pinned jev-1.13.0). If Jev returns nothing, Leo reads it. We take the person's word that they passed and never claim a pass rate ourselves.
6. Organic only. Interns' videos also go out as a collab with @finternshipofficial, which already posts three reels a week.
7. As thanks, each person who posts gets a free Single Exam Pass for their next paper (see Open questions); Once Leo says yes, Claude issues it the way a team pass is issued (a cmfas_team_credits seat assigned to their email, memory cmfas-team-passes), so their access clock starts only when they redeem it.
8. Once a month Claude adds a CMFAS line to the Monday read-back: videos posted, visits by `utm_content`, purchases through each ref code from cmfas_referrals, and starter bundles sold.

## Done when

- The support address receives mail (leaks-cmfas-mail done) before the ask goes out.
- The ask went out once by email and once in FINTERNSHIP FASTRACK.
- Five or more "how I passed" videos are live, each with a working ref link, and each passed the step 5 check before posting.
- The Monday read-back shows purchases through those ref codes each month.

## Open questions

- Thank people with a free pass, or with nothing beyond the referral credit? Recommended: a free Single Exam Pass for their next paper, since it costs us nothing to give and most people sit more than one paper.
- Point the videos at the starter bundle or at whichever paper they passed? Recommended: at the paper they passed, because a viewer searching that paper is the narrow audience Kenyon describes, with the bundle on that page as the next step.
