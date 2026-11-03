-- Saved wish translations (filled in by the translate-wish Edge Function).
-- Paste into Supabase > SQL Editor > New query > Run (nothing highlighted). Safe to re-run.
alter table public.wishes add column if not exists message_en text;
alter table public.wishes add column if not exists message_pt text;
-- Visitors may read the saved translations, but never write them.
grant select (message_en, message_pt) on public.wishes to anon;
