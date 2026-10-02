-- Invitations to the operations team. An admin invites an email address with a role; the role is
-- granted the first time that address signs in with a verified email (see getSession), never
-- through client input. Only the service role (Edge Functions) reads or writes this table.
create table public.platform_invites (
  id text primary key,
  email text not null,
  role text not null check (role in ('admin', 'support')),
  invited_by text not null,
  note text,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  responded_at timestamptz
);

create unique index platform_invites_one_pending on public.platform_invites (email) where status = 'pending';

alter table public.platform_invites enable row level security;
revoke all on public.platform_invites from anon, authenticated;
