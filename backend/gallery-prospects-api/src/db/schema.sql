create extension if not exists pgcrypto;

create table if not exists gallery_prospects (
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
  updated_at timestamptz not null default now(),
  constraint gallery_prospects_type_chk
    check (gallery_type in ('sculpture', 'contemporain', 'figuratif')),
  constraint gallery_prospects_status_chk
    check (status in ('a_contacter', 'contacte', 'relance', 'reponse', 'refus', 'collaboration'))
);

create index if not exists gallery_prospects_city_idx on gallery_prospects (city);
create index if not exists gallery_prospects_country_idx on gallery_prospects (country);
create index if not exists gallery_prospects_status_idx on gallery_prospects (status);
create index if not exists gallery_prospects_contact_date_idx on gallery_prospects (contact_date desc);

create or replace function set_gallery_prospects_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_gallery_prospects_updated_at on gallery_prospects;
create trigger trg_gallery_prospects_updated_at
before update on gallery_prospects
for each row
execute function set_gallery_prospects_updated_at();
