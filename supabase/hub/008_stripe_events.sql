-- Stripe webhook deliveries that hub-stripe-webhook finished processing.
-- Lets the webhook skip duplicate deliveries and shows when events last
-- arrived:  select * from hub_stripe_events order by received_at desc limit 20;
-- No policies: only the service role (the webhook) can read or write it.
-- Idempotent.
create table if not exists public.hub_stripe_events (
  id text primary key,
  type text not null,
  received_at timestamptz not null default now()
);

alter table public.hub_stripe_events enable row level security;
