-- Global job visibility + employer ownership/lifecycle
-- Safe to run more than once.

alter table public.sn_jobs
  add column if not exists "ownerId" text,
  add column if not exists "postingPlanId" text default 'free',
  add column if not exists "expiresAt" timestamptz;

update public.sn_jobs
set "postingPlanId" = coalesce(nullif("postingPlanId", ''), 'free')
where "postingPlanId" is null or "postingPlanId" = '';

-- Existing active free jobs without expiry get a 5-day window from createdAt.
update public.sn_jobs
set "expiresAt" = coalesce("createdAt", now()) + interval '5 days'
where "postingPlanId" = 'free'
  and "expiresAt" is null
  and status = 'Active';

create index if not exists idx_sn_jobs_status
  on public.sn_jobs(status);

create index if not exists idx_sn_jobs_employer_email
  on public.sn_jobs("EmployerEmail");

create index if not exists idx_sn_jobs_owner_id
  on public.sn_jobs("ownerId");

create index if not exists idx_sn_jobs_expires_at
  on public.sn_jobs("expiresAt");

-- Normalize old statuses if any lowercase values exist.
update public.sn_jobs
set status = 'Active'
where lower(coalesce(status, '')) = 'active';

-- Quick verification
select
  id,
  role,
  company,
  status,
  "EmployerEmail",
  "ownerId",
  "postingPlanId",
  "createdAt",
  "expiresAt"
from public.sn_jobs
order by "createdAt" desc
limit 50;
