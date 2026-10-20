# Refer and earn

`business-referrals` | business | phase 8 | status: missing | /north-star#business-referrals

## Leo asked

No direct ask; from the competitor research.

## How the best do it

Fastlane keeps a "Refer and earn" button in the sidebar footer, beside "Support" and above the "Senna's fuel used" bar (0:04). Leo did not click it, so the screen behind it is not in the recording.

![Fastlane 0:04](../../../public/north-star/fastlane/t004.webp)

- Unverified, not in the research files: a directory listing for usefastlane.ai describes "Fastlane Racers", an affiliate program paying 30% for the lifetime of each signup and upgrade, with a 30-day cookie and auto approval. The same listing says both "No minimum threshold" and a US$50 monthly PayPal minimum ([Affonso listing](https://affonso.io/affiliate-programs/fastlane-racers-affiliate-program)). Whether the in-app button opens this program is not known.
- Unverified, not in the research files: OpusClip's affiliate terms page is said to pay 25% of the subscription price for up to 12 months on monthly plans and once on annual plans ([affiliate terms](https://www.opus.pro/affiliate-terms)). Check the page before quoting it to Leo.
- None of the 126 competitors in the research documents a referral or affiliate program, in credits or in cash. The research did not look for one, so this is a gap in the research as much as in the market.

## What we have today

- No referral program, no record of who brought whom, and no reward to give (no credits, no plans).
- Pieces to reuse:
  - Invite codes for teams in `src/lib/teamReview.ts`: `INVITE_ALPHABET` (32 symbols, no 0, O, 1 or I), `normalizeInviteCode`, `formatInviteCode` ("ABCDE-FGHJK") and `inviteLink`, checked the same way on `cs_team_invites.code` (migration 011).
  - The SQL generator `cs_generate_invite_code()` (migration 011, 10 characters, 50 bits from `gen_random_uuid()`) and the wrong-code log `cs_team_join_attempts` that limits guesses in `cs_join_team`.
  - Board invites at `/join#<token>` (`src/pages/JoinPage.tsx`, migration 023), which keep the token on the device in `cs-join-token` until sign-in finishes.
  - Sign-in by email link (`src/lib/magicLink.ts`, `src/pages/Auth.tsx`).

## Build

This item waits for `business-credits` and `business-plans`: the reward is credits, and it is paid when the friend's first plan payment lands. It also needs two tables, a schema change that stops for Leo. Build it behind `leoOnly(email)` like the rest.

Rules:

1. Each account has one code and one link, `/r/<CODE>`.
2. A friend counts when they sign up through the link and claim it within 24 hours of making the account.
3. Both sides get their credits when the friend's first plan invoice is paid, so throwaway accounts earn nothing. Amounts are Leo's; the copy below uses 100 as a placeholder.
4. A referrer earns at most 10 rewards a calendar month (Singapore time). Links keep working past the cap.
5. Sharing is a link only: Copy, WhatsApp and the phone's share sheet. The app sends no emails or texts (left out on purpose).

### Screens and states

`/refer`, "Refer and earn" (new `src/pages/ReferPage.tsx`):

```
Refer and earn
Give 100 credits, get 100 when they pick a plan.
Your link   consultant-content-studio.vercel.app/r/ABCDE-FGHJK      [Copy link]
            [Share on WhatsApp]  [Share]
Your referrals   3 joined | 1 paid | 100 credits earned
  ja***@gmail.com   Joined 12 Oct   Paid 14 Oct   +100
  mi***@yahoo.com   Joined 15 Oct   Not paid yet
```

- Loading: the heading shows at once, the link row is a grey bar.
- First visit: the function makes the code and the row reads "Making your link..." for under a second.
- Copied: the button reads "Link copied" for 2 s.
- No share sheet (desktop browsers without `navigator.share`): "Share" is hidden, WhatsApp stays.
- Empty list: "No one has joined through your link yet."
- At the monthly cap: "You've earned the most for this month. Your link still works, and rewards start again on 1 {Mon}."
- Failed to load: "Couldn't load your link. Try again in a minute." with "Try again".

`/r/:code`, public, outside the studio layout:

- A well-formed code is saved on the device as `cs-ref` with the time, and the page moves to `/auth`. A malformed code goes to `/auth` with nothing saved.
- `/auth` shows a line over the form while `cs-ref` is under 30 days old: "You were invited. You get 100 credits when you pick a plan." This is copy only; `src/pages/Auth.tsx`'s sign-in logic does not change.

After the first sign-in (`src/pages/StudioLayout.tsx` on load, once):

- With `cs-ref` saved, the app calls the `referral` function's `claim` and removes `cs-ref` whatever the answer.
- Claimed: toast "You joined through a friend's link. Your 100 credits arrive with your first plan."
- Refused, each with its own toast: own link "That's your own link.", account older than 24 hours "Invite links work for new accounts only.", already claimed "You've already joined through a link." An unknown code is dropped silently.

Rewards:

- When the friend's first studio invoice is paid, the webhook writes two `referral` ledger rows. The referrer's ledger shows "Referral reward" / "+100 | ja***@gmail.com picked a plan", and the friend's shows "Welcome credits" / "+100 | You joined through a friend's link".
- Over the referrer's monthly cap, only the friend's row is written, and the referrer's list shows "Paid 14 Oct, over this month's limit".

### Copy

- Nav and title: "Refer and earn"
- Lead: "Give 100 credits, get 100 when they pick a plan."
- "Your link", "Copy link", "Link copied", "Share on WhatsApp", "Share", "Making your link..."
- "Your referrals", "{j} joined | {p} paid | {c} credits earned", "Joined {d MMM}", "Paid {d MMM}", "Not paid yet", "Paid {d MMM}, over this month's limit"
- "No one has joined through your link yet."
- "You've earned the most for this month. Your link still works, and rewards start again on 1 {Mon}."
- "Couldn't load your link. Try again in a minute.", "Try again"
- WhatsApp and share text: "I make my social posts with Content Studio. Join with my link and we both get 100 credits when you pick a plan: {url}"
- Auth line: "You were invited. You get 100 credits when you pick a plan."
- Toasts: "You joined through a friend's link. Your 100 credits arrive with your first plan.", "That's your own link.", "Invite links work for new accounts only.", "You've already joined through a link."
- Ledger: "Referral reward", "{masked email} picked a plan", "Welcome credits", "You joined through a friend's link"

### Data

Schema change, stop for Leo, then an independent review of the migration before it is applied.

- Migration (next free number after the credits one):
  - `cs_referral_codes (user_id uuid primary key references auth.users on delete cascade, code text not null unique default public.cs_generate_invite_code() check (code ~ '^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{10}$'), created_at timestamptz not null default now())`, the same generator and check as `cs_team_invites`.
  - `cs_referrals (referee uuid primary key references auth.users on delete cascade, referrer uuid not null references auth.users on delete cascade, claimed_at timestamptz not null default now(), rewarded_at timestamptz, check (referee <> referrer))`
  - RLS on, no policies: only the service role reads and writes. The page gets masked rows from the function.
- Rewards are `cs_credit_ledger` rows with `reason = 'referral'` and refs `referral:<referee>:friend` and `referral:<referee>:referrer`, so the ledger's unique index pays each once.
- Device: `cs-ref` (localStorage, `{ code, at }`), the `cs-join-token` pattern.
- No `content-studio-` keys.

### AI and cost

- No AI call and no Jev question: every check here is a rule.
- New function `supabase/functions/referral` with actions `code` (get or make: insert the row and let the column default draw the code, retried once on a unique clash), `claim` (the checks above, reading the referee's `created_at` with `admin.auth.admin.getUserById`) and `list` (rows with emails masked to the first 2 characters). It answers 404 `not_enabled` unless `leoOnly(user.email)`, through `supabase/functions/_shared/leoOnly.ts` (added by `plan-goal`; add it here if that has not shipped).
- `hub-stripe-webhook`, on a studio `invoice.paid` whose `billing_reason` is `subscription_create` (the first one) for a user with a `cs_referrals` row and no `rewarded_at`: `cs_add_credits` for the friend, and for the referrer only under the monthly cap, then sets `rewarded_at`. This rides on the `studio-plan` route that `business-plans` adds.
- Cap in `usageCaps.ts`: `"referral-claim": 3` per user per day, which also slows anyone guessing codes.
- Cost: the credits given away. At the proposed 4 US cents a credit, 100 credits each way is US$8 of retail credits per paying friend, about US$2.70 at provider cost.

### Deep links

- `/refer`, no state of its own; `/refer#referrals` scrolls to the list.
- `/r/<CODE>` public, read once. Add it to `EXCEPTIONS` in `src/lib/navRoutes.test.ts` with the reason "public referral landing".
- Nav: `{ to: "/refer", label: "Refer and earn", icon: Gift, owners: LEO_EMAILS }` in the home section, `/refer` in the routes list of `src/lib/nav.test.ts`, and Jump to keywords `"/refer": "refer invite friend earn credits"`.
- `links.refer()` and `links.referLink(code)` in `src/lib/links.ts`; rows in `docs/deep-links.md`.

## Done when

- [ ] Leo has approved the reward, the amounts and the migration, and `business-credits` and `business-plans` are live for his accounts.
- [ ] Leo's /refer shows his link; a second test account opened from that link, then signed up and paid in Stripe test mode, gives both accounts their ledger rows once.
- [ ] Opening his own link on his own account and claiming gives "That's your own link." and no row.
- [ ] An account older than 24 hours cannot claim.
- [ ] The 11th paid referral in a month credits the friend and not the referrer.
- [ ] A demo sign-in sees no nav entry and gets 404 at /refer; `/r/<code>` still lands on /auth.
- [ ] Checked by eye at 390 px and 1440 px; `npm run build` and the full `npx vitest run` pass.
- [ ] `src/data/northStar.ts` item `business-referrals` flipped with its `ours` line, in the same commit.

## Tests

- `supabase/functions/referral/logic.test.ts`: `claimCheck` refuses self, an account older than 24 hours, an existing claim and a malformed code; `maskEmail("jane.tan@gmail.com")` gives "ja***@gmail.com"; `rewardRows({ billingReason, rewardedAt, rewardsThisMonth })` gives two rows for a first invoice, none for `subscription_cycle` or an already rewarded referral, and only the friend's row at 10 rewards this month. The webhook calls `rewardRows`, so its rule is tested without a Stripe harness.
- `src/lib/referral.test.ts`: `readRef` ignores a `cs-ref` older than 30 days and a malformed code.
- SQL test: a new `cs_referral_codes` row gets a code that passes its check; `cs_referrals` refuses `referee = referrer`; `authenticated` cannot select either table.

## Open questions

- Leo: credits both ways (this spec) or a cash commission like the unverified Fastlane (30%) and OpusClip (25%) affiliate figures above. Credits mean no payouts to run.
- Leo: the amounts, and whether the friend's credits come at sign-up (more appealing, easier to farm) or at the first payment (this spec).
- Leo: who can refer, everyone or paying accounts only.
- Leo: the monthly cap of 10.

## Related

business-credits, business-plans, business-onboarding, trust-workspaces, agent-activity
