-- Atomic commerce operations. Realtime notifications are not locks (§14): every decision that
-- touches shared stock or wishlist quantity happens here, under row locks, in one transaction.
-- These functions are executable only by the service role (Edge Functions).

-- Sellable units of a variant = stock − active, unexpired holds (excluding one hold, if given).
create or replace function public.sellable_units(p_variant text, p_exclude_hold text default null)
returns int language sql stable as $$
  select greatest(0, v.stock - coalesce((
    select sum(h.quantity) from public.stock_holds h
    where h.variant_id = v.id and h.status = 'active' and h.expires_at > now()
      and (p_exclude_hold is null or h.id <> p_exclude_hold)
  ), 0))::int
  from public.variants v where v.id = p_variant
$$;

create or replace function public.wishlist_remaining(p_item text, p_exclude_hold text default null)
returns int language sql stable as $$
  select greatest(0, w.desired_qty - w.purchased_qty - coalesce((
    select sum(h.quantity) from public.stock_holds h
    where h.wishlist_item_id = w.id and h.status = 'active' and h.expires_at > now()
      and (p_exclude_hold is null or h.id <> p_exclude_hold)
  ), 0))::int
  from public.wishlist_items w where w.id = p_item
$$;

-- AC 02 / AC 19: lock the variant (and wishlist item) rows, re-check, then insert the hold.
-- Two concurrent callers serialise on the row lock; the second sees the first one's hold.
create or replace function public.create_stock_hold(
  p_hold_id text, p_variant text, p_quantity int, p_wishlist_item text, p_minutes int
) returns timestamptz language plpgsql as $$
declare
  v_expires timestamptz := now() + make_interval(mins => p_minutes);
begin
  perform 1 from public.variants where id = p_variant for update;
  if not found then raise exception 'variant_not_found' using errcode = 'P0002'; end if;
  if p_wishlist_item is not null then
    perform 1 from public.wishlist_items where id = p_wishlist_item and status = 'active' for update;
    if not found then raise exception 'wishlist_item_unavailable' using errcode = 'P0001'; end if;
    if public.wishlist_remaining(p_wishlist_item) < p_quantity then
      raise exception 'wishlist_held' using errcode = 'P0001';
    end if;
  end if;
  if public.sellable_units(p_variant) < p_quantity then
    raise exception 'insufficient_stock' using errcode = 'P0001';
  end if;
  insert into public.stock_holds (id, variant_id, wishlist_item_id, quantity, expires_at)
  values (p_hold_id, p_variant, p_wishlist_item, p_quantity, v_expires);
  return v_expires;
end $$;

-- Verified payment (PAY 04, AC 03, AC 05, AC 21). Idempotent on the provider event id, and on the
-- payment itself. Returns 'committed', 'duplicate' or 'conflict' (late payment after the hold
-- lapsed with no units left — recorded as paid and escalated, never oversold).
create or replace function public.commit_verified_payment(
  p_event_id text, p_provider text, p_payload jsonb, p_reference text, p_amount bigint
) returns text language plpgsql as $$
declare
  v_payment public.payments%rowtype;
  v_order public.orders%rowtype;
  v_line jsonb;
  v_hold public.stock_holds%rowtype;
  v_conflict boolean := false;
  v_lapsed boolean := false;
begin
  insert into public.webhook_events (id, provider, payload) values (p_event_id, p_provider, p_payload)
  on conflict (id) do nothing;
  if not found then return 'duplicate'; end if;

  select * into v_payment from public.payments where reference = p_reference for update;
  if not found then
    insert into public.reconciliation (id, provider_reference, amount, status, order_reference, occurred_at, note)
    values ('rec_' || encode(gen_random_bytes(8), 'hex'), p_reference, p_amount, 'unmatched', null, now(), 'Payment with no matching attempt');
    return 'unmatched';
  end if;
  if v_payment.status = 'successful' then return 'duplicate'; end if;
  if v_payment.amount <> p_amount then
    insert into public.reconciliation (id, provider_reference, amount, status, order_reference, occurred_at, note)
    values ('rec_' || encode(gen_random_bytes(8), 'hex'), p_reference, p_amount, 'amount_mismatch', p_reference, now(), 'Verified amount differs from the order total');
    return 'amount_mismatch';
  end if;

  select * into v_order from public.orders where id = v_payment.order_id for update;

  update public.payments set status = 'successful', verified_at = now() where id = v_payment.id;

  -- Lock every variant on the order in a stable order to avoid deadlocks.
  perform 1 from public.variants where id in (select l->>'variantId' from jsonb_array_elements(v_order.lines) l) order by id for update;

  select exists (select 1 from public.stock_holds h where h.id = any (v_order.hold_ids) and (h.status <> 'active' or h.expires_at <= now()))
    into v_lapsed;
  v_lapsed := v_lapsed or v_order.status = 'payment_expired';

  if v_lapsed then
    for v_line in select * from jsonb_array_elements(v_order.lines) loop
      if public.sellable_units(v_line->>'variantId') < (v_line->>'quantity')::int then v_conflict := true; end if;
      if v_order.wishlist_item_id is not null and public.wishlist_remaining(v_order.wishlist_item_id) < (v_line->>'quantity')::int then v_conflict := true; end if;
    end loop;
  end if;

  if v_conflict then
    update public.stock_holds set status = 'released' where id = any (v_order.hold_ids) and status = 'active';
    update public.orders set status = 'paid', payment_status = 'successful', paid_at = now(), updated_at = now(),
      timeline = timeline || jsonb_build_object('at', now(), 'status', 'paid', 'label', 'Payment confirmed', 'actor', 'system',
        'note', 'Paid after the item was reserved by someone else — support will contact you.')
    where id = v_order.id;
    return 'conflict';
  end if;

  for v_line in select * from jsonb_array_elements(v_order.lines) loop
    update public.variants set stock = stock - (v_line->>'quantity')::int where id = v_line->>'variantId';
  end loop;
  update public.stock_holds set status = 'converted' where id = any (v_order.hold_ids);
  if v_order.wishlist_item_id is not null then
    update public.wishlist_items set purchased_qty = purchased_qty + (v_order.lines->0->>'quantity')::int where id = v_order.wishlist_item_id;
  end if;
  update public.orders set status = 'paid', payment_status = 'successful', paid_at = now(), updated_at = now(),
    timeline = timeline || jsonb_build_object('at', now(), 'status', 'paid', 'label', 'Payment confirmed', 'actor', 'system')
  where id = v_order.id;
  return 'committed';
end $$;

-- Cancellation before dispatch: restock and restore wishlist quantity (only if still wanted).
create or replace function public.restock_order(p_order text) returns void language plpgsql as $$
declare v_order public.orders%rowtype; v_line jsonb;
begin
  select * into v_order from public.orders where id = p_order for update;
  if v_order.payment_status <> 'successful' then return; end if;
  for v_line in select * from jsonb_array_elements(v_order.lines) loop
    update public.variants set stock = stock + (v_line->>'quantity')::int where id = v_line->>'variantId';
  end loop;
  if v_order.wishlist_item_id is not null then
    update public.wishlist_items set purchased_qty = greatest(0, purchased_qty - (v_order.lines->0->>'quantity')::int)
    where id = v_order.wishlist_item_id and status = 'active';
  end if;
end $$;

create or replace function public.expire_holds_and_payments() returns int language plpgsql as $$
declare n int;
begin
  update public.stock_holds set status = 'expired' where status = 'active' and expires_at <= now();
  get diagnostics n = row_count;
  update public.payments set status = 'expired' where status = 'pending' and expires_at <= now();
  update public.orders o set status = 'payment_expired', payment_status = 'expired', updated_at = now()
  where o.status = 'awaiting_payment' and exists (select 1 from public.payments p where p.order_id = o.id and p.status in ('expired','failed') and p.expires_at <= now());
  update public.gifts g set access = 'revoked' from public.orders o where g.order_id = o.id and o.status = 'payment_expired' and g.access = 'active';
  return n;
end $$;

-- Claim the next batch of due jobs without double-processing across concurrent workers.
create or replace function public.claim_due_jobs(p_limit int) returns setof public.jobs language sql as $$
  update public.jobs set status = 'running', attempts = attempts + 1
  where id in (select id from public.jobs where status = 'queued' and run_at <= now() order by run_at limit p_limit for update skip locked)
  returning *
$$;

revoke all on function public.create_stock_hold(text, text, int, text, int) from public, anon, authenticated;
revoke all on function public.commit_verified_payment(text, text, jsonb, text, bigint) from public, anon, authenticated;
revoke all on function public.restock_order(text) from public, anon, authenticated;
revoke all on function public.expire_holds_and_payments() from public, anon, authenticated;
revoke all on function public.claim_due_jobs(int) from public, anon, authenticated;
