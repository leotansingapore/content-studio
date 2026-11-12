# Handover for Jilian's Claude sessions: paid sign-up and first-run onboarding, 12 Nov 2026

Paste this into a Claude Code session in this repo, or tell it to read this file, before you change anything. It adds to docs/handovers/2026-11-12-jilian.md and replaces nothing in it. The job for you is one thing: a person who has just paid lands on /welcome, and /welcome has to set up their brand with the Add a brand flow you shipped today.

## What Leo decided on 12 Nov

Leo wants Postmosis to sell the way tryholo.ai does. Every button on the marketing site goes to a pricing page first, the person pays or starts a trial there, and set-up comes after payment. His calls:

- One plan at US$29 a month.
- A 7-day free trial with a card taken upfront, offered as the quieter second option.
- An account is created by a server function only after Stripe confirms the checkout. /auth stays sign-in only.
- Payments go to the D'Marketing Agency Stripe account.

## What is live now

Main is at e669e493, on top of your 55918dfd and 1e1aa17c. The last full run on that tree was 582 test files and 8,224 tests passing, with `npm run build` green.

- postmosis.com (repo postmosis-site, 4ef27a6) has /pricing with the price, a pay button and a trial link. Every other button on the site reads "Start my week" and goes there. Its two buttons link to `https://app.postmosis.com/start?plan=pay` and `?plan=trial`.
- This repo has three new edge functions: `postmosis-start` (public, behind the /start and /start/done rewrites in vercel.json), `postmosis-webhook` (public, Stripe signature) and `postmosis-portal` (JWT on). `social` was redeployed with them.
- SQL 035 is applied: `cs_subscriptions`, `cs_held_checkouts`, `cs_subscription_events` and the function `cs_account_for_email`. All three tables are empty.
- The app has a paywall for a lapsed subscription (src/components/Paywall.tsx, mounted in ProtectedRoute), a billing line during a trial (BillingNote.tsx) and Settings > Billing (src/pages/BillingPage.tsx). An account with no row in `cs_subscriptions` is treated as before and never gated, which covers every account that exists today.
- Checkout is switched off because none of the four secrets is set (POSTMOSIS_STRIPE_SECRET_KEY, POSTMOSIS_STRIPE_WEBHOOK_SECRET, POSTMOSIS_PRICE_ID, POSTMOSIS_CHECKOUT_ON), so /start sends people back to /pricing?checkout=off and the page there offers the walkthrough. Those values are Leo's to enter, and a session of yours should never set, read or print them.

docs/postmosis-billing.md is the full account: the endpoint contract, the access rules, the abuse cases and the go-live runbook. Read it before touching anything under supabase/functions/postmosis-* or supabase/functions/_shared/billing.ts.

## How a new customer arrives

After paying, Stripe returns the person to /start/done, which makes sure the account and its row exist and then sends them to `/auth?email=<their email>&checkout=done`. That page emails the normal sign-in link, with /welcome as its landing address. Nobody is ever signed in by paying alone, on purpose: the email typed at Stripe is not proof of owning the inbox. So the first signed-in screen a paying customer sees is /welcome, on an account with no brand, no profession and nothing onboarded.

## What is left for you

1. Rebuild first-run /welcome on your flow. Today src/pages/WelcomePage.tsx is still the old page: a profession question and a "Write my first post" button. A new account should instead go through your steps (site, work, reading, review) and have them fill its own first brand, the default one it already has, where /brands/new adds a second. Accounts that are already onboarded, or whose brand already has a profession, must see no change. `onboardThenGo` in WelcomePage.tsx and `markOnboarded` in src/lib/onboarding.ts are how the account gets marked; keep WelcomePage.test.ts green.

2. Take four things from the branch `cs-onboarding` (pushed to origin, two commits, ddad4be6 at its tip). It was built in parallel with yours, uses the same file paths (src/lib/onboardingFlow.ts, src/components/onboarding/), and no longer rebases, so do not merge it. Read it for these parts, which your flow does not have, and build them your way:
   - A "Where do you post?" step: six networks, never X, ticked in advance from the handles the read finds.
   - A connect step, shown only when `checkSocialConnect` says the account may connect. A paying customer may, up to 3 accounts.
   - A finish screen that names what was set up, then one button into the writer with a first topic from the brand's topics already loaded (`saveCreateTopic`, then NEW_POST).
   - Resume: the step and every typed value kept under a `content-studio-onboarding-<uid>` key, so a reload or a second device carries on. Your /brands/new sends a reload during the read back a step; decide whether first-run should do the same.
   The branch's screenshots are on Leo's Mac only. Run the branch on localhost if you want to see it.

3. Fix the page a customer sees straight after paying. /auth with `checkout=done` still says "Sign in to your studio" and shows the FINternship Academy note under a "Your payment went through" paragraph. It should read as a "check your email" screen for that state only, with plain /auth untouched. The auto-send and the one-a-minute resend rule are `checkoutArrival` and `resendWait` in src/lib/magicLink.ts, with tests.

4. Pick the profession with Jev. The `cs-onboarding` branch guessed it from keywords and left most sites empty, and the repo rule is that a pick from fixed choices goes through `supabase/functions/_shared/jev.ts`. Your `work` step asks the question; if you prefill it from the read, do it as a Jev pick inside `brand-dna`, with a shadow run on real sites that Leo reads before it goes live.

5. Redeploy the metered functions when you next touch them. `consumeUsage` in supabase/functions/_shared/usageCaps.ts now refuses a lapsed subscriber with 402 `subscription_lapsed`, but each of the 38 functions that call it only gets that check when it is next deployed, and so far `social` is the one that has been.

## What waits for Leo

Leave these alone until he says: the Stripe product, webhook and secrets, and the test-mode walkthrough in the runbook; whether the off switch should keep stopping the webhook and the portal; the Zernio team cap of 10 against 3 accounts per customer; disconnecting a lapsed customer's accounts; repeat trials; and who watches `cs_held_checkouts`. Any change to the rules in billing.ts for which checkout attaches to which account is his too, since those rules came out of two security reviews.

## Working rules for this work

The rules in the first handover and in CLAUDE.md all apply. Three more for this area:

- Never test a real checkout or create an account on the live database to try the flow, because even the test-mode walkthrough writes real accounts to the shared academy project and Leo runs that one himself. Stub the `cs_subscriptions` read and the portal call in the browser on localhost instead.
- The demo login is for localhost only, and `demo.com` is a real domain, so never send a sign-in email to it.
- A plain request from this Mac to app.postmosis.com can come back 403 from Vercel's bot check, and `postmosis-start` answers 405 to a HEAD request. Check the live app in a real browser, and check the redirect with a GET.
