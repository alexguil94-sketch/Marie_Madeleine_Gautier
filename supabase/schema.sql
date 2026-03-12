-- ============================================================
-- MMG — Supabase schema (tables + RLS) — CLEAN + IDPOTENT
-- Colle tout dans Supabase → SQL Editor → Run
-- ============================================================

-- Extensions
create extension if not exists pgcrypto;

-- ============================================================
-- 1) PROFILES (roles)
-- ============================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'editor',
  avatar_url text,
  created_at timestamptz not null default now()
);

-- Add missing cols if table existed already
alter table public.profiles add column if not exists display_name text;
alter table public.profiles add column if not exists avatar_url text;

alter table public.profiles drop constraint if exists profiles_display_name_len_chk;
alter table public.profiles
  add constraint profiles_display_name_len_chk
  check (
    display_name is null
    or char_length(btrim(display_name)) between 1 and 32
  );

alter table public.profiles enable row level security;

-- Helper: admin check
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  );
$$;

create or replace function public.current_profile_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.role
  from public.profiles p
  where p.id = auth.uid()
$$;

-- Policies (drop first to be re-runnable)
drop policy if exists "profiles read own or admin" on public.profiles;
drop policy if exists "profiles insert own" on public.profiles;
drop policy if exists "profiles self update safe fields" on public.profiles;
drop policy if exists "profiles admin update" on public.profiles;

create policy "profiles read own or admin"
on public.profiles
for select
to authenticated
using (auth.uid() = id or public.is_admin());

create policy "profiles insert own"
on public.profiles
for insert
to authenticated
with check (auth.uid() = id);

create policy "profiles self update safe fields"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (
  auth.uid() = id
  and role = public.current_profile_role()
);

create policy "profiles admin update"
on public.profiles
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- ============================================================
-- 2) WORKS (gallery)
-- ============================================================
create table if not exists public.works (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  year int,
  category text,
  description text,
  cover_url text,
  thumb_url text,
  images jsonb not null default '[]'::jsonb,
  sort int not null default 1000,
  is_published boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.works enable row level security;

drop policy if exists "works public read" on public.works;
drop policy if exists "works admin read all" on public.works;
drop policy if exists "works admin write" on public.works;

create policy "works public read"
on public.works
for select
to anon, authenticated
using (is_published = true);

create policy "works admin read all"
on public.works
for select
to authenticated
using (public.is_admin());

create policy "works admin write"
on public.works
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- ============================================================
-- 3) NEWS POSTS (actualités)
-- ============================================================
create table if not exists public.news_posts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text,
  media_type text, -- image | video | youtube
  media_url text,
  media_poster text,
  youtube_id text,
  published_at date not null default (now()::date),
  is_published boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.news_posts enable row level security;

drop policy if exists "news public read" on public.news_posts;
drop policy if exists "news admin read all" on public.news_posts;
drop policy if exists "news admin write" on public.news_posts;

create policy "news public read"
on public.news_posts
for select
to anon, authenticated
using (is_published = true);

create policy "news admin read all"
on public.news_posts
for select
to authenticated
using (public.is_admin());

create policy "news admin write"
on public.news_posts
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- ============================================================
-- 4) NEWS COMMENTS (moderation)
--  - Public sees only approved
--  - Only authenticated users can insert (and they must set user_id)
-- ============================================================
create table if not exists public.news_comments (
  id bigint generated always as identity primary key,
  post_id uuid not null references public.news_posts(id) on delete cascade,
  name text not null,
  message text not null,
  approved boolean not null default false,
  created_at timestamptz not null default now()
);

-- Add missing col if table existed already
alter table public.news_comments add column if not exists user_id uuid;
alter table public.news_comments drop constraint if exists news_comments_name_len_chk;
alter table public.news_comments drop constraint if exists news_comments_message_len_chk;
alter table public.news_comments
  add constraint news_comments_name_len_chk
  check (char_length(btrim(name)) between 1 and 120);
alter table public.news_comments
  add constraint news_comments_message_len_chk
  check (char_length(btrim(message)) between 1 and 2000);

alter table public.news_comments enable row level security;

drop policy if exists "comments public read approved" on public.news_comments;
drop policy if exists "comments authenticated insert" on public.news_comments;
drop policy if exists "comments admin read all" on public.news_comments;
drop policy if exists "comments admin update" on public.news_comments;
drop policy if exists "comments admin delete" on public.news_comments;

create policy "comments public read approved"
on public.news_comments
for select
to anon, authenticated
using (approved = true);

-- Only logged-in users can comment
create policy "comments authenticated insert"
on public.news_comments
for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.news_posts p
    where p.id = post_id
      and p.is_published = true
  )
);

create policy "comments admin read all"
on public.news_comments
for select
to authenticated
using (public.is_admin());

create policy "comments admin update"
on public.news_comments
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "comments admin delete"
on public.news_comments
for delete
to authenticated
using (public.is_admin());

-- ============================================================
-- 5) PUBLICATIONS (page Artiste)
-- ============================================================
create table if not exists public.publications (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text,
  images jsonb not null default '[]'::jsonb,
  published_at date not null default (now()::date),
  is_published boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.publications enable row level security;

drop policy if exists "publications public read" on public.publications;
drop policy if exists "publications admin read all" on public.publications;
drop policy if exists "publications admin write" on public.publications;

create policy "publications public read"
on public.publications
for select
to anon, authenticated
using (is_published = true);

create policy "publications admin read all"
on public.publications
for select
to authenticated
using (public.is_admin());

create policy "publications admin write"
on public.publications
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- ============================================================
-- 6) SITE PHOTOS (carousel / medias)
-- ============================================================
create table if not exists public.site_photos (
  id uuid primary key default gen_random_uuid(),
  slot text not null default 'drawer_carousel', -- ex: drawer_carousel
  title text,
  alt text,
  path text not null,
  sort int not null default 1000,
  is_published boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.site_photos enable row level security;

drop policy if exists "site photos public read" on public.site_photos;
drop policy if exists "site photos admin read all" on public.site_photos;
drop policy if exists "site photos admin write" on public.site_photos;

create policy "site photos public read"
on public.site_photos
for select
to anon, authenticated
using (is_published = true);

create policy "site photos admin read all"
on public.site_photos
for select
to authenticated
using (public.is_admin());

create policy "site photos admin write"
on public.site_photos
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- ============================================================
-- 7) BOOKS / PRESS + SOURCES (page Livres)
-- ============================================================
create table if not exists public.site_documents (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'book', -- book | press
  title text not null,
  year text,
  cover_path text,
  pdf_path text not null,
  sort int not null default 1000,
  is_published boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.site_documents enable row level security;

drop policy if exists "site documents public read" on public.site_documents;
drop policy if exists "site documents admin read all" on public.site_documents;
drop policy if exists "site documents admin write" on public.site_documents;

create policy "site documents public read"
on public.site_documents
for select
to anon, authenticated
using (is_published = true);

create policy "site documents admin read all"
on public.site_documents
for select
to authenticated
using (public.is_admin());

create policy "site documents admin write"
on public.site_documents
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create table if not exists public.site_sources (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  url text not null,
  meta text,
  sort int not null default 1000,
  is_published boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.site_sources enable row level security;

drop policy if exists "site sources public read" on public.site_sources;
drop policy if exists "site sources admin read all" on public.site_sources;
drop policy if exists "site sources admin write" on public.site_sources;

create policy "site sources public read"
on public.site_sources
for select
to anon, authenticated
using (is_published = true);

create policy "site sources admin read all"
on public.site_sources
for select
to authenticated
using (public.is_admin());

create policy "site sources admin write"
on public.site_sources
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- ============================================================
-- 8) SOCIAL LINKS (footer / contact)
-- ============================================================
create table if not exists public.site_social_links (
  id uuid primary key default gen_random_uuid(),
  platform text not null, -- instagram | facebook | youtube | whatsapp | etc.
  title text,
  url text not null,
  icon_light_path text, -- optional: icon for light theme
  icon_dark_path text,  -- optional: icon for dark theme
  sort int not null default 1000,
  is_published boolean not null default true,
  created_at timestamptz not null default now()
);

-- add columns on existing installs
alter table public.site_social_links
  add column if not exists icon_light_path text,
  add column if not exists icon_dark_path text;

create unique index if not exists site_social_links_platform_key
on public.site_social_links (platform);

alter table public.site_social_links enable row level security;

drop policy if exists "site social public read" on public.site_social_links;
drop policy if exists "site social admin read all" on public.site_social_links;
drop policy if exists "site social admin write" on public.site_social_links;

create policy "site social public read"
on public.site_social_links
for select
to anon, authenticated
using (is_published = true);

create policy "site social admin read all"
on public.site_social_links
for select
to authenticated
using (public.is_admin());

create policy "site social admin write"
on public.site_social_links
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- ============================================================
-- 9) GALLERY PROSPECTS (admin prospection CRM)
-- ============================================================
create table if not exists public.gallery_prospects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text not null,
  country text not null,
  address text,
  email text,
  website text,
  gallery_type text not null default 'contemporain',
  status text not null default 'a_contacter',
  contact_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.gallery_prospects
  add column if not exists address text,
  add column if not exists email text,
  add column if not exists website text,
  add column if not exists gallery_type text,
  add column if not exists status text,
  add column if not exists contact_date date,
  add column if not exists notes text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.gallery_prospects
  alter column gallery_type set default 'contemporain',
  alter column status set default 'a_contacter';

alter table public.gallery_prospects drop constraint if exists gallery_prospects_type_chk;
alter table public.gallery_prospects drop constraint if exists gallery_prospects_status_chk;

alter table public.gallery_prospects
  add constraint gallery_prospects_type_chk
  check (gallery_type in ('sculpture', 'contemporain', 'figuratif'));

alter table public.gallery_prospects
  add constraint gallery_prospects_status_chk
  check (status in ('a_contacter', 'contacte', 'relance', 'reponse', 'refus', 'collaboration'));

create index if not exists gallery_prospects_city_idx on public.gallery_prospects (city);
create index if not exists gallery_prospects_country_idx on public.gallery_prospects (country);
create index if not exists gallery_prospects_status_idx on public.gallery_prospects (status);
create index if not exists gallery_prospects_contact_date_idx on public.gallery_prospects (contact_date desc);

create or replace function public.set_gallery_prospects_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_gallery_prospects_updated_at on public.gallery_prospects;
create trigger trg_gallery_prospects_updated_at
before update on public.gallery_prospects
for each row
execute function public.set_gallery_prospects_updated_at();

alter table public.gallery_prospects enable row level security;

drop policy if exists "gallery prospects admin read all" on public.gallery_prospects;
drop policy if exists "gallery prospects admin write" on public.gallery_prospects;

create policy "gallery prospects admin read all"
on public.gallery_prospects
for select
to authenticated
using (public.is_admin());

create policy "gallery prospects admin write"
on public.gallery_prospects
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- ============================================================
-- 10) STORAGE policies (bucket: media)
-- IMPORTANT: crée le bucket "media" dans Storage → Buckets
-- ============================================================
drop policy if exists "media public read" on storage.objects;
drop policy if exists "media admin update" on storage.objects;
drop policy if exists "media admin insert" on storage.objects;
drop policy if exists "media admin delete" on storage.objects;
drop policy if exists "media own avatar insert" on storage.objects;
drop policy if exists "media own avatar update" on storage.objects;
drop policy if exists "media own avatar delete" on storage.objects;

create policy "media public read"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'media');

create policy "media admin insert"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'media' and public.is_admin());

create policy "media admin update"
on storage.objects
for update
to authenticated
using (bucket_id = 'media' and public.is_admin())
with check (bucket_id = 'media' and public.is_admin());

create policy "media admin delete"
on storage.objects
for delete
to authenticated
using (bucket_id = 'media' and public.is_admin());

create policy "media own avatar insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'media'
  and (storage.foldername(name))[1] = 'avatars'
  and (storage.foldername(name))[2] = auth.uid()::text
);

create policy "media own avatar update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'media'
  and (storage.foldername(name))[1] = 'avatars'
  and (storage.foldername(name))[2] = auth.uid()::text
)
with check (
  bucket_id = 'media'
  and (storage.foldername(name))[1] = 'avatars'
  and (storage.foldername(name))[2] = auth.uid()::text
);

create policy "media own avatar delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'media'
  and (storage.foldername(name))[1] = 'avatars'
  and (storage.foldername(name))[2] = auth.uid()::text
);

-- ============================================================
-- 11) Make your user admin
-- ============================================================
insert into public.profiles (id, role, display_name)
values ('80bf5061-15d7-4d5c-afdb-492c024fb320', 'admin', 'alexguil94@hotmail.fr')
on conflict (id) do update
set role = excluded.role,
    display_name = excluded.display_name;
