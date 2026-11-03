-- Baby site: wishes table + Row Level Security
-- Paste into Supabase > SQL Editor > New query > Run. Safe to re-run.

create table if not exists public.wishes (
  id          bigint generated always as identity primary key,
  name        text not null check (char_length(btrim(name)) between 1 and 60),
  message     text not null check (char_length(btrim(message)) between 1 and 1000),
  created_at  timestamptz not null default now(),
  hidden      boolean not null default false
);

alter table public.wishes enable row level security;

-- Visitors (the "anon" role) get the bare minimum:
--   * read name/message/date of wishes that are not hidden
--   * add a new wish (name + message only; they can't set hidden/created_at)
--   * no update, no delete
revoke all on public.wishes from anon, authenticated;
grant select (id, name, message, created_at) on public.wishes to anon;
grant insert (name, message) on public.wishes to anon;

drop policy if exists "anyone can read visible wishes" on public.wishes;
create policy "anyone can read visible wishes"
  on public.wishes for select to anon
  using (hidden = false);

drop policy if exists "anyone can add a wish" on public.wishes;
create policy "anyone can add a wish"
  on public.wishes for insert to anon
  with check (hidden = false);

-- Flood guard: max 20 wishes per 10 minutes site-wide, and no exact duplicate
-- from the same name within 10 minutes. Stops bots/double-taps, not real family.
create or replace function public.wishes_flood_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.wishes where created_at > now() - interval '10 minutes') >= 20 then
    raise exception 'Too many wishes right now, please try again shortly';
  end if;
  if exists (select 1 from public.wishes
             where name = new.name and message = new.message
               and created_at > now() - interval '10 minutes') then
    raise exception 'Duplicate wish';
  end if;
  return new;
end $$;

drop trigger if exists wishes_flood_guard on public.wishes;
create trigger wishes_flood_guard before insert on public.wishes
  for each row execute function public.wishes_flood_guard();

create index if not exists wishes_created_at_idx on public.wishes (created_at desc);
