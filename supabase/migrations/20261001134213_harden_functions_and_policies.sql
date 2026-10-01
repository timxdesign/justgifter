-- Resolves the Supabase database advisor warnings raised after the first deploy.

-- 1. Pin search_path on every function (lint 0011). `extensions` holds pgcrypto on Supabase.
do $$
declare f regprocedure;
begin
  for f in
    select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in (
      'sellable_units', 'wishlist_remaining', 'create_stock_hold', 'commit_verified_payment',
      'restock_order', 'expire_holds_and_payments', 'claim_due_jobs',
      'guard_storefront_slug', 'ledger_append_only')
  loop
    execute format('alter function %s set search_path = public, extensions, pg_temp', f);
  end loop;
end $$;

revoke all on function public.sellable_units(text, text) from public, anon, authenticated;
revoke all on function public.wishlist_remaining(text, text) from public, anon, authenticated;

-- 2. The signup trigger runs as its owner; nobody should call it through /rest/v1/rpc.
revoke all on function public.handle_new_user() from public, anon, authenticated;

-- 3. my_vendor_ids is SECURITY DEFINER (it reads profiles/vendor_staff under RLS), so move it to
--    a schema the Data API does not expose. Policies that use it are recreated below.
drop policy "vendors read own catalogue" on public.products;
drop policy "active products are public" on public.products;
drop policy "vendors read own orders" on public.orders;
drop policy "buyers read own orders" on public.orders;
drop function public.my_vendor_ids();

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create function private.my_vendor_ids() returns setof text
language sql stable security definer set search_path = '' as $$
  select vendor_id from public.profiles where id = (select auth.uid()) and vendor_id is not null
  union
  select vendor_id from public.vendor_staff where user_id = (select auth.uid()) and status = 'active'
$$;
revoke all on function private.my_vendor_ids() from public, anon;
grant execute on function private.my_vendor_ids() to authenticated;

-- 4. One permissive SELECT policy per role and action, with auth.uid() evaluated once per query.
create policy "active products are public" on public.products for select to anon
  using (status = 'active' and exists (select 1 from public.vendors v where v.id = vendor_id and v.status = 'approved'));
create policy "active or own products" on public.products for select to authenticated
  using (
    (status = 'active' and exists (select 1 from public.vendors v where v.id = vendor_id and v.status = 'approved'))
    or vendor_id in (select private.my_vendor_ids())
  );

create policy "buyers and vendors read their orders" on public.orders for select to authenticated
  using (
    buyer_user_id = (select auth.uid())
    or (vendor_id in (select private.my_vendor_ids()) and payment_status = 'successful')
  );

alter policy "own profile" on public.profiles to authenticated using (id = (select auth.uid()));
alter policy "hosts read own events" on public.events to authenticated using (host_user_id = (select auth.uid()));
alter policy "hosts read own wishlist" on public.wishlist_items to authenticated
  using (exists (select 1 from public.events e where e.id = event_id and e.host_user_id = (select auth.uid())));
