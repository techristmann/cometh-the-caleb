-- Birth-time guesses: separate from Say Hello comments, one guess per name.
-- Paste into Supabase > SQL Editor > New query > Run. Safe to re-run.
-- Needs supabase/admin.sql to have been run (for deleting guesses from the Post page).
-- Guesses are plain text "YYYY-MM-DDTHH:MM" in Arkansas time, so they never shift by time zone.

-- Clean up the earlier "guess on a comment" idea, if it was ever run.
alter table public.wishes drop column if exists guess;

create table if not exists public.guesses (
  id          bigint generated always as identity primary key,
  name        text not null check (char_length(btrim(name)) between 1 and 60),
  guess       text not null check (guess ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$'),
  created_at  timestamptz not null default now()
);

-- One guess per person: "Kara", "kara " and "KARA" count as the same name.
create unique index if not exists guesses_one_per_name on public.guesses (lower(btrim(name)));

alter table public.guesses enable row level security;
revoke all on public.guesses from anon, authenticated;
grant select (id, name, guess, created_at) on public.guesses to anon;
grant insert (name, guess) on public.guesses to anon;

drop policy if exists "anyone can read guesses" on public.guesses;
create policy "anyone can read guesses" on public.guesses for select to anon using (true);

drop policy if exists "anyone can add a guess" on public.guesses;
create policy "anyone can add a guess" on public.guesses for insert to anon with check (true);

-- Flood guard: max 30 guesses per 10 minutes site-wide.
create or replace function public.guesses_flood_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.guesses where created_at > now() - interval '10 minutes') >= 30 then
    raise exception 'Too many guesses right now, please try again shortly';
  end if;
  return new;
end $$;

drop trigger if exists guesses_flood_guard on public.guesses;
create trigger guesses_flood_guard before insert on public.guesses
  for each row execute function public.guesses_flood_guard();

-- Delete a guess from the Post page (same passphrase as deleting comments).
create or replace function public.delete_guess(p_id bigint, p_pass text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not public.wish_admin_ok(p_pass) then
    perform pg_sleep(1);
    raise exception 'Wrong passphrase';
  end if;
  delete from public.guesses where id = p_id;
  return found;
end $$;

revoke all on function public.delete_guess(bigint, text) from public;
grant execute on function public.delete_guess(bigint, text) to anon;
