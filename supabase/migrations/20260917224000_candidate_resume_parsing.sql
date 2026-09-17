alter table if exists public.sn_candidates
  add column if not exists "experience" text,
  add column if not exists "resumeText" text,
  add column if not exists "resumeData" jsonb,
  add column if not exists "resumeParsedAt" timestamptz;

create index if not exists idx_sn_candidates_email_lower
  on public.sn_candidates (lower(email));

notify pgrst, 'reload schema';
