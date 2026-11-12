-- Postmosis paid sign-up (docs/postmosis-billing.md). Run by hand, after 034. Nothing reads these until the
-- postmosis-start, postmosis-webhook and postmosis-portal functions are deployed and switched on.
--
--   cs_subscriptions          one row per account that came in through Stripe Checkout (or was given a row by
--                             hand). An account with NO row is grandfathered: full access, never gated.
--   cs_held_checkouts         paid checkouts that were NOT attached to an account: the email belongs to an account
--                             with no subscription row (the payer has not proved the inbox is theirs), or to
--                             one whose own subscription still gives access. They gate nobody. The owner
--                             attaches or refunds each by hand:  select * from cs_held_checkouts where resolved_at is null;
--   cs_subscription_events    Stripe event ids the webhook finished (a repeat delivery is skipped).
--   cs_account_for_email      the account an email belongs to, and the subscription that created it, if one
--                             did. Reads auth.users, so service_role only.
--
-- Grants:
--   cs_subscriptions: revoke all from public, anon, authenticated; grant select to authenticated (own row, by
--   policy); select, insert, update, delete to service_role.
--   cs_held_checkouts, cs_subscription_events: no policy and no grant but service_role's.
--   cs_account_for_email: revoke all from public, anon, authenticated; execute to service_role.
--
-- Does not touch auth.users, its trigger (handle_new_user) or any existing table.
-- Idempotent: safe to run again. One transaction; lock_timeout gives up after 3 seconds.

begin;
set local lock_timeout = '3s';

create table if not exists public.cs_subscriptions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  -- Stripe's own subscription status, as is (trialing, active, past_due, canceled, unpaid, incomplete,
  -- incomplete_expired, paused), or 'comp' for a free account given by hand. The access rule is in
  -- supabase/functions/_shared/subscription.ts.
  status text not null check (char_length(status) between 1 and 40),
  stripe_customer_id text,
  stripe_subscription_id text,
  trial_end timestamptz,
  current_period_end timestamptz,
  -- they cancelled in the portal: access runs to the period's (or trial's) end and no charge follows
  cancel_at_period_end boolean not null default false,
  -- when the status became past_due: the grace period counts from here
  past_due_since timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cs_subscriptions_stripe_sub on public.cs_subscriptions (stripe_subscription_id);

alter table public.cs_subscriptions enable row level security;
revoke all on table public.cs_subscriptions from public, anon, authenticated;
grant select on table public.cs_subscriptions to authenticated;
grant select, insert, update, delete on table public.cs_subscriptions to service_role;
drop policy if exists cs_subscriptions_own on public.cs_subscriptions;
create policy cs_subscriptions_own on public.cs_subscriptions for select to authenticated using (user_id = (select auth.uid()));

create table if not exists public.cs_held_checkouts (
  stripe_subscription_id text primary key,
  stripe_customer_id text not null,
  email text not null,
  -- Stripe's status for it, kept in step by the webhook: still paid for, or already cancelled
  status text not null,
  reason text not null check (reason in ('account_without_subscription', 'second_subscription')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- set by hand once it has been attached or refunded
  resolved_at timestamptz,
  note text
);

alter table public.cs_held_checkouts enable row level security;
revoke all on table public.cs_held_checkouts from public, anon, authenticated;
grant select, insert, update, delete on table public.cs_held_checkouts to service_role;

create table if not exists public.cs_subscription_events (
  id text primary key,
  type text not null,
  received_at timestamptz not null default now()
);

alter table public.cs_subscription_events enable row level security;
revoke all on table public.cs_subscription_events from public, anon, authenticated;
grant select, insert, delete on table public.cs_subscription_events to service_role;

-- The account an email belongs to (case and outer spaces ignored), with the Stripe subscription id stamped on it
-- when postmosis-start or postmosis-webhook created it. No row: nobody has that email.
create or replace function public.cs_account_for_email(p_email text)
returns table (user_id uuid, made_by text)
language sql stable security definer set search_path = '' as $$
  select u.id, u.raw_app_meta_data ->> 'postmosis_subscription'
  from auth.users u
  where lower(u.email) = lower(trim(p_email))
  order by u.created_at
  limit 1
$$;

revoke all on function public.cs_account_for_email(text) from public, anon, authenticated;
grant execute on function public.cs_account_for_email(text) to service_role;

commit;
