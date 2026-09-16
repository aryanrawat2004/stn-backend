begin;

-- Candidate profile fields used by the live candidate experience.
alter table if exists public.sn_candidates
  add column if not exists "firebaseUid" text,
  add column if not exists "currentSalary" text,
  add column if not exists "expectedSalary" text,
  add column if not exists "noticePeriod" text,
  add column if not exists about text,
  add column if not exists "resumeUrl" text,
  add column if not exists "resumePath" text,
  add column if not exists "resumeName" text,
  add column if not exists "resumeUploadedAt" timestamptz,
  add column if not exists "projectExperience" jsonb not null default '[]'::jsonb,
  add column if not exists certifications jsonb not null default '[]'::jsonb;

create unique index if not exists sn_candidates_firebase_uid_idx
  on public.sn_candidates("firebaseUid")
  where "firebaseUid" is not null;

create index if not exists sn_candidates_email_lower_idx
  on public.sn_candidates(lower(email));

-- Ensure applications have a createdAt column because the API now writes it.
alter table if exists public.sn_applications
  add column if not exists "createdAt" timestamptz not null default now();

-- Candidate saved jobs are now persisted instead of local/mock state.
create table if not exists public.sn_saved_jobs (
  id text primary key,
  "candidateId" text not null references public.sn_candidates(id) on delete cascade,
  "jobId" text not null references public.sn_jobs(id) on delete cascade,
  "createdAt" timestamptz not null default now(),
  unique ("candidateId", "jobId")
);

create index if not exists sn_saved_jobs_candidate_idx
  on public.sn_saved_jobs("candidateId");

create index if not exists sn_saved_jobs_job_idx
  on public.sn_saved_jobs("jobId");

-- Private resume storage. Uploads happen through the backend service role.
insert into storage.buckets (id, name, public)
values ('candidate-resumes', 'candidate-resumes', false)
on conflict (id) do update set public = false;

-- Helpful indexes for live candidate/recruiter filtering.
create index if not exists sn_jobs_status_idx on public.sn_jobs(status);
create index if not exists sn_jobs_company_idx on public.sn_jobs(company);
create index if not exists sn_applications_candidate_idx on public.sn_applications("candidateId");
create index if not exists sn_applications_job_idx on public.sn_applications("jobId");
create index if not exists sn_employers_email_lower_idx on public.sn_employers(lower(email));

notify pgrst, 'reload schema';
commit;
