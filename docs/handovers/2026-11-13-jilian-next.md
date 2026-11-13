# Handover for Jilian's Claude sessions: before the first paying customer, 13 Nov 2026

Paste this into a Claude Code session in this repo, or tell it to read this file, before you change anything. It follows docs/handovers/2026-11-12-jilian-onboarding.md. Most of that one is done (/welcome for new accounts 1464ae10, the check-your-email page ec413b44 and 1ca6af22, the profession pick in shadow b1becd0a, the speed limit fix), so this file is the next list, worked top to bottom. Items 1 to 4 should land before Leo switches checkout on; 5 and 6 can follow.

## Where things stand

- Checkout is still off. Leo has not entered the Stripe values yet, so postmosis.com/checkout shows "Checkout is closed for now" with the walkthrough button, and no account has a row in `cs_subscriptions`.
- postmosis.com is light only, and since 49404e10 the studio opens light unless the device picked Dark, or System on a dark device.
- Main is green. The 250 ms limit in brand-dna/look.test.ts that failed four CI runs on 12 Nov is the one you raised to 1000 ms.

## The list

1. Send Leo the profession shadow report, then take the pick live. docs/profession-pick.md has the commands and the four go-live steps. Run it with `--go` (about US$0.001 for Jev plus one small OpenAI call per site, 30 sites), send Leo the report with the wrong prefills first, and set `PROFESSION_MIN` only after he has read it. Skip the run if he already has the report.

2. Walk the first week in light. Most new customers will now see the studio light, and until yesterday most pages were only looked at in dark. Open each page a new customer reaches in the first week in light at 1440 and 390: /welcome start to finish, Home, the writer, Brand, Accounts, Settings > Billing, and the paywall and trial line (stub the `cs_subscriptions` read on localhost to see those two). Fix text that is hard to read, colours fixed to dark values, and logos or images that vanish on white, the way your d146c854 did for white logos. Leave a screenshot per page beside your report.

3. Put the lapse check in every metered function. `consumeUsage` in supabase/functions/_shared/usageCaps.ts refuses a lapsed subscriber with 402 `subscription_lapsed`, but a function only gets that once it is deployed again, and only `social` has been. 40 functions call `consumeUsage`. There is no deploy workflow, so main can hold changes to a function that were never deployed, and redeploying would ship those too. For each function, download what is live (`supabase functions download <name>` into a scratch folder) and diff it against main. Redeploy the ones whose only difference is the shared code, and send Leo a short list of the others with what each would also ship. Nothing changes for anyone today, because an account with no row is never refused.

4. Give Leo a list of held checkouts. A payment that billing.ts cannot safely attach goes into `cs_held_checkouts` and waits for someone to attach or refund it, and right now nothing shows that table to anyone. Build a Leo-only list: a JWT-on function that checks the caller with the same `LEO_EMAILS` as src/lib/leoOnly.ts on the server, reads the table with the service role (it has no policy or grant beyond service_role, on purpose), and returns the unresolved rows. Show email, reason, Stripe status, when, and a link to the subscription in the Stripe dashboard on a Leo-only page. It reads only: attaching and refunding stay in Stripe and with Leo, and where an alert should go is his call, so build no alert.

5. Bring an unfinished set-up back after a day. A customer who paid but left /welcome partway is the one most likely to cancel in the trial. Draft one email for a paying account whose set-up is still unfinished 24 hours after its account was made, with a link straight back to /welcome, where the saved step resumes. Look at how supabase/functions/notify sends email before adding anything. The words go to Leo as a .md for his read before any code sends them, and the send waits for his go, because it writes to customers.

6. Put the price in the pricing page's search data (repo postmosis-site, which you can write to). /pricing has no `offers` in its JSON-LD, so search results cannot show the price. Add one Offer for US$29 a month in USD on /pricing only, since the site keeps the price off every other page and its guards test that. While there: the off, pending and error lines on /pricing sit hidden in the static HTML, so a crawler reads "Checkout is closed for now" on the normal page. Keep them working with JavaScript off, which `qa/pricing.qa.test.ts` checks, but find a way that crawlers do not read them as page text. Run that repo's build, `LAUNCH=1` vitest and `npm run qa` before pushing.

## What waits for Leo

Leave these alone until he says: the Stripe values and the test-mode walkthrough, which he runs himself; the Zernio team cap of 10 against 3 accounts per customer; whether a lapsed customer's connected accounts get disconnected; whether the off switch keeps stopping the webhook and the portal; where held-checkout alerts go; and any change to the attach rules in billing.ts.

## Working rules for this work

The rules in both earlier handovers and in CLAUDE.md apply. Two more:

- Every function deploy in item 3 goes to the live project that also serves the academy, so diff first, deploy one at a time, and check each one answers before you deploy the next.
- Words a customer reads (the email in 5, any new label in 2) go through Leo's read before they ship, as all copy here does.
