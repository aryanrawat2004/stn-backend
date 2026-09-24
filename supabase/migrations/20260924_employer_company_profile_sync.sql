begin;

-- Employer company profile fields used by /api/me/Employer/company.
alter table if exists public.sn_companies
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
  add column if not exists "verificationStatus" text default 'Pending',
  add column if not exists "accountStatus" text default 'Active',
  add column if not exists "createdAt" timestamptz default now(),
  add column if not exists "updatedAt" timestamptz default now();

alter table if exists public.sn_employers
  add column if not exists "companyName" text,
  add column if not exists "contactPerson" text,
  add column if not exists email text,
  add column if not exists location text,
  add column if not exists "jobsPosted" integer default 0,
  add column if not exists verified boolean default false,
  add column if not exists "joinedDate" text,
  add column if not exists status text default 'Pending Verification',
  add column if not exists "authUid" text,
  add column if not exists "accountScope" text,
  add column if not exists "createdAt" timestamptz default now(),
  add column if not exists "updatedAt" timestamptz default now();

-- Reusable company profile table used by the Post Job / company selector flow.
create table if not exists public.company_profiles (
  id uuid primary key default gen_random_uuid(),
  owner_email text not null,
  company_name text not null,
  website text,
  industry text,
  company_size text,
  headquarters text,
  about text,
  contact_name text,
  contact_email text,
  contact_phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_email, company_name)
);

create index if not exists sn_companies_email_lower_idx
  on public.sn_companies (lower(email));

create index if not exists sn_employers_email_lower_idx
  on public.sn_employers (lower(email));

create index if not exists company_profiles_owner_email_lower_idx
  on public.company_profiles (lower(owner_email));

notify pgrst, 'reload schema';
commit;
