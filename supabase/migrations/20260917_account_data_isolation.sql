begin;

-- Every employer/recruiter-owned job is linked to the account that created it.
alter table if exists public.sn_jobs
  add column if not exists "ownerScope" text,
  add column if not exists "ownerUid" text,
  add column if not exists "ownerEmail" text;

-- Every application keeps both sides of the relationship so the same candidate
-- can apply to multiple employers while each employer only sees its own pipeline.
alter table if exists public.sn_applications
  add column if not exists "candidateScope" text,
  add column if not exists "candidateUid" text,
  add column if not exists "candidateEmail" text,
  add column if not exists "employerScope" text,
  add column if not exists "employerUid" text,
  add column if not exists "employerEmail" text;

-- Saved jobs remain candidate-specific.
alter table if exists public.sn_saved_jobs
  add column if not exists "candidateScope" text;

-- Employer and candidate records can be tied directly to an auth identity.
alter table if exists public.sn_employers
  add column if not exists "authUid" text,
  add column if not exists "accountScope" text;

alter table if exists public.sn_candidates
  add column if not exists "accountScope" text;

create index if not exists sn_jobs_owner_scope_idx
  on public.sn_jobs("ownerScope");

create index if not exists sn_jobs_owner_uid_idx
  on public.sn_jobs("ownerUid");

create index if not exists sn_applications_candidate_scope_idx
  on public.sn_applications("candidateScope");

create index if not exists sn_applications_employer_scope_idx
  on public.sn_applications("employerScope");

create index if not exists sn_applications_employer_job_idx
  on public.sn_applications("employerScope", "jobId");

create index if not exists sn_saved_jobs_candidate_scope_idx
  on public.sn_saved_jobs("candidateScope");

create unique index if not exists sn_employers_auth_uid_unique_idx
  on public.sn_employers("authUid")
  where "authUid" is not null;

create unique index if not exists sn_employers_account_scope_unique_idx
  on public.sn_employers("accountScope")
  where "accountScope" is not null;

create unique index if not exists sn_candidates_account_scope_unique_idx
  on public.sn_candidates("accountScope")
  where "accountScope" is not null;

notify pgrst, 'reload schema';
commit;
