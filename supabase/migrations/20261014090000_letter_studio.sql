-- Letter studio: a letter gets a design (theme, flowers, light) and optional moments (reasons,
-- story, photos, a special date, places, wishes, a song), and can be shared by link instead of
-- email. Both columns are validated by the `api` Edge Function (domain/letter-studio.ts) before
-- they're written; the checks here are backstops on shape and size.
--
-- Link letters have no recipient email. Their token is minted at creation (hash stored only) and
-- shown to the sender once; before `send_at` the link shows a sealed envelope.

alter table public.letters
  add column delivery text not null default 'email' check (delivery in ('email', 'link')),
  add column design jsonb not null default '{}'::jsonb check (jsonb_typeof(design) = 'object'),
  add column moments jsonb not null default '{}'::jsonb check (jsonb_typeof(moments) = 'object' and pg_column_size(moments) <= 65536),
  alter column recipient_email drop not null,
  add constraint letters_recipient_email_required check (delivery = 'link' or recipient_email is not null);

-- Photos in letters. Private: uploads use signed upload URLs issued to verified senders, reads use
-- short-lived signed URLs issued when the recipient opens the letter. No client policies.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('letter-media', 'letter-media', false, 8388608, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;
