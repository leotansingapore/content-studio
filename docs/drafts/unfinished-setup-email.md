# Unfinished set-up email, draft for Leo's read

Item 5 of docs/handovers/2026-11-13-jilian-next.md. Nothing is built and no code sends it. It waits for your read of the words below and your go.

## Who gets it

- A paying account: its `cs_subscriptions` row is `trialing` or `active`.
- Made 24 to 72 hours ago. The upper bound stops a mass send to older accounts on the day it ships.
- Its set-up is unfinished: it has no `content-studio-onboarded-<uid>` row in `cs_user_data`.
- Once per account, ever.

## The email

Plain text, from `Postmosis <noreply@mail.themoneybees.co>`, the same sender as the Monday email.

**Subject:** Finish setting up your brand

> Hi,
>
> You started setting up your brand on Postmosis but didn't finish. It takes about two more minutes, and it opens where you left off.
>
> Finish setting up: https://app.postmosis.com/welcome
>
> Once it's done, every post, plan and calendar starts from your brand: your logo, your colours and how you sound.
>
> Your free trial has 6 days left.
>
> Postmosis
>
> You're getting this once, because your set-up isn't finished.

The trial line shows only on a trial, with the real number of days. A paying account that is past its trial gets the email without it.

## Questions for you

1. Skip an account that has already cancelled its trial (`cancel_at_period_end`), or send it anyway?
2. Is 24 hours the right wait?
3. Should it name the brand when the saved set-up has one ("You started setting up Tidy Home")?

## How it would send, after your go

- Inside `notify`, which pg_cron already calls every hour. It already sends through Resend and already reads `cs_user_data`.
- A new step pages through `cs_subscriptions` for accounts in the window and sends each one once.
- `cs_notify_sent` (016) records each send, so a retry or a second run never sends twice.
- `dryRun` and `testTo` work as they do for the Monday email, so you can see it in a test inbox first.
- No new secret and no new table.
