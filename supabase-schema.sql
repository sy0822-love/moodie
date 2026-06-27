create table if not exists public.diary_entries (
  id text primary key,
  sync_key text not null,
  created_at timestamptz not null,
  payload jsonb not null
);

create index if not exists diary_entries_sync_key_created_at_idx
  on public.diary_entries (sync_key, created_at desc);

alter table public.diary_entries enable row level security;

-- This app writes through the server using SUPABASE_SERVICE_ROLE_KEY.
-- Do not expose the service role key in frontend code.
