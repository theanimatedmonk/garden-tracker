-- Wildlife Observer — Supabase schema.
-- Paste into the Supabase dashboard → SQL Editor → Run. Safe to run again.
--
-- Only the backend talks to Supabase, with the project's secret (service-role) key, which
-- bypasses row-level security. RLS is enabled with no policies, so the public (anon) key can
-- read or write nothing.

-- Every logged BirdNET match (up to the top 5 species per 3 s segment).
create table if not exists public.detections (
  id              uuid primary key,
  species         text not null,
  scientific_name text,
  confidence      real not null,
  "timestamp"     timestamptz not null,
  -- Object key in the "recordings" Storage bucket (e.g. 2026/10/08/<segment>.mp3), or a local
  -- path for clips that haven't been uploaded. Several species from one segment share a clip.
  audio_path      text not null,
  source_device   text not null,
  model           text not null,
  surfaced        boolean not null default false,
  image_url       text,
  created_at      timestamptz not null default now()
);

create index if not exists detections_timestamp_idx on public.detections ("timestamp" desc);
create index if not exists detections_species_idx on public.detections (species);
create index if not exists detections_audio_path_idx on public.detections (audio_path);

-- Moments JEV decided were worth surfacing ("Bird found!").
create table if not exists public.events (
  id           uuid primary key,
  detection_id uuid not null references public.detections (id) on delete cascade,
  species      text not null,
  confidence   real not null,
  "timestamp"  timestamptz not null,
  event_type   text not null,
  surface      boolean not null,
  jev_reason   text not null default '',
  created_at   timestamptz not null default now()
);

create index if not exists events_timestamp_idx on public.events ("timestamp" desc);

-- Per-species totals over the whole history (the backend keeps only recent detections in memory).
create or replace view public.species_summary
with (security_invoker = true) as
select
  species                as name,
  max(scientific_name)   as scientific_name,
  min("timestamp")       as first_seen,
  max("timestamp")       as last_seen,
  count(*)::int          as sighting_count
from public.detections
group by species;

alter table public.detections enable row level security;
alter table public.events enable row level security;

-- Private bucket for call clips (MP3). The backend hands the app short-lived signed URLs.
insert into storage.buckets (id, name, public)
values ('recordings', 'recordings', false)
on conflict (id) do nothing;
