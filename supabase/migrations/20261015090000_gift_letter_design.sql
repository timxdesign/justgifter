-- A gift's message can be a designed letter, chosen in the send studio: the same look as a letter
-- on its own (theme, flowers, light, details). Validated by domain/letter-studio.ts before writing;
-- null means the message shows as plain text, as before.
alter table public.gifts
  add column letter_design jsonb check (letter_design is null or jsonb_typeof(letter_design) = 'object');
