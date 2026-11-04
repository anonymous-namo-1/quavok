-- Quavok accounts + billing. Customers can only READ their own rows; all writes come from
-- edge functions using the service role (which bypasses RLS).
create table public.customers (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null, name text, phone text, business_name text,
  created_at timestamptz not null default now()
);
create table public.subscriptions (
  id text primary key,                      -- our subscription_id sent to Cashfree
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_key text not null, plan_name text not null, amount_paise int not null,
  status text not null default 'INITIALIZED', -- mirrors Cashfree subscription_status
  cf_subscription_id text, next_charge_date date,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.payments (
  id text primary key,                      -- order_id or cf_payment_id
  user_id uuid references auth.users(id) on delete set null,
  subscription_id text references public.subscriptions(id),
  kind text not null check (kind in ('order','subscription')),
  plan_key text, amount_paise int not null, status text not null default 'PENDING',
  raw jsonb, created_at timestamptz not null default now()
);
create table public.invoices (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  number text unique not null,              -- QV/2026-27/NNN
  amount_paise int not null, status text not null default 'paid',
  pdf_url text, payment_id text references public.payments(id),
  issued_at timestamptz not null default now()
);
create table public.webhook_events (
  id bigint generated always as identity primary key,
  event_type text, payload jsonb not null, received_at timestamptz not null default now()
);
alter table public.customers enable row level security;
alter table public.subscriptions enable row level security;
alter table public.payments enable row level security;
alter table public.invoices enable row level security;
alter table public.webhook_events enable row level security; -- no policies = no client access
create policy "own customer row" on public.customers for select using (auth.uid() = id);
create policy "own subscriptions" on public.subscriptions for select using (auth.uid() = user_id);
create policy "own payments" on public.payments for select using (auth.uid() = user_id);
create policy "own invoices" on public.invoices for select using (auth.uid() = user_id);
-- auto-create customer row on sign-up
create function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin insert into public.customers (id, email) values (new.id, new.email) on conflict do nothing; return new; end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
