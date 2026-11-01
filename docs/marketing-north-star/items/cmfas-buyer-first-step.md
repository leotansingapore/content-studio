# Every new CMFAS Prep account is led to the step that buyers took first

Status: todo
App CMFAS Prep, owner Leo + Claude, phase 4 (CMFAS Prep).

## Why

Brainrot is an iPhone screen time app with a pet brain that rots the longer you scroll. Its founder says it went from about $10K a month to about $400K a month in the year after its summer 2025 launch (Starter Story, youtu.be/hnxn16HtLIk at 0:00 and 1:04). The point he says people talk about least is how users actually use the app: once there is traffic, sort the power users from the casual ones, find the activation moment and the most active cohorts, and get every other user to do what they do (4:47, 7:25). Then run small onboarding experiments; about one in ten moves the result and the other nine do nothing (7:58).

CMFAS Prep sells one-time passes for a paper a candidate has to pass, so a free account's first visit is the one chance to show what a pass gets them.

Source: ~/Documents/App Growth Playbook/starter-story/weekly/2026-W45.md on Leo's Mac (2 Nov 2026, Jev fit 0.62, overlap 0.11, rule break 0.07).

## What we have today

Checked 2 Nov 2026, against origin/main of ~/examprep-app (fe477b75).

- Feature use is recorded in app_events and read on /admin/product.
- PostHog keeps replays and funnels with every answer and score masked, on the production host only (src/lib/posthog.ts).
- Attempts are saved through src/app/api/attempts/route.ts.
- Nothing compares what the accounts that bought a pass did on their first visit with what free accounts that never bought did.

## What to do

1. Claude lists the steps a first visit can take that app_events or PostHog record: for example a timed mock, a full sample paper, the score breakdown by topic, the referral page.
2. For every account, count which of them it took on its first visit, and rank the steps by the gap between accounts that bought a pass and accounts that never did. Counts only, no names or emails.
3. Leo approves the step with the widest gap, and the first visit leads every new account to it.
4. Then one small change a week to the first visit, kept only if more new accounts reach the step than in the weeks before.
5. The Monday read-back shows how many new accounts reached the step.

## Done when

- The ranked list of first-visit steps exists, with the counts behind it.
- New accounts are led to the approved step on their first visit.
- The Monday read-back shows how many reached it.

## Open questions

- Lead with the found step even when it means a preview of a paid feature on the first visit? Recommended: yes, a preview with the pass price beside it, since a candidate who never sees what a pass adds has nothing to buy.
