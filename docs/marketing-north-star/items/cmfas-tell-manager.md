# A candidate can send their manager the team-pass page from inside CMFAS Prep

Status: todo
App CMFAS Prep, owner Claude, phase 4 (CMFAS Prep).

## Why

Excel Exercises' founder says the team deals that helped take it from $10K to $30K a month started with one user: someone tries the training, likes it, tells the boss, and the boss asks to sign up about 50 people (Starter Story, youtu.be/pwvnH9S4j60 at 8:01). On 1 Nov 2026 its dashboard had a group admin portal and the line "Earn points and help your colleagues learn Excel!", and its homepage claimed 50+ partner organisations.

A CMFAS candidate usually sits the paper because an agency is bringing them on, and the agency's manager is who buys passes for the next recruits. The candidate who just did well on a mock is the person most likely to say so.

Source: ~/Documents/App Growth Playbook/starter-story/weekly/2026-W44.md on Leo's Mac (1 Nov 2026, Jev fit 0.46, overlap 0.14, rule break 0.08).

## What we have today

Checked 1 Nov 2026, against origin/main of ~/examprep-app (fe477b75).

- Team passes, the /team page and the manager guide are built (see cmfas-leaders-recruits).
- Managers who already bought get a Monday progress email and a buy prompt when a candidate passes or lapses.
- Every signed-in candidate has a /referral link: 10% off a friend's first purchase and 10% credit back.
- Nothing in the app asks a candidate who bought their own pass to show their manager the team passes.

## What to do

1. After a candidate's second mock, and on the dashboard after that, show one button: Send my manager the team page.
2. It opens the candidate's own WhatsApp or email share sheet with a two-line message they can edit and the manager guide link carrying their referral code, so a team purchase through it is counted.
3. CMFAS Prep sends nothing itself and never reminds anyone. A candidate who dismisses the button does not see it again for that paper.
4. The Monday read-back counts team purchases that came through a candidate's link.

## Done when

- The button shows after the second mock and on the dashboard, and opens only the candidate's own share sheet, proven by a test.
- A team purchase through a candidate's link is counted.

## Open questions

- Does a team purchase through a candidate's link earn them the usual 10% credit? Recommended: yes, the same credit as a friend's purchase, so the referral rule stays one rule.
