# A visitor who will not book can still start alone

Status: todo
App Postmosis (postmosis.com), owner Leo + Claude, phase 4 (Paid and partners).

## Why

All eight rivals lead with a free plan or a trial. Buffer's free plan and 14-day trial, Later's 14 days, Supergrow's 7 days after which the account pauses, AuthoredUp's trial and Typefully's free plan of 10 posts a month need no card. Taplio's 7 days of Pro has pages that disagree on a card, and FeedHive's 7 days does not say. Only Predis.ai says it takes a card, charged when day 3 ends. Each comes from the rival's pricing page in research/teardown.md, pattern 1.

Some visitors will never book a call. Today they leave.

## What we have today

Checked 30 Oct 2026 against content-studio origin/main (268438fe) and the vault.

- The sign-in page has no sign-up form. It emails a sign-in link, takes a code or a password, and tells FINternship Academy members to sign in there first (src/pages/Auth.tsx). Accounts live in the shared academy project, so a customer gets an account from Leo (product-truth.md, fact 1).
- Accounts are made after a walkthrough, and no price is public (Leo's calls of 28 Oct).
- The first-run page, /welcome, has three steps: Set your voice, Write your first post, Plan your week (src/pages/WelcomePage.tsx).
- Leo switches posting on per customer (~/.local/bin/postmosis-posting, product-truth.md).

## What to do

1. Leo's call first (dec-pm-self-serve). Recommended: not yet; keep the walkthrough until twenty customers show what setup needs, then a no-card trial. It changes auth and billing, so nothing below starts without his yes.
2. If yes, Claude writes a plan for review: a sign-up on app.postmosis.com that makes an account in the shared project without touching the Academy's accounts, the trial length, what happens when it ends (a pause as at Supergrow, or a smaller plan as at Buffer), billing, and whether posting switches on by itself or stays Leo's.
3. The walkthrough script (pm-mk-walkthrough-script) becomes an onboarding checklist on /welcome: brand kit, a carousel, a video, the week.
4. The site gets a second action beside Book a walkthrough, through the copy pipeline, and the money-page guards change to allow it. Leo reads each changed money page's copy .md first.
5. Auth and billing changes are reviewed, each in its own commit, tested on staging before production.

## Done when

- Leo's answer is in dec-pm-self-serve's decided field.
- If yes: a visitor can make an account and reach the onboarding checklist without Leo, the trial ends the way the plan says, and the tests pass.

## Open questions

Open self-serve sign-up beside the walkthrough? This is dec-pm-self-serve; the recommendation is not yet.
