-- SolarNaukri full schema sync
-- Safe/idempotent migration for the current frontend + stn-backend code.
-- Run this in the SAME Supabase project used by stn-backend/.env.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Core backend tables. The repository layer automatically prefixes these with sn_.
-- ---------------------------------------------------------------------------

create table if not exists public.sn_jobs (
  id text primary key,
  role text not null,
  company text not null,
  location text not null,
  type text not null,
  salary text,
  "postedDate" text,
  applications integer default 0,
  status text not null default 'Pending',
  featured boolean default false,
  "workMode" text,
  experience text,
  segment text,
  skills text,
  description text,
  "projectScope" text,
  "projectCapacity" text,
  responsibilities text,
  requirements text,
  tools text,
  "officeAddress" text,
  "mapUrl" text,
  "EmployerName" text,
  "EmployerDesignation" text,
  "EmployerEmail" text,
  "EmployerPhone" text,
  "targetStartDate" text,
  "selectionProcess" text,
  "companyDescription" text,
  "companyWebsite" text,
  "companySize" text,
  "companyHeadquarters" text,
  perks text,
  "applicationEmail" text,
  "createdAt" timestamptz default now(),
  "updatedAt" timestamptz default now()
);

alter table public.sn_jobs
  add column if not exists role text,
  add column if not exists company text,
  add column if not exists location text,
  add column if not exists type text,
  add column if not exists salary text,
  add column if not exists "postedDate" text,
  add column if not exists applications integer default 0,
  add column if not exists status text default 'Pending',
  add column if not exists featured boolean default false,
  add column if not exists "workMode" text,
  add column if not exists experience text,
  add column if not exists segment text,
  add column if not exists skills text,
  add column if not exists description text,
  add column if not exists "projectScope" text,
  add column if not exists "projectCapacity" text,
  add column if not exists responsibilities text,
  add column if not exists requirements text,
  add column if not exists tools text,
  add column if not exists "officeAddress" text,
  add column if not exists "mapUrl" text,
  add column if not exists "EmployerName" text,
  add column if not exists "EmployerDesignation" text,
  add column if not exists "EmployerEmail" text,
  add column if not exists "EmployerPhone" text,
  add column if not exists "targetStartDate" text,
  add column if not exists "selectionProcess" text,
  add column if not exists "companyDescription" text,
  add column if not exists "companyWebsite" text,
  add column if not exists "companySize" text,
  add column if not exists "companyHeadquarters" text,
  add column if not exists perks text,
  add column if not exists "applicationEmail" text,
  add column if not exists "createdAt" timestamptz default now(),
  add column if not exists "updatedAt" timestamptz default now();

create table if not exists public.sn_candidates (
  id text primary key,
  name text not null,
  email text not null,
  phone text,
  role text,
  location text,
  experience text,
  verified boolean default false,
  "joinedDate" text,
  skills jsonb default '[]'::jsonb,
  "profileCompletion" integer default 0,
  "resumeStrength" integer default 0,
  "talentPassportScore" integer default 0,
  "accountStatus" text default 'Active',
  "emailVerified" boolean default false,
  "phoneVerified" boolean default false,
  "lastLogin" text,
  "lastActive" text,
  "currentSessionStartedAt" text,
  "currentSessionDuration" text,
  "totalActiveTime" text,
  "deviceType" text,
  "deviceName" text,
  browser text,
  "operatingSystem" text,
  "ipAddress" text,
  "totalLogins" integer default 0,
  "applicationsCount" integer default 0,
  "savedJobsCount" integer default 0,
  "profileViews" integer default 0,
  "loginHistory" jsonb default '[]'::jsonb,
  "createdAt" timestamptz default now(),
  "updatedAt" timestamptz default now()
);

alter table public.sn_candidates
  add column if not exists name text,
  add column if not exists email text,
  add column if not exists phone text,
  add column if not exists role text,
  add column if not exists location text,
  add column if not exists experience text,
  add column if not exists verified boolean default false,
  add column if not exists "joinedDate" text,
  add column if not exists skills jsonb default '[]'::jsonb,
  add column if not exists "profileCompletion" integer default 0,
  add column if not exists "resumeStrength" integer default 0,
  add column if not exists "talentPassportScore" integer default 0,
  add column if not exists "accountStatus" text default 'Active',
  add column if not exists "emailVerified" boolean default false,
  add column if not exists "phoneVerified" boolean default false,
  add column if not exists "lastLogin" text,
  add column if not exists "lastActive" text,
  add column if not exists "currentSessionStartedAt" text,
  add column if not exists "currentSessionDuration" text,
  add column if not exists "totalActiveTime" text,
  add column if not exists "deviceType" text,
  add column if not exists "deviceName" text,
  add column if not exists browser text,
  add column if not exists "operatingSystem" text,
  add column if not exists "ipAddress" text,
  add column if not exists "totalLogins" integer default 0,
  add column if not exists "applicationsCount" integer default 0,
  add column if not exists "savedJobsCount" integer default 0,
  add column if not exists "profileViews" integer default 0,
  add column if not exists "loginHistory" jsonb default '[]'::jsonb,
  add column if not exists "createdAt" timestamptz default now(),
  add column if not exists "updatedAt" timestamptz default now();

create table if not exists public.sn_employers (
  id text primary key,
  "companyName" text not null,
  "contactPerson" text not null,
  email text not null,
  location text,
  "jobsPosted" integer default 0,
  verified boolean default false,
  "joinedDate" text,
  status text default 'Pending Verification',
  "createdAt" timestamptz default now(),
  "updatedAt" timestamptz default now()
);

alter table public.sn_employers
  add column if not exists "companyName" text,
  add column if not exists "contactPerson" text,
  add column if not exists email text,
  add column if not exists location text,
  add column if not exists "jobsPosted" integer default 0,
  add column if not exists verified boolean default false,
  add column if not exists "joinedDate" text,
  add column if not exists status text default 'Pending Verification',
  add column if not exists "createdAt" timestamptz default now(),
  add column if not exists "updatedAt" timestamptz default now();

create table if not exists public.sn_companies (
  id text primary key,
  "companyName" text not null,
  industry text,
  location text,
  website text,
  "contactPerson" text,
  email text,
  phone text,
  "jobsPosted" integer default 0,
  verified boolean default false,
  status text default 'Pending',
  "joinedDate" text,
  "logoName" text,
  "companyType" text,
  "companySize" text,
  "foundedYear" text,
  description text,
  designation text,
  "alternatePhone" text,
  address text,
  city text,
  state text,
  country text,
  "pinCode" text,
  "gstNumber" text,
  "cinNumber" text,
  pan text,
  "msmeRegistered" text,
  "solarExpertise" jsonb default '[]'::jsonb,
  "rolesHiringFor" text,
  "hiringLocations" text,
  "preferredExperience" text,
  "employmentType" text,
  "workMode" text,
  "verificationStatus" text,
  "verificationReason" text,
  "accountStatus" text,
  "featuredCompany" boolean default false,
  "createdAt" timestamptz default now(),
  "updatedAt" timestamptz default now()
);

alter table public.sn_companies
  add column if not exists "companyName" text,
  add column if not exists industry text,
  add column if not exists location text,
  add column if not exists website text,
  add column if not exists "contactPerson" text,
  add column if not exists email text,
  add column if not exists phone text,
  add column if not exists "jobsPosted" integer default 0,
  add column if not exists verified boolean default false,
  add column if not exists status text default 'Pending',
  add column if not exists "joinedDate" text,
  add column if not exists "logoName" text,
  add column if not exists "companyType" text,
  add column if not exists "companySize" text,
  add column if not exists "foundedYear" text,
  add column if not exists description text,
  add column if not exists designation text,
  add column if not exists "alternatePhone" text,
  add column if not exists address text,
  add column if not exists city text,
  add column if not exists state text,
  add column if not exists country text,
  add column if not exists "pinCode" text,
  add column if not exists "gstNumber" text,
  add column if not exists "cinNumber" text,
  add column if not exists pan text,
  add column if not exists "msmeRegistered" text,
  add column if not exists "solarExpertise" jsonb default '[]'::jsonb,
  add column if not exists "rolesHiringFor" text,
  add column if not exists "hiringLocations" text,
  add column if not exists "preferredExperience" text,
  add column if not exists "employmentType" text,
  add column if not exists "workMode" text,
  add column if not exists "verificationStatus" text,
  add column if not exists "verificationReason" text,
  add column if not exists "accountStatus" text,
  add column if not exists "featuredCompany" boolean default false,
  add column if not exists "createdAt" timestamptz default now(),
  add column if not exists "updatedAt" timestamptz default now();

create table if not exists public.sn_categories (
  id text primary key,
  name text not null,
  slug text unique not null,
  description text,
  icon text,
  "jobsCount" integer default 0,
  status text default 'Active',
  "createdAt" timestamptz default now(),
  "updatedAt" timestamptz default now()
);

alter table public.sn_categories
  add column if not exists name text,
  add column if not exists slug text,
  add column if not exists description text,
  add column if not exists icon text,
  add column if not exists "jobsCount" integer default 0,
  add column if not exists status text default 'Active',
  add column if not exists "createdAt" timestamptz default now(),
  add column if not exists "updatedAt" timestamptz default now();

create table if not exists public.sn_ambassadors (
  id text primary key,
  name text not null,
  email text not null,
  phone text,
  college text,
  city text,
  course text,
  year text,
  "referralCount" integer default 0,
  "joinedCandidates" integer default 0,
  status text default 'Pending',
  "joinedDate" text,
  "createdAt" timestamptz default now(),
  "updatedAt" timestamptz default now()
);

alter table public.sn_ambassadors
  add column if not exists name text,
  add column if not exists email text,
  add column if not exists phone text,
  add column if not exists college text,
  add column if not exists city text,
  add column if not exists course text,
  add column if not exists year text,
  add column if not exists "referralCount" integer default 0,
  add column if not exists "joinedCandidates" integer default 0,
  add column if not exists status text default 'Pending',
  add column if not exists "joinedDate" text,
  add column if not exists "createdAt" timestamptz default now(),
  add column if not exists "updatedAt" timestamptz default now();

create table if not exists public.sn_applications (
  id text primary key,
  "jobId" text references public.sn_jobs(id) on delete cascade,
  "candidateId" text references public.sn_candidates(id) on delete cascade,
  status text default 'Applied',
  "appliedAt" timestamptz default now(),
  "updatedAt" timestamptz default now(),
  notes text,
  "createdAt" timestamptz default now()
);

alter table public.sn_applications
  add column if not exists "jobId" text,
  add column if not exists "candidateId" text,
  add column if not exists status text default 'Applied',
  add column if not exists "appliedAt" timestamptz default now(),
  add column if not exists "updatedAt" timestamptz default now(),
  add column if not exists notes text,
  add column if not exists "createdAt" timestamptz default now();

create table if not exists public.sn_activities (
  id text primary key,
  type text not null,
  title text not null,
  description text,
  time text,
  "createdAt" timestamptz default now(),
  "updatedAt" timestamptz default now()
);

alter table public.sn_activities
  add column if not exists type text,
  add column if not exists title text,
  add column if not exists description text,
  add column if not exists time text,
  add column if not exists "createdAt" timestamptz default now(),
  add column if not exists "updatedAt" timestamptz default now();

-- Settings route intentionally uses public.settings (without sn_ prefix).
create table if not exists public.settings (
  id text primary key default 'platform',
  "siteName" text default 'SolarNaukri',
  "contactEmail" text default 'admin@solarnaukri.com',
  "emailAlerts" boolean default true,
  "autoApproveVerified" boolean default false,
  "weeklyDigest" boolean default true,
  "createdAt" timestamptz default now(),
  "updatedAt" timestamptz default now()
);

alter table public.settings
  add column if not exists "siteName" text default 'SolarNaukri',
  add column if not exists "contactEmail" text default 'admin@solarnaukri.com',
  add column if not exists "emailAlerts" boolean default true,
  add column if not exists "autoApproveVerified" boolean default false,
  add column if not exists "weeklyDigest" boolean default true,
  add column if not exists "createdAt" timestamptz default now(),
  add column if not exists "updatedAt" timestamptz default now();

insert into public.settings (id) values ('platform') on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Resources & Blogs
-- ---------------------------------------------------------------------------

create table if not exists public.sn_resources (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  type text not null default 'blog',
  title text not null,
  excerpt text not null default '',
  content text not null default '',
  category text not null default 'General',
  read_time text not null default '5 min read',
  cover_image_url text,
  resource_url text,
  author_name text not null default 'SolarNaukri Team',
  status text not null default 'draft',
  featured boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.sn_resources
  add column if not exists slug text,
  add column if not exists type text default 'blog',
  add column if not exists title text,
  add column if not exists excerpt text default '',
  add column if not exists content text default '',
  add column if not exists category text default 'General',
  add column if not exists read_time text default '5 min read',
  add column if not exists cover_image_url text,
  add column if not exists resource_url text,
  add column if not exists author_name text default 'SolarNaukri Team',
  add column if not exists status text default 'draft',
  add column if not exists featured boolean default false,
  add column if not exists published_at timestamptz,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

create unique index if not exists sn_resources_slug_uidx on public.sn_resources(slug);
create index if not exists sn_resources_status_idx on public.sn_resources(status);
create index if not exists sn_resources_type_idx on public.sn_resources(type);
create index if not exists sn_resources_featured_idx on public.sn_resources(featured desc);
create index if not exists sn_resources_published_at_idx on public.sn_resources(published_at desc);

alter table public.sn_resources enable row level security;
drop policy if exists "Public can read published resources" on public.sn_resources;
create policy "Public can read published resources"
on public.sn_resources for select
to anon, authenticated
using (status = 'published');

insert into storage.buckets (id, name, public, file_size_limit)
values ('resources', 'resources', true, 10485760)
on conflict (id) do update set public = true, file_size_limit = 10485760;

-- ---------------------------------------------------------------------------
-- Site analytics used by AnalyticsTracker + admin reporting.
-- ---------------------------------------------------------------------------

create table if not exists public.site_visits (
  id uuid primary key,
  visitor_id uuid not null,
  session_id uuid not null,
  user_id uuid references auth.users(id) on delete set null,
  path text not null,
  started_at timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  active_seconds integer not null default 0,
  device text not null default 'Other',
  referrer text not null default 'Direct'
);

alter table public.site_visits
  add column if not exists visitor_id uuid,
  add column if not exists session_id uuid,
  add column if not exists user_id uuid,
  add column if not exists path text,
  add column if not exists started_at timestamptz default now(),
  add column if not exists last_seen timestamptz default now(),
  add column if not exists active_seconds integer default 0,
  add column if not exists device text default 'Other',
  add column if not exists referrer text default 'Direct';

create index if not exists site_visits_started_idx on public.site_visits(started_at desc);
create index if not exists site_visits_last_seen_idx on public.site_visits(last_seen desc);
create index if not exists site_visits_visitor_idx on public.site_visits(visitor_id);
create index if not exists site_visits_session_idx on public.site_visits(session_id);
create index if not exists site_visits_path_idx on public.site_visits(path);

alter table public.site_visits enable row level security;
revoke all on public.site_visits from anon, authenticated;

create or replace function public.record_site_visit(payload jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare existing public.site_visits; seconds integer;
begin
  if left(payload->>'path', 1) <> '/' or payload->>'path' like '/admin%' then return; end if;
  select * into existing from public.site_visits where id = (payload->>'id')::uuid;
  if found then
    if existing.visitor_id <> (payload->>'visitor_id')::uuid
       or existing.session_id <> (payload->>'session_id')::uuid
       or existing.user_id is distinct from auth.uid() then return; end if;
    if existing.last_seen > now() - interval '5 seconds' then return; end if;
    seconds := greatest(existing.active_seconds, least((payload->>'active_seconds')::integer, existing.active_seconds + 15));
    update public.site_visits set last_seen = now(), active_seconds = seconds where id = existing.id;
  else
    if (select count(*) from public.site_visits where visitor_id = (payload->>'visitor_id')::uuid and started_at > now() - interval '1 minute') >= 30 then return; end if;
    insert into public.site_visits(id, visitor_id, session_id, user_id, path, device, referrer)
    values (
      (payload->>'id')::uuid,
      (payload->>'visitor_id')::uuid,
      (payload->>'session_id')::uuid,
      auth.uid(),
      left(split_part(split_part(payload->>'path', '?', 1), '#', 1), 240),
      case when payload->>'device' in ('Mobile','Tablet','Desktop') then payload->>'device' else 'Other' end,
      left(coalesce(payload->>'referrer','Direct'), 200)
    );
  end if;
end $$;

create or replace function public.read_site_visits(since timestamptz, page_offset integer default 0)
returns setof public.site_visits language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.jwt()->'app_metadata'->>'role','') <> 'admin' then
    raise exception 'An authenticated administrator is required' using errcode = '42501';
  end if;
  return query
    select * from public.site_visits
    where started_at >= greatest(since, now() - interval '90 days')
    order by started_at desc, id
    limit 1000 offset greatest(page_offset, 0);
end $$;

revoke all on function public.record_site_visit(jsonb) from public;
revoke all on function public.read_site_visits(timestamptz, integer) from public;
grant execute on function public.record_site_visit(jsonb) to anon, authenticated;
grant execute on function public.read_site_visits(timestamptz, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Helpful indexes for current backend filters/lookups.
-- ---------------------------------------------------------------------------

create index if not exists sn_jobs_status_idx on public.sn_jobs(status);
create index if not exists sn_jobs_company_idx on public.sn_jobs(company);
create index if not exists sn_candidates_email_idx on public.sn_candidates(email);
create index if not exists sn_candidates_status_idx on public.sn_candidates("accountStatus");
create index if not exists sn_employers_email_idx on public.sn_employers(email);
create index if not exists sn_employers_status_idx on public.sn_employers(status);
create index if not exists sn_companies_status_idx on public.sn_companies(status);
create index if not exists sn_companies_verification_idx on public.sn_companies("verificationStatus");
create index if not exists sn_applications_job_idx on public.sn_applications("jobId");
create index if not exists sn_applications_candidate_idx on public.sn_applications("candidateId");
create index if not exists sn_applications_status_idx on public.sn_applications(status);

-- Ask PostgREST to reload its schema cache after this migration.
notify pgrst, 'reload schema';
