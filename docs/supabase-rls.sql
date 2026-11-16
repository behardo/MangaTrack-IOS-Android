-- ============================================================================
-- MangaTrack — schema di riferimento e policy Row Level Security
-- ============================================================================
-- ATTENZIONE: questo file è DOCUMENTAZIONE, non una migrazione automatica.
-- Non viene eseguito da Vercel né dal build: serve a rendere verificabili e
-- riproducibili lo schema e le policy configurate nel progetto Supabase.
--
-- Le policy qui sotto descrivono il comportamento atteso dall'app. Prima di
-- eseguirle su un progetto già in uso, confrontale con quelle esistenti
-- (Database → Policies) per non sovrascrivere regole diverse.
--
-- Regola generale:
--   * lettura  → consentita agli utenti autenticati per i dati che l'app
--                mostra nel feed e nei profili (profiles, library, activity,
--                follows);
--   * scrittura → solo sulle proprie righe (auth.uid());
--   * consigli  → visibili e gestibili solo da mittente e destinatario.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Tabelle
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique,
  bio text default '',
  avatar_url text,
  avatar_color text,
  created_at timestamptz not null default now()
);

create table if not exists public.library (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  cover text,
  genre text,
  status text not null default 'Da leggere',
  chapters integer not null default 0,
  total_chapters integer,
  volumes integer not null default 0,
  total_volumes integer,
  score numeric not null default 0,
  favourite boolean not null default false,
  review text default '',
  created_at timestamptz not null default now()
);

create table if not exists public.activity (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null,
  manga_title text,
  manga_cover text,
  details text default '',
  created_at timestamptz not null default now()
);

create table if not exists public.follows (
  id uuid primary key default gen_random_uuid(),
  follower_id uuid not null references public.profiles (id) on delete cascade,
  following_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (follower_id, following_id),
  check (follower_id <> following_id)
);

create table if not exists public.recommendations (
  id uuid primary key default gen_random_uuid(),
  from_id uuid not null references public.profiles (id) on delete cascade,
  to_id uuid not null references public.profiles (id) on delete cascade,
  manga_title text not null,
  manga_cover text,
  message text default '',
  created_at timestamptz not null default now(),
  check (from_id <> to_id)
);

-- Indici usati dalle query dell'app (feed, libreria, follow, consigli).
create index if not exists library_user_id_created_at_idx
  on public.library (user_id, created_at desc);
create index if not exists activity_user_id_created_at_idx
  on public.activity (user_id, created_at desc);
create index if not exists follows_follower_id_idx
  on public.follows (follower_id);
create index if not exists follows_following_id_idx
  on public.follows (following_id);
create index if not exists recommendations_to_id_created_at_idx
  on public.recommendations (to_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 2. Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.library enable row level security;
alter table public.activity enable row level security;
alter table public.follows enable row level security;
alter table public.recommendations enable row level security;

-- ---------------------------------------------------------------------------
-- 3. profiles
--    Lettura pubblica autenticata: serve per username, avatar e ricerca amici.
--    Scrittura solo sul proprio profilo.
-- ---------------------------------------------------------------------------

drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated"
  on public.profiles for select
  to authenticated
  using (true);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert
  to authenticated
  with check (id = auth.uid());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists "profiles_delete_own" on public.profiles;
create policy "profiles_delete_own"
  on public.profiles for delete
  to authenticated
  using (id = auth.uid());

-- ---------------------------------------------------------------------------
-- 4. library
--    La libreria degli altri utenti è leggibile (scheda Social → libreria
--    utente), ma solo il proprietario può creare, modificare o eliminare.
-- ---------------------------------------------------------------------------

drop policy if exists "library_select_authenticated" on public.library;
create policy "library_select_authenticated"
  on public.library for select
  to authenticated
  using (true);

drop policy if exists "library_insert_own" on public.library;
create policy "library_insert_own"
  on public.library for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "library_update_own" on public.library;
create policy "library_update_own"
  on public.library for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "library_delete_own" on public.library;
create policy "library_delete_own"
  on public.library for delete
  to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 5. activity
--    Il feed mostra le attività delle persone seguite: lettura autenticata,
--    inserimento e cancellazione solo delle proprie righe.
-- ---------------------------------------------------------------------------

drop policy if exists "activity_select_authenticated" on public.activity;
create policy "activity_select_authenticated"
  on public.activity for select
  to authenticated
  using (true);

drop policy if exists "activity_insert_own" on public.activity;
create policy "activity_insert_own"
  on public.activity for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "activity_delete_own" on public.activity;
create policy "activity_delete_own"
  on public.activity for delete
  to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 6. follows
--    Lettura autenticata (conteggi follower/following), scrittura solo sulla
--    relazione in cui il proprio id è follower_id.
-- ---------------------------------------------------------------------------

drop policy if exists "follows_select_authenticated" on public.follows;
create policy "follows_select_authenticated"
  on public.follows for select
  to authenticated
  using (true);

drop policy if exists "follows_insert_own" on public.follows;
create policy "follows_insert_own"
  on public.follows for insert
  to authenticated
  with check (follower_id = auth.uid());

drop policy if exists "follows_delete_own" on public.follows;
create policy "follows_delete_own"
  on public.follows for delete
  to authenticated
  using (follower_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 7. recommendations
--    Visibili solo a mittente e destinatario. Il destinatario può eliminare
--    (scartare) il consiglio, il mittente può eliminarlo o annullarlo.
-- ---------------------------------------------------------------------------

drop policy if exists "recommendations_select_involved" on public.recommendations;
create policy "recommendations_select_involved"
  on public.recommendations for select
  to authenticated
  using (from_id = auth.uid() or to_id = auth.uid());

drop policy if exists "recommendations_insert_from_self" on public.recommendations;
create policy "recommendations_insert_from_self"
  on public.recommendations for insert
  to authenticated
  with check (from_id = auth.uid());

drop policy if exists "recommendations_delete_involved" on public.recommendations;
create policy "recommendations_delete_involved"
  on public.recommendations for delete
  to authenticated
  using (from_id = auth.uid() or to_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 8. Storage — bucket "avatars"
--    Il bucket è pubblico in lettura (le URL degli avatar sono pubbliche),
--    mentre scrittura e cancellazione sono limitate alla propria cartella:
--    il primo segmento del path è l'id dell'utente (vedi src/api/storage.js).
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "avatars_read_public" on storage.objects;
create policy "avatars_read_public"
  on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists "avatars_insert_own_folder" on storage.objects;
create policy "avatars_insert_own_folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars_update_own_folder" on storage.objects;
create policy "avatars_update_own_folder"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars_delete_own_folder" on storage.objects;
create policy "avatars_delete_own_folder"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
