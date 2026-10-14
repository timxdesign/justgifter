-- Digital letters (send-gift assistant). A letter is either sent on its own (this table) or carried
-- by a gift as its message, so the gift message limit grows to the letter limit.
--
-- Only the service role (the `api` Edge Function and the jobs worker) reads or writes letters. The
-- reading link is a random token emailed to the recipient; only its sha256 is stored, and it is
-- minted when the letter is sent, so a cancelled letter never had a working link.

alter table public.gifts drop constraint if exists gifts_message_check;
alter table public.gifts add constraint gifts_message_check check (char_length(message) <= 2000);

create table public.letters (
  id text primary key,
  sender_user_id uuid not null references auth.users (id) on delete cascade,
  sender_email text not null,
  sender_display_name text not null check (char_length(sender_display_name) between 1 and 60),
  recipient_name text not null check (char_length(recipient_name) between 1 and 80),
  recipient_email text not null,
  contact_masked text not null,
  occasion text,
  tone text check (tone in ('heartfelt', 'romantic', 'playful', 'appreciative', 'formal')),
  body text not null check (char_length(body) between 1 and 2000),
  send_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'sent', 'opened', 'cancelled', 'failed')),
  token_hash text unique,
  client_ref text not null,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  opened_at timestamptz,
  cancelled_at timestamptz,
  reported boolean not null default false,
  unique (sender_user_id, client_ref)
);

create index letters_sender_idx on public.letters (sender_user_id, created_at desc);

alter table public.letters enable row level security;
revoke all on public.letters from anon, authenticated;
