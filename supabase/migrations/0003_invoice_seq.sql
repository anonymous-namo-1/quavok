-- Race-safe invoice numbers: one counter row per financial year, incremented under a row lock
-- by an upsert. Idempotent per payment (unique payment_id), so webhook retries don't duplicate.
create table if not exists public.invoice_counters (fy text primary key, last_no int not null default 0);
alter table public.invoice_counters enable row level security;
alter table public.invoices add constraint invoices_payment_unique unique (payment_id);
create function public.issue_invoice(p_user uuid, p_amount int, p_payment text) returns text
language plpgsql security definer set search_path = public as $$
declare n int; v_fy text; d date := (now() at time zone 'Asia/Kolkata')::date; num text;
begin
  select number into num from invoices where payment_id = p_payment; if found then return num; end if;
  v_fy := case when extract(month from d) >= 4 then extract(year from d)::int else extract(year from d)::int - 1 end || '-' ||
        lpad(((case when extract(month from d) >= 4 then extract(year from d)::int else extract(year from d)::int - 1 end + 1) % 100)::text, 2, '0');
  insert into invoice_counters (fy, last_no) values (v_fy, 1)
    on conflict (fy) do update set last_no = invoice_counters.last_no + 1   -- row lock serialises concurrent callers
    returning last_no into n;
  num := 'QV/' || v_fy || '/' || lpad(n::text, 3, '0');
  insert into invoices (user_id, number, amount_paise, payment_id) values (p_user, num, p_amount, p_payment);
  return num;
exception when unique_violation then
  select number into num from invoices where payment_id = p_payment; return num;
end $$;
revoke all on function public.issue_invoice(uuid,int,text) from public, anon, authenticated;
