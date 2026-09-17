-- SolarNaukri Talent Passport: 3-step verification
-- Safe to run on an existing installation.

create table if not exists public.candidate_verifications (
  id uuid primary key,
  candidate_id text null,
  full_name text not null,
  phone text not null,
  current_role text null,
  experience text null,
  location text null,
  status text not null default 'draft',
  payment_status text not null default 'pending',
  amount numeric not null default 999,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.candidate_verifications
  add column if not exists aadhaar_last4 text,
  add column if not exists aadhaar_status text not null default 'pending',
  add column if not exists aadhaar_verified_at timestamptz,
  add column if not exists employment_status text not null default 'pending',
  add column if not exists employment_verified_at timestamptz,
  add column if not exists police_status text not null default 'pending',
  add column if not exists police_verified_at timestamptz,
  add column if not exists police_reference_number text,
  add column if not exists police_issue_date date,
  add column if not exists police_issuing_authority text,
  add column if not exists police_state text,
  add column if not exists payment_id text,
  add column if not exists payment_order_id text,
  add column if not exists submitted_at timestamptz,
  add column if not exists verified_at timestamptz,
  add column if not exists valid_until timestamptz,
  add column if not exists rejection_reason text;

create table if not exists public.candidate_verification_documents (
  id uuid primary key,
  verification_id uuid not null references public.candidate_verifications(id) on delete cascade,
  document_type text not null,
  file_url text not null,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

create index if not exists idx_candidate_verification_documents_verification_id
  on public.candidate_verification_documents(verification_id);
create index if not exists idx_candidate_verifications_status
  on public.candidate_verifications(status);
create index if not exists idx_candidate_verifications_candidate_id
  on public.candidate_verifications(candidate_id);
