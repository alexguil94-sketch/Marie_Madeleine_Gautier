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
  created_at timestamptz not null default now()
);

-- Add missing cols if table existed already
alter table public.profiles add column if not exists display_name text;

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

-- Policies (drop first to be re-runnable)
drop policy if exists "profiles read own or admin" on public.profiles;
drop policy if exists "profiles insert own" on public.profiles;
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
-- 7) STORAGE policies (bucket: media)
-- IMPORTANT: crée le bucket "media" dans Storage → Buckets
-- ============================================================
drop policy if exists "media public read" on storage.objects;
drop policy if exists "media admin insert" on storage.objects;
drop policy if exists "media admin delete" on storage.objects;

create policy "media public read"
on storage.objects
for select
to anon
using (bucket_id = 'media');

create policy "media admin insert"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'media' and public.is_admin());

create policy "media admin delete"
on storage.objects
for delete
to authenticated
using (bucket_id = 'media' and public.is_admin());

-- ============================================================
-- 8) Make your user admin
-- ============================================================
insert into public.profiles (id, role, display_name)
values ('80bf5061-15d7-4d5c-afdb-492c024fb320', 'admin', 'alexguil94@hotmail.fr')
on conflict (id) do update
set role = excluded.role,
    display_name = excluded.display_name;
-- Helper admin check (si pas déjà)
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;

-- NEWS POSTS write
drop policy if exists "news admin write" on public.news_posts;
create policy "news admin write"
on public.news_posts
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- WORKS write
drop policy if exists "works admin write" on public.works;
create policy "works admin write"
on public.works
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Storage admin insert/delete
drop policy if exists "media admin insert" on storage.objects;
drop policy if exists "media admin delete" on storage.objects;

create policy "media admin insert"
on storage.objects for insert
to authenticated
with check (bucket_id = 'media' and public.is_admin());

create policy "media admin delete"
on storage.objects for delete
to authenticated
using (bucket_id = 'media' and public.is_admin());
