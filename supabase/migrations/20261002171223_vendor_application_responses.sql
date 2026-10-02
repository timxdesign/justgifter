-- Applicants reply to "needs information" requests from their workspace, with documents stored in
-- the private-evidence bucket under applications/<vendor_id>/. Only the service role reads them,
-- and the admin UI opens them through short-lived signed URLs.
alter table public.vendor_applications add column responses jsonb not null default '[]'::jsonb;
