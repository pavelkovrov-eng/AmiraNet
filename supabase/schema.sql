-- Progress sync for the Amirnet study app.
--
-- Run this in the Supabase SQL editor BEFORE the anon key goes into the app.
-- The key ships inside a public repository, which is how Supabase intends it
-- to be used — but only because row level security decides what that key can
-- reach. Without the policies below, the key would grant anyone who reads the
-- repo full access to this table.
--
-- One row per signed-in person. The whole progress record is stored as JSON
-- rather than shredded into tables: the app already has an export format that
-- every screen agrees on, the device merges it locally with engines/merge.ts,
-- and a single row makes the sync a read-modify-write rather than a schema to
-- keep in step with the client.

create table if not exists public.progress (
  user_id    uuid primary key references auth.users on delete cascade,
  payload    jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.progress enable row level security;

-- Four explicit policies rather than one "for all": a policy that is broader
-- than it needs to be is the kind of thing nobody re-reads later.
create policy "read own progress"
  on public.progress for select
  using (auth.uid() = user_id);

create policy "insert own progress"
  on public.progress for insert
  with check (auth.uid() = user_id);

create policy "update own progress"
  on public.progress for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "delete own progress"
  on public.progress for delete
  using (auth.uid() = user_id);

-- updated_at is what the client uses to tell a stale local copy from a fresh
-- one, so it must not be something the client can forget to set.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists progress_touch_updated_at on public.progress;
create trigger progress_touch_updated_at
  before update on public.progress
  for each row execute function public.touch_updated_at();
