# Plans and checkout

`business-plans` | business | phase 8 | status: partial | /north-star#business-plans

## Leo asked

8 Oct 2026: "an all in one tool for my social media management, and for each person too"

The north-star page files plans under this ask: if each adviser uses the studio for their own posts, each needs a plan and a way to pay. That reading is the page's, not Leo's words.

## How the best do it

Fastlane shows the plan everywhere and never hides the way to pay. The Home header reads "Mon 19 Oct | Activity Tracker | 142 credits | Starter", and the sidebar's "Analytics" item carries a small "Growth" tag (probably meaning Analytics needs the Growth plan; unverified). Both create pages Leo opened (Yapper and Slideshow) have "142 credits left" with a "Buy credits" button at the top right (1:31, 1:53), and the Yapper footer repeats "Buy credits" beside a disabled "Generate video" when the balance is short.

![Fastlane 1:31](../../../public/north-star/fastlane/t091.webp)

- Settings groups "WORKSPACE AND PLAN": "Workspaces", "Members", "Plan and spend" / "Your plan, credits, storage and invoices." and "Activity" (5:46). The chat links to the same page with an inline chip, "or you can buy credits in [Plan and spend]." (4:23).

![Fastlane 5:46](../../../public/north-star/fastlane/t346.webp)

- The welcome card after their v2 move lists "Your plan" / "Same plan, price and billing date as before." with the link "Billing", and "352 credits" / "Credits pay for making posts, not your plan." (4:40).

![Fastlane 4:40](../../../public/north-star/fastlane/t280.webp)

- A campaign sizes the top-up to the gap: "You are short 803 credits" and "Cover all posts | 803 credits ->", with "Nothing is made or charged until you press Make." (0:38).
- Public plans, two tables that disagree. The homepage: Starter USD 20 a month (500 credits, struck through from USD 29), Growth USD 55 (2,000), Pro USD 139 (10,000) and Enterprise USD 699 (50,000), 30% off yearly, a 7-day trial with 50 credits, and caps of 1, 5 or 20 campaigns and 1, 10 or 500 social accounts. The /pricing page: Free USD 0 (10 credits), Starter USD 29 (250), Growth USD 49 (500), Pro USD 149 (2,000), with 1, 3 or 10 workspaces ([home](https://usefastlane.ai), [pricing](https://usefastlane.ai/pricing)). Leo's own ledger shows plan credits of 10 and then 250, which fits the /pricing table. The tool pages say it is free with no card and paid from US$29 a month ([AI UGC tool](https://usefastlane.ai/tools/ai-ugc-video-generator)). Leo did not open "Plan and spend" or the "Buy credits" flow, so that screen and the pack prices are not in the recording.

Other competitors:

- Exolyt renders its pricing page in SGD with 0% VAT for a Singapore visitor, with a monthly or annual toggle, a free plan without a card, Paddle as merchant of record and invoices on request: Essentials SGD 385 a month, Advanced SGD 920 ([pricing](https://exolyt.com/pricing)).
- Foreplay: Basic US$59 a month (US$49 yearly), Workflow US$175, Agency US$459, Enterprise custom, plus US$20 a user; 7-day free trial ([pricing](https://www.foreplay.co/pricing)).
- Atria: starts free with 1,000 credits and no card; "Pay monthly" or "Pay annually (Save 20%)" ([pricing](https://www.tryatria.com/pricing)).
- Levitate, built for advisers: Essential, Preferred and Prestige with no public prices; the compliance workflow comes with the Preferred website plan ([pricing](https://levitate.ai/pricing)).
- Broadridge Advisor (AdvisorStream, Forefield heritage) sells through firms: Essentials USD 25 a month paid by commission deduction, Growth USD 75 more by card, 1:1 onboarding USD 199 ([Osaic page](https://advisorstream.com/info/osaic)).
- OpusClip watermarks free clips and removes the mark from earlier projects too when you upgrade ([watermark](https://help.opus.pro/docs/article/watermark.md)).
- Kapwing sells Business top-ups of 500 credits for US$50 ([credits](https://www.kapwing.com/help/how-do-kapwing-credits-work/)).

## What we have today

- The studio has no plan, and every signed-in user gets the same daily caps (`supabase/functions/_shared/usageCaps.ts`).
- A paid plan exists for a different product, the Members Hub, where `src/pages/hub/HubPaywallPage.tsx` shows "SGD 49/month" over "Cancel anytime." with a "Subscribe" button. It calls `supabase/functions/hub-checkout`, which opens a Stripe Checkout subscription (`npm:stripe@16`, `client_reference_id` = uid, back to `/hub?checkout=success` or `cancel`) and answers 503 `payments-not-configured` until `STRIPE_SECRET_KEY` and `HUB_PRICE_ID` are set. Whether they are set live is unverified.
- `supabase/functions/hub-stripe-webhook` (needs `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`, deployed with `--no-verify-jwt`) checks the signature, skips repeat deliveries through `hub_stripe_events` (`supabase/hub/008_stripe_events.sql`), and maps Stripe states to `hub_memberships.status` (`membership.ts`: none, client, active, canceled; "active" and "trialing" count as paid). It handles only `checkout.session.completed`, `customer.subscription.updated` and `customer.subscription.deleted`; there is no `invoice.paid` handler.
- Its `checkout.session.completed` branch treats any session with a `client_reference_id` and a subscription as a Members Hub purchase and writes `hub_memberships`. A studio subscription sent through the same webhook would grant hub access unless it is routed away first.
- Only `membership.ts` has a test (`membership.test.ts`); the routing in `index.ts` has none.
- `/hub` is left out of the nav on purpose (`EXCEPTIONS` in `src/lib/navRoutes.test.ts`: "paid hub, unlinked on purpose").
- So the status is partial: the Stripe plumbing exists for the hub, and nothing in the studio sells or reads a plan.

## Build

Two steps. Step 1 needs no money and no schema, and ships behind `leoOnly(email)`. Step 2 sets prices, takes payments and needs the credits tables, so it waits for Leo.

### Screens and states

Step 1, `/billing`, "Plan and spend" (new `src/pages/BillingPage.tsx`, read-only):

```
Plan and spend
Your plan          Preview
                   Free while Content Studio is invite-only.
Each day you get   AI videos 2 | AI clips 2 | Pictures 5 | Voiceovers 10 ...   [About US$2.75 each]
Invoices           No invoices yet.
                   AI use history ->
```

- Loading: the header renders at once and the three blocks show skeleton rows.
- Each day you get: one row per paid cap a person can press, grouped Video, Pictures, Voice and music, Writing, Finding, with the limit, uses left today and the price from `business-cost-preview`'s table. Across-everyone caps (`-global`) and `NO_PRICE` caps are left out. Build `business-cost-preview` first; if its table has not shipped, the price column is left out and the rest still ships.
- "AI use history" opens `agent-activity`'s AI use tab (`/activity?view=ai-use`) once that page exists, and stays hidden until then; anyone outside the gate gets `NotFoundPage`.

Step 2, after Leo sets plans and prices:

- Plan block: a "Monthly | Yearly" toggle over one card per plan (name, SGD price, credits a month, what else comes with it), where the current plan wears the tag "Your plan" and every other card has "Choose {plan}".
- Credits block (`business-credits` owns the ledger): pack cards "{n} credits" / "SGD {x}" / "Buy". `?pack=<n>` preselects the smallest pack that covers `n`.
- "Manage billing" opens the Stripe Customer Portal, where people change their card, read invoices or cancel.
- Opening checkout: the button reads "Opening checkout..." within 400 ms and the page moves to Stripe.
- Back from Stripe with `?checkout=success`: "Confirming your payment..." while it reads the account row every 2 s for up to 20 s, then "You're on {plan}. {n} credits added." If the webhook is slower: "Your payment went through. Credits can take a minute to show."
- Back with `?checkout=cancel`: "Checkout cancelled. Nothing was charged."
- Failed to open checkout: "Couldn't open checkout. Try again in a minute." and the button comes back.
- Over the cap (`studio-checkout`, 10 a day): the cap's own message.
- Payments not set up (503): "Payments aren't switched on yet."
- "Buy credits" entry points, all to `/billing#credits`: the top right of each format maker (formats items), "Add {gap} credits" on a short price chip (`business-credits`), and the agent's refusal (`agent-budget`).

### Copy

- Title: "Plan and spend"
- Step 1: "Your plan", "Preview", "Free while Content Studio is invite-only.", "Each day you get", "{n} left today", "Invoices", "No invoices yet.", "AI use history"
- Groups: "Video", "Pictures", "Voice and music", "Writing", "Finding"
- Step 2: "Monthly", "Yearly", "Your plan", "Choose {plan}", "{n} credits a month", "Buy credits", "{n} credits", "Buy", "Manage billing", "Opening checkout...", "Confirming your payment...", "You're on {plan}. {n} credits added.", "Your payment went through. Credits can take a minute to show.", "Checkout cancelled. Nothing was charged.", "Couldn't open checkout. Try again in a minute.", "Payments aren't switched on yet."

### Data

- Step 1: nothing stored. The rows come from `DAILY_LIMITS`, `readUsage()` and the price table. Labels come from the one label map `agent-activity` adds (`AI_USE_LABELS`); if that has not shipped, add it in `src/lib/aiUsage.ts` and let `agent-activity` reuse it.
- Step 2, schema change, stop for Leo: add `plan text not null default 'free'`, `period text`, `stripe_customer_id text`, `stripe_subscription_id text` to `cs_credit_accounts` in the credits migration (`business-credits`), so one row holds the plan and the allowance.
- Plans and packs live in code, in `supabase/functions/_shared/plans.ts` (no imports). Each has an id, a name, an SGD price per period and its credits a month; its Stripe price id comes from the secret `STUDIO_PRICES` (JSON, plan or pack id to Stripe price id), so test and live keys never sit in the repo.

### AI and cost

- No AI call and no Jev question.
- Step 2 server: new `supabase/functions/studio-checkout` on the `hub-checkout` pattern. Body `{kind: "plan", plan, period}`, `{kind: "pack", pack}` or `{kind: "portal"}`. It sets `metadata.product = "studio"` and `client_reference_id` = uid on every session, uses `mode: "subscription"` for plans and `mode: "payment"` for packs, currency SGD, and answers 404 `not_enabled` unless `leoOnly(user.email)` (`supabase/functions/_shared/leoOnly.ts`, added by `plan-goal`).
- Webhook: extend `hub-stripe-webhook` and route by `metadata.product` before any hub code runs, so a studio session never reaches the hub's `checkout.session.completed` branch. Set `subscription_data.metadata.product = "studio"` too, so the invoices and subscription events carry it. Put the routing in a new pure `hub-stripe-webhook/route.ts` (`routeEvent(event) -> "hub" | "studio-pack" | "studio-plan" | "studio-cancel" | "ignore"`) so vitest can test it.
  - `checkout.session.completed` in payment mode: `cs_add_credits` with reason `pack` (ref = session id).
  - `invoice.paid` on a studio subscription: sets plan, allowance and `refills_on`, then `cs_add_credits` with reason `plan` (ref = invoice id).
  - `customer.subscription.deleted` on a studio subscription: plan back to free, allowance 0.
  - The hub's own events keep going through `membership.ts` untouched.
- Stripe dashboard (Leo, at the money stop): add `invoice.paid` to the webhook endpoint's events, create the SGD prices, and switch on the Customer Portal; none of these exist today.
- Cap in `usageCaps.ts`: `"studio-checkout": 10` (sessions opened per user per day).
- Cost: no AI. Stripe's per-payment fee applies (see Stripe's Singapore pricing page; not checked here).

### Deep links

- `/billing`, with sections `#plan`, `#credits`, `#invoices` (`useScrollToHash`).
- `?period=yearly` (replace; default monthly), `?pack=<n>` (read once), `?checkout=success` or `cancel` (read once, then removed with replace).
- Nav: `{ to: "/billing", label: "Plan and spend", icon: CreditCard, owners: LEO_EMAILS }` in the home section; add `/billing` to the routes list in `src/lib/nav.test.ts`; Jump to keywords `"/billing": "billing plan credits invoices pay subscription"` in `src/lib/jumpTo.ts`.
- `links.billing({ period, pack, section })` in `src/lib/links.ts`, and the row in `docs/deep-links.md`.

## Done when

- [ ] Step 1: Leo sees /billing with his plan, every paid daily limit with uses left and price, and "No invoices yet."; a demo sign-in gets the 404 page at /billing and no nav entry.
- [ ] Step 1: the limits on the page equal `DAILY_LIMITS` for every listed cap.
- [ ] Step 2 (after Leo sets prices): in Stripe test mode, choosing a plan and paying with test card 4242 4242 4242 4242 lands Leo back on /billing with the plan marked and the credits row in the ledger.
- [ ] Step 2: the same webhook event sent twice adds credits once; a hub subscription event still updates `hub_memberships` and nothing else; a studio plan checkout writes no `hub_memberships` row.
- [ ] Step 2: "Checkout cancelled. Nothing was charged." shows after cancelling, and no row is written.
- [ ] Checked by eye at 390 px and 1440 px; `npm run build` and the full `npx vitest run` pass.
- [ ] `src/data/northStar.ts` item `business-plans` flipped with its `ours` line, in the same commit.

## Tests

- `src/lib/billing.test.ts`: `limitRows(DAILY_LIMITS, usage, prices)` drops `-global` caps and `NO_PRICE` caps, groups the rest, and shows left = limit minus today's use.
- `src/lib/nav.test.ts`: `/billing` maps to one page; the More sheet for someone@example.com is unchanged.
- `supabase/functions/studio-checkout/logic.test.ts`: an unknown plan or pack is refused; a known one maps to its price id from `STUDIO_PRICES`; a missing secret gives 503.
- `supabase/functions/hub-stripe-webhook/route.test.ts`: a studio subscription checkout routes to `studio-plan` and never to `hub`; a studio payment session routes to `studio-pack`; an `invoice.paid` with studio metadata routes to `studio-plan`; a session without studio metadata routes to `hub`; an unknown event type routes to `ignore`. The repeat-delivery skip (`hub_stripe_events`) is checked once by hand in Stripe test mode, since `index.ts` has no test harness.

## Open questions

- Leo: the plans, their SGD prices, credits a month and what each includes. Fastlane's shape is three paid tiers at USD 20, 55 and 139; the Members Hub today is SGD 49.
- Leo: does the Members Hub fold into a studio plan, or stay separate?
- Leo: a trial (Foreplay's 7 days, Atria's free credits with no card) or a free plan on today's caps.
- Leo: firm or team billing for agency leaders, which `trust-workspaces` would carry.
- Leo: the refund policy for plans and packs.

## Related

business-credits, business-cost-preview, business-referrals, business-onboarding, agent-budget, agent-activity, trust-workspaces, plan-goal, formats-gallery
