-- Indian mobile number on the customer row: 10 digits starting 6-9, stored without +91.
alter table public.customers add constraint customers_phone_in check (phone is null or phone ~ '^[6-9][0-9]{9}$');
create function public.set_my_phone(p_phone text) returns void language plpgsql security definer set search_path = public as $$
declare d text := regexp_replace(coalesce(p_phone,''), '\D', '', 'g');
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if length(d) = 12 and left(d,2) = '91' then d := substr(d,3); end if;
  if d !~ '^[6-9][0-9]{9}$' then raise exception 'invalid Indian mobile number'; end if;
  update public.customers set phone = d where id = auth.uid();
end $$;
revoke all on function public.set_my_phone(text) from public, anon;
grant execute on function public.set_my_phone(text) to authenticated;
