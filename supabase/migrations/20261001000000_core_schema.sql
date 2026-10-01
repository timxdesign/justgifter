-- JustGifter core schema
-- Money: bigint minor units + explicit currency. Time: timestamptz (UTC). Calendar dates: date.
-- Every table has RLS enabled. Anything not covered by a policy is reachable only through the
-- service role used by Edge Functions, which perform explicit authorisation per request.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- Identity

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null default '',
  email text not null,
  email_verified boolean not null default false,
  roles text[] not null default array['customer'],
  vendor_id text,
  marketing_opt_in boolean not null default false,
  notification_prefs jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint roles_valid check (roles <@ array['customer','vendor_owner','vendor_staff','support','admin'])
);

-- New auth users get a customer profile. Vendor and platform roles are only ever granted by
-- server-side flows (approval, staff invitations), never by a customer account alone (§2).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, name, email_verified)
  values (new.id, lower(new.email), split_part(coalesce(new.email, ''), '@', 1), new.email_confirmed_at is not null)
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- Platform settings

create table public.platform_settings (
  id boolean primary key default true check (id),
  settings jsonb not null,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- Vendors & catalogue

create table public.vendors (
  id text primary key,
  slug text not null unique,
  name text not null,
  tagline text not null default '',
  about text not null default '',
  logo_initials text not null default '',
  logo_color text not null default 'oklch(0.5 0.08 40)',
  cover_image text not null default '',
  status text not null default 'draft' check (status in ('draft','submitted','under_review','needs_information','approved','rejected','suspended')),
  verified boolean not null default false,
  zones jsonb not null default '[]'::jsonb,
  operating jsonb not null,
  fulfilment text not null check (fulfilment in ('vendor_delivery','courier')),
  categories text[] not null default '{}',
  business_type text not null default 'sole_proprietor',
  city text not null default '',
  response_hours int not null default 4,
  suppressed_from_recommendations boolean not null default false,
  featured boolean not null default false,
  joined_at timestamptz not null default now(),
  return_policy text not null default '',
  delivery_policy text not null default ''
);

alter table public.profiles add constraint profiles_vendor_fk foreign key (vendor_id) references public.vendors (id);

create table public.vendor_applications (
  id text primary key,
  vendor_id text not null references public.vendors (id),
  status text not null,
  submitted_at timestamptz,
  reviewer text,
  decision_reason text,
  history jsonb not null default '[]'::jsonb,
  owner_name text not null,
  owner_email text not null,
  owner_phone text not null,
  address text not null,
  payout_bank text not null,
  payout_account_masked text not null,
  terms_accepted_at timestamptz
);

-- Full payout account numbers live apart from everything else and are never exposed to clients.
create table public.vendor_payout_accounts (
  vendor_id text primary key references public.vendors (id),
  bank text not null,
  account_number text not null,
  pending_bank text,
  pending_account_number text,
  pending_requested_at timestamptz
);

create table public.vendor_staff (
  id text primary key,
  vendor_id text not null references public.vendors (id),
  user_id uuid references auth.users (id),
  name text not null,
  email text not null,
  role text not null check (role in ('owner','staff')),
  scopes text[] not null default '{}',
  status text not null default 'invited' check (status in ('active','invited')),
  unique (vendor_id, email)
);

create table public.storefronts (
  id text primary key,
  vendor_id text not null unique references public.vendors (id),
  slug text not null unique,
  status text not null default 'draft' check (status in ('draft','published','paused')),
  headline text not null default '',
  intro text not null default '',
  accent text not null default 'ink',
  layout text not null default 'grid',
  cover_image text not null default '',
  featured_product_ids text[] not null default '{}',
  collections jsonb not null default '[]'::jsonb,
  published_at timestamptz,
  updated_at timestamptz not null default now(),
  slug_history text[] not null default '{}'
);
create index storefront_slug_history_idx on public.storefronts using gin (slug_history);

-- Old slugs keep redirecting and are never reassigned to another store (STF 11).
create or replace function public.guard_storefront_slug() returns trigger language plpgsql as $$
begin
  if exists (select 1 from public.storefronts s where s.id <> new.id and (new.slug = any (s.slug_history) or s.slug = any (new.slug_history))) then
    raise exception 'slug % belongs to another store', new.slug using errcode = 'unique_violation';
  end if;
  return new;
end $$;
create trigger storefront_slug_guard before insert or update on public.storefronts
for each row execute function public.guard_storefront_slug();

create table public.products (
  id text primary key,
  vendor_id text not null references public.vendors (id),
  slug text not null unique,
  title text not null,
  summary text not null default '',
  description text not null default '',
  included text[] not null default '{}',
  dimensions text,
  images text[] not null default '{}',
  category text not null,
  occasions text[] not null default '{}',
  interests text[] not null default '{}',
  status text not null default 'pending_review' check (status in ('draft','pending_review','active','rejected','archived')),
  prep_hours int not null default 4,
  perishable boolean not null default false,
  highly_customised boolean not null default false,
  return_eligible boolean not null default true,
  personalisation jsonb,
  wrapping jsonb not null default '[]'::jsonb,
  sponsored boolean not null default false,
  editorial_score numeric(4,3) not null default 0.6,
  moderation_note text,
  created_at timestamptz not null default now(),
  search tsvector generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(summary, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'C')
  ) stored
);
create index products_search_idx on public.products using gin (search);
create index products_vendor_idx on public.products (vendor_id, status);

create table public.variants (
  id text primary key,
  product_id text not null references public.products (id) on delete cascade,
  name text not null,
  sku text not null default '',
  price bigint not null check (price > 0),
  compare_at_price bigint,
  stock int not null default 0 check (stock >= 0),
  position int not null default 0
);
create index variants_product_idx on public.variants (product_id);

-- ---------------------------------------------------------------- Occasions

create table public.events (
  id text primary key,
  slug text not null unique,
  host_user_id uuid not null references auth.users (id),
  status text not null default 'draft' check (status in ('draft','published','closed','archived')),
  visibility text not null default 'unlisted' check (visibility in ('public','unlisted','private')),
  draft jsonb not null,
  draft_design jsonb not null,
  published jsonb,
  delivery_zone_id text,
  has_delivery_address boolean not null default false,
  surprise_mode boolean not null default false,
  surprise_reveal_date date,
  invite_code_hash text,
  co_hosts jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The host's delivery address is stored separately from publishable content (WIS 02).
create table public.event_addresses (
  event_id text primary key references public.events (id),
  address jsonb not null,
  updated_at timestamptz not null default now()
);

create table public.wishlist_items (
  id text primary key,
  event_id text not null references public.events (id),
  product_id text not null references public.products (id),
  variant_id text not null references public.variants (id),
  desired_qty int not null check (desired_qty between 1 and 10),
  purchased_qty int not null default 0 check (purchased_qty >= 0),
  priority text not null default 'love' check (priority in ('must','love','nice')),
  note text not null default '',
  status text not null default 'active' check (status in ('active','removed','unavailable')),
  alternative_product_ids text[] not null default '{}',
  added_at timestamptz not null default now()
);
create index wishlist_event_idx on public.wishlist_items (event_id);

create table public.stock_holds (
  id text primary key,
  variant_id text not null references public.variants (id),
  wishlist_item_id text references public.wishlist_items (id),
  quantity int not null check (quantity > 0),
  status text not null default 'active' check (status in ('active','converted','released','expired')),
  expires_at timestamptz not null,
  order_id text,
  created_at timestamptz not null default now()
);
create index holds_active_idx on public.stock_holds (variant_id) where status = 'active';
create index holds_wishlist_idx on public.stock_holds (wishlist_item_id) where status = 'active';

-- ---------------------------------------------------------------- Orders & payments

create table public.orders (
  id text primary key,
  reference text not null unique,
  vendor_id text not null references public.vendors (id),
  buyer_user_id uuid references auth.users (id),
  buyer_name text not null,
  buyer_email text not null,
  buyer_phone text,
  source text not null check (source in ('marketplace','wishlist','storefront')),
  storefront_id text references public.storefronts (id),
  campaign text,
  event_id text references public.events (id),          -- no cascade: deleting a page never deletes orders
  wishlist_item_id text references public.wishlist_items (id),
  purchase_type text not null check (purchase_type in ('gift','self')),
  lines jsonb not null,                                   -- immutable commercial snapshot
  pricing jsonb not null,                                 -- immutable price snapshot (minor units)
  status text not null,
  payment_status text not null default 'pending',
  delivery jsonb not null,
  gift_id text,
  accept_by timestamptz,
  timeline jsonb not null default '[]'::jsonb,
  hold_ids text[] not null default '{}',
  commission_bps int not null,
  cancellation_reason text,
  access_token_hash text,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  updated_at timestamptz not null default now()
);
create index orders_vendor_idx on public.orders (vendor_id, created_at desc);
create index orders_buyer_idx on public.orders (buyer_user_id);
create index orders_buyer_email_idx on public.orders (buyer_email);
create index orders_event_idx on public.orders (event_id);

create table public.order_addresses (
  order_id text primary key references public.orders (id),
  address jsonb not null
);

create table public.payments (
  id text primary key,
  order_id text not null references public.orders (id),
  reference text not null unique,
  provider text not null default 'paystack',
  amount bigint not null,
  currency text not null default 'NGN',
  status text not null default 'pending' check (status in ('pending','successful','failed','expired')),
  authorization_url text,
  provider_reference text,
  created_at timestamptz not null default now(),
  verified_at timestamptz,
  expires_at timestamptz not null
);

-- Every provider event id is recorded once; replays are no-ops (PAY 04, AC 03).
create table public.webhook_events (
  id text primary key,
  provider text not null,
  received_at timestamptz not null default now(),
  payload jsonb not null
);

create table public.gifts (
  id text primary key,
  order_id text not null unique references public.orders (id),
  recipient_name text not null,
  recipient_email text,
  recipient_phone text,
  contact_masked text not null,
  sender_display_name text not null default '',
  anonymous boolean not null default false,
  message text not null default '' check (char_length(message) <= 300),
  reveal_style text not null check (reveal_style in ('envelope','wrapped_box')),
  reveal_at timestamptz not null,
  timezone text not null default 'Africa/Lagos',
  reveal_status text not null default 'draft',
  access text not null default 'active',
  claim_status text not null default 'not_required',
  claim_deadline timestamptz,
  token_hash text unique,                 -- sha256 only; the raw token exists solely in the recipient's link
  preview_token_hash text not null,
  preview_token text not null,            -- returned only to the buyer; never activates a claim (MOT 06)
  notified_at timestamptz,
  opened_at timestamptz,
  thank_you_note text,
  thank_you_at timestamptz,
  declined_at timestamptz,
  contact_stopped boolean not null default false,
  reported boolean not null default false,
  wishlist_item_id text
);

create table public.gift_sessions (
  token_hash text primary key,
  gift_id text not null references public.gifts (id),
  expires_at timestamptz not null
);

create table public.revised_quotes (
  order_id text primary key references public.orders (id),
  zone_id text not null,
  fee bigint,
  address jsonb not null
);

create table public.otps (
  id bigint generated always as identity primary key,
  key text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts int not null default 0,
  created_at timestamptz not null default now()
);
create index otps_key_idx on public.otps (key, created_at desc);

create table public.order_access (
  token_hash text primary key,
  email text not null,
  expires_at timestamptz not null
);

-- ---------------------------------------------------------------- Money

create table public.refunds (
  id text primary key,
  order_id text not null references public.orders (id),
  amount bigint not null check (amount > 0),
  currency text not null default 'NGN',
  reason text not null,
  includes_fees boolean not null default true,
  status text not null default 'requested' check (status in ('requested','approved','submitted','completed','failed','rejected')),
  requested_by text not null,
  provider_reference text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Append-only ledger. Corrections are compensating entries (§10).
create table public.ledger_entries (
  id text primary key,
  order_id text references public.orders (id),
  vendor_id text references public.vendors (id),
  type text not null,
  amount bigint not null check (amount >= 0),
  currency text not null default 'NGN',
  idempotency_key text not null unique,
  memo text not null default '',
  created_at timestamptz not null default now()
);
create or replace function public.ledger_append_only() returns trigger language plpgsql as $$
begin
  raise exception 'ledger_entries is append-only';
end $$;
create trigger ledger_no_update before update or delete on public.ledger_entries
for each row execute function public.ledger_append_only();

create table public.payouts (
  id text primary key,
  vendor_id text not null references public.vendors (id),
  amount bigint not null,
  currency text not null default 'NGN',
  status text not null default 'scheduled',
  order_ids text[] not null default '{}',
  scheduled_for date not null,
  created_at timestamptz not null default now()
);

create table public.reconciliation (
  id text primary key,
  provider_reference text not null,
  amount bigint not null,
  status text not null,
  order_reference text,
  occurred_at timestamptz not null,
  note text not null default ''
);

-- ---------------------------------------------------------------- Operations

create table public.support_cases (
  id text primary key,
  order_id text references public.orders (id),
  vendor_id text references public.vendors (id),
  kind text not null,
  status text not null default 'open',
  subject text not null,
  description text not null,
  opened_by text not null,
  owner text,
  evidence text[] not null default '{}',
  resolution text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.content_reports (
  id text primary key,
  kind text not null,
  target_type text not null,
  target_id text not null,
  details text not null default '',
  status text not null default 'open',
  decision text,
  created_at timestamptz not null default now()
);

create table public.audit_events (
  id text primary key,
  at timestamptz not null default now(),
  actor text not null,
  action text not null,
  target_type text not null,
  target_id text not null,
  detail text not null default ''
);
create index audit_at_idx on public.audit_events (at desc);

-- Durable job queue processed by the `jobs` Edge Function on a schedule (§14 Cron and Queues).
create table public.jobs (
  id text primary key,
  kind text not null,
  run_at timestamptz not null,
  status text not null default 'queued' check (status in ('queued','running','done','failed')),
  attempts int not null default 0,
  idempotency_key text not null unique,
  payload jsonb not null default '{}'::jsonb,
  last_error text
);
create index jobs_due_idx on public.jobs (run_at) where status = 'queued';

-- Notification outbox: provider acceptance is recorded, never treated as inbox delivery.
create table public.notifications (
  id text primary key,
  at timestamptz not null default now(),
  channel text not null default 'email',
  recipient text not null,
  subject text not null,
  body text not null,
  link_label text,
  link_href text,
  kind text not null,
  status text not null default 'queued' check (status in ('queued','accepted','failed','suppressed')),
  attempts int not null default 0,
  last_error text
);

create table public.analytics_events (
  id bigint generated always as identity primary key,
  storefront_id text not null,
  vendor_id text not null,
  at timestamptz not null default now(),
  kind text not null check (kind in ('visit','product_view','checkout_start')),
  product_id text
);
create index analytics_vendor_idx on public.analytics_events (vendor_id, at);

create table public.recommendation_sessions (
  id text primary key,
  created_at timestamptz not null default now(),
  model text,
  prompt_version text,
  preferences jsonb not null,           -- structured only; no contacts or addresses (§12)
  retrieved_ids text[] not null default '{}',
  validation jsonb not null default '{}'::jsonb,
  source text not null
);

create table public.recommendation_feedback (
  id bigint generated always as identity primary key,
  session_id text not null,
  product_id text not null,
  helpful boolean not null,
  at timestamptz not null default now()
);

create table public.blocked_contacts (
  contact text primary key,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- Row level security

alter table public.profiles enable row level security;
alter table public.platform_settings enable row level security;
alter table public.vendors enable row level security;
alter table public.vendor_applications enable row level security;
alter table public.vendor_payout_accounts enable row level security;
alter table public.vendor_staff enable row level security;
alter table public.storefronts enable row level security;
alter table public.products enable row level security;
alter table public.variants enable row level security;
alter table public.events enable row level security;
alter table public.event_addresses enable row level security;
alter table public.wishlist_items enable row level security;
alter table public.stock_holds enable row level security;
alter table public.orders enable row level security;
alter table public.order_addresses enable row level security;
alter table public.payments enable row level security;
alter table public.webhook_events enable row level security;
alter table public.gifts enable row level security;
alter table public.gift_sessions enable row level security;
alter table public.revised_quotes enable row level security;
alter table public.otps enable row level security;
alter table public.order_access enable row level security;
alter table public.refunds enable row level security;
alter table public.ledger_entries enable row level security;
alter table public.payouts enable row level security;
alter table public.reconciliation enable row level security;
alter table public.support_cases enable row level security;
alter table public.content_reports enable row level security;
alter table public.audit_events enable row level security;
alter table public.jobs enable row level security;
alter table public.notifications enable row level security;
alter table public.analytics_events enable row level security;
alter table public.recommendation_sessions enable row level security;
alter table public.recommendation_feedback enable row level security;
alter table public.blocked_contacts enable row level security;

-- Helper: vendor organisations the caller belongs to (never trusted from client input, SEC 01).
create or replace function public.my_vendor_ids() returns setof text
language sql stable security definer set search_path = public as $$
  select vendor_id from public.profiles where id = auth.uid() and vendor_id is not null
  union
  select vendor_id from public.vendor_staff where user_id = auth.uid() and status = 'active'
$$;

create policy "own profile" on public.profiles for select using (id = auth.uid());

-- Public catalogue (also used by the Cloudflare Worker for SEO metadata).
create policy "approved vendors are public" on public.vendors for select using (status = 'approved');
create policy "published storefronts are public" on public.storefronts for select using (status = 'published');
create policy "active products are public" on public.products for select
  using (status = 'active' and exists (select 1 from public.vendors v where v.id = vendor_id and v.status = 'approved'));
create policy "variants of public products" on public.variants for select
  using (exists (select 1 from public.products p where p.id = product_id and p.status = 'active'));
create policy "vendors read own catalogue" on public.products for select using (vendor_id in (select public.my_vendor_ids()));

-- Orders: buyers see their own; vendor members see their organisation's (addresses are in a separate table with no client policy).
create policy "buyers read own orders" on public.orders for select using (buyer_user_id = auth.uid());
create policy "vendors read own orders" on public.orders for select using (vendor_id in (select public.my_vendor_ids()) and payment_status = 'successful');

-- Hosts read their own events; public events are read through the API, which strips private fields.
create policy "hosts read own events" on public.events for select using (host_user_id = auth.uid());
create policy "hosts read own wishlist" on public.wishlist_items for select
  using (exists (select 1 from public.events e where e.id = event_id and e.host_user_id = auth.uid()));

-- Everything else (addresses, gifts, payments, ledger, otps, jobs, audit…) has no client policy:
-- only the service role used inside Edge Functions can reach it.
