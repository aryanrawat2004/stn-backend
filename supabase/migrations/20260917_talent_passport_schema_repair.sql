-- Repair older candidate_verifications installs so the current API can insert safely.
-- Safe to run multiple times.

alter table if exists public.candidate_verifications
  add column if not exists candidate_id text,
  add column if not exists full_name text,
  add column if not exists phone text,
  add column if not exists "current_role" text,
  add column if not exists experience text,
  add column if not exists location text,
  add column if not exists status text default 'draft',
  add column if not exists payment_status text default 'pending',
  add column if not exists amount numeric default 999,
  add column if not exists aadhaar_last4 text,
  add column if not exists aadhaar_status text default 'pending',
  add column if not exists aadhaar_verified_at timestamptz,
  add column if not exists employment_status text default 'pending',
  add column if not exists employment_verified_at timestamptz,
  add column if not exists police_status text default 'pending',
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
  add column if not exists rejection_reason text,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

-- Older installs created candidate_id as NOT NULL, while the current API allows
-- verification drafts to be created before a candidate record is linked.
alter table if exists public.candidate_verifications
  alter column candidate_id drop not null;

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

notify pgrst, 'reload schema';
