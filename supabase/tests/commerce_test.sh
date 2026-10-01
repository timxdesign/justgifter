#!/usr/bin/env bash
# Database-level checks for AC 02, AC 03 and AC 19. Usage: PSQL="psql <conn>" ./supabase/tests/commerce_test.sh
set -euo pipefail
PSQL=${PSQL:-"psql -U postgres"}
run() { $PSQL -v ON_ERROR_STOP=1 -tAq -c "$1"; }

run "update variants set stock = 1 where id = 'prd_espresso_v1'; delete from stock_holds where variant_id = 'prd_espresso_v1';"

# AC 19: two concurrent checkouts for the final unit — exactly one hold may succeed.
( run "begin; select create_stock_hold('h_a','prd_espresso_v1',1,null,10); select pg_sleep(1); commit;" >/dev/null 2>&1 && echo A_OK || echo A_FAIL ) &
( sleep 0.2; run "select create_stock_hold('h_b','prd_espresso_v1',1,null,10);" >/dev/null 2>&1 && echo B_OK || echo B_FAIL ) &
wait
holds=$(run "select count(*) from stock_holds where variant_id='prd_espresso_v1' and status='active'")
[ "$holds" = "1" ] && echo "PASS AC19: one active hold" || { echo "FAIL AC19: $holds holds"; exit 1; }

# AC 03 / AC 21: replayed webhook commits stock exactly once.
run "insert into orders (id, reference, vendor_id, buyer_name, buyer_email, source, purchase_type, lines, pricing, status, delivery, commission_bps, hold_ids)
     values ('o_t','JG-TEST-0001','ven_nest','T','t@example.com','marketplace','self','[{\"variantId\":\"prd_espresso_v1\",\"quantity\":1}]','{\"total\":38000000}','awaiting_payment','{}',1000, array['h_a'])
     on conflict do nothing;
     insert into payments (id, order_id, reference, amount, expires_at) values ('p_t','o_t','JG-TEST-0001',38000000, now() + interval '10 minutes') on conflict do nothing;"
r1=$(run "select commit_verified_payment('evt_1','paystack','{}','JG-TEST-0001',38000000)")
r2=$(run "select commit_verified_payment('evt_1','paystack','{}','JG-TEST-0001',38000000)")
r3=$(run "select commit_verified_payment('evt_2','paystack','{}','JG-TEST-0001',38000000)")
stock=$(run "select stock from variants where id='prd_espresso_v1'")
[ "$r1" = "committed" ] && [ "$r2" = "duplicate" ] && [ "$r3" = "duplicate" ] && [ "$stock" = "0" ] && echo "PASS AC03: committed once (stock=$stock)" || { echo "FAIL AC03: $r1 $r2 $r3 stock=$stock"; exit 1; }

# Ledger is append-only.
run "insert into ledger_entries (id, type, amount, idempotency_key) values ('l_t','charge',1,'k_t') on conflict do nothing"
if run "update ledger_entries set amount = 2 where id = 'l_t'" 2>/dev/null; then echo "FAIL ledger mutable"; exit 1; else echo "PASS ledger is append-only"; fi
echo "ALL DATABASE CHECKS PASSED"
