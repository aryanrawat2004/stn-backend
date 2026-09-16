create extension if not exists pgcrypto;

create table if not exists public.sn_resources (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  type text not null default 'blog' check (type in ('blog','guide','video','pdf','resource')),
  title text not null,
  excerpt text not null default '',
  content text not null default '',
  category text not null default 'General',
  read_time text not null default '5 min read',
  cover_image_url text,
  resource_url text,
  author_name text not null default 'SolarNaukri Team',
  status text not null default 'draft' check (status in ('draft','published','archived')),
  featured boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sn_resources_status_idx on public.sn_resources(status);
create index if not exists sn_resources_type_idx on public.sn_resources(type);
create index if not exists sn_resources_featured_idx on public.sn_resources(featured desc);
create index if not exists sn_resources_published_at_idx on public.sn_resources(published_at desc);

alter table public.sn_resources enable row level security;

-- Public visitors can only read published content. Server-side admin writes use the service-role key.
drop policy if exists "Public can read published resources" on public.sn_resources;
create policy "Public can read published resources"
on public.sn_resources for select
to anon, authenticated
using (status = 'published');
