-- Public media buckets for product and storefront images. Uploads go through signed URLs issued
-- by the API after a vendor-scope check; files are re-encoded client-side (EXIF stripped).
-- Private evidence, identity documents and gift media use the private bucket with signed reads.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('product-media', 'product-media', true, 8388608, array['image/webp','image/jpeg','image/png']),
  ('storefront-media', 'storefront-media', true, 8388608, array['image/webp','image/jpeg','image/png']),
  ('private-evidence', 'private-evidence', false, 10485760, array['image/webp','image/jpeg','image/png','application/pdf'])
on conflict (id) do nothing;
