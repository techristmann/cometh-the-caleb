-- Lets the private /post/ page delete wishes, protected by a passphrase.
-- Paste into Supabase > SQL Editor > New query > Run. Safe to re-run.
-- Then set your passphrase with the one line at the bottom (in a separate query).

create table if not exists public.wish_admin (
  id        int primary key default 1 check (id = 1),
  pass_hash text not null
);
alter table public.wish_admin enable row level security;   -- no policies: nobody can read it from the site
revoke all on public.wish_admin from anon, authenticated;

create or replace function public.wish_admin_ok(p_pass text)
returns boolean language sql security definer set search_path = public as $$
  select coalesce(char_length(p_pass) >= 12, false)
     and exists (select 1 from public.wish_admin
                 where pass_hash = encode(sha256(convert_to(p_pass, 'UTF8')), 'hex'));
$$;

create or replace function public.check_wish_admin(p_pass text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not public.wish_admin_ok(p_pass) then perform pg_sleep(1); return false; end if;
  return true;
end $$;

create or replace function public.delete_wish(p_id bigint, p_pass text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not public.wish_admin_ok(p_pass) then
    perform pg_sleep(1);
    raise exception 'Wrong passphrase';
  end if;
  delete from public.wishes where id = p_id;
  return found;
end $$;

revoke all on function public.wish_admin_ok(text) from public, anon, authenticated;
revoke all on function public.check_wish_admin(text) from public;
revoke all on function public.delete_wish(bigint, text) from public;
grant execute on function public.check_wish_admin(text) to anon;
grant execute on function public.delete_wish(bigint, text) to anon;

-- ── Set (or change) your passphrase: run this line on its own, with your own
--    passphrase of at least 12 characters (e.g. four random words). ──
-- insert into public.wish_admin (id, pass_hash) values (1, encode(sha256(convert_to('YOUR PASSPHRASE HERE', 'UTF8')), 'hex')) on conflict (id) do update set pass_hash = excluded.pass_hash;
