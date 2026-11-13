# Unfinished set-up email, draft for Leo's read

Item 5 of docs/handovers/2026-11-13-jilian-next.md. Nothing is built and no code sends it. It waits for your read of the words below and your go.

## Who gets it

- A paying account: its `cs_subscriptions` row is `trialing` or `active`.
- Made 24 to 72 hours ago. The upper bound stops a mass send to older accounts on the day it ships.
- No saved brand on its main profile: no `content-studio-carousel-brand-<uid>` row in `cs_user_data`. That covers three groups: people who left set-up partway, people who tapped Skip set-up for now, and people who paid but never opened the app.
- Once per account, ever.

Why not the set-up marker (`content-studio-onboarded-<uid>`): it is written when someone leaves the first screen by any button. That includes Skip set-up for now, the finish step's buttons, Go to Home, the studio tour and every Getting started button. It marks "left the first screen", not "set up". Choosing on it would miss everyone who skipped.

## The email

Plain text, from `Postmosis <noreply@mail.themoneybees.co>`, the same sender as the Monday email.

**Subject:** Set up your brand on Postmosis

> Hi,
>
> Your brand isn't set up on Postmosis yet. It takes about two minutes: paste your website and check what we find.
>
> Set up your brand: https://app.postmosis.com/welcome
>
> Once it's done, every post, plan and calendar starts from your brand: your logo, your colours and how you sound.
>
> Your free trial has 6 days left.
>
> Postmosis
>
> You're getting this once, because your brand isn't set up yet.

The trial line shows only on a trial, with the real number of days (4 to 6 in this window). An account that paid outright, with no trial, gets the email without it.

## Questions for you

1. Skip an account that has already cancelled (`cancel_at_period_end`), on a trial or paid outright, or send it anyway?
2. Is 24 hours the right wait?
3. Should it name the brand when the saved set-up has one?
4. The link works today for two of the three groups. /welcome resumes the saved step for someone who left partway, and starts set-up for someone who never opened the app. It does not reopen set-up for someone who tapped Skip set-up for now, because their set-up marker exists. Reaching them needs one small change: /welcome reopens set-up while the main profile has no saved brand. Build that, or leave skippers out of the email?

## How it would send, after your go

- Inside `notify`, which pg_cron already calls every hour. It already sends through Resend and already reads `cs_user_data`.
- A new step pages through `cs_subscriptions` for accounts in the window and sends each one once.
- `cs_notify_sent` (016) records each send, so a retry or a second run never sends twice.
- `dryRun` and `testTo` work as they do for the Monday email, so you can see it in a test inbox first.
- No new secret and no new table.
