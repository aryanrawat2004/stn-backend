alter table if exists candidate_verifications
  add column if not exists full_name text,
  add column if not exists phone text,
  add column if not exists current_role text,
  add column if not exists experience text,
  add column if not exists location text,
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
  add column if not exists payment_order_id text;

alter table if exists sn_candidates
  add column if not exists is_verified boolean not null default false,
  add column if not exists verification_valid_until timestamptz,
  add column if not exists verification_priority integer not null default 0;

update candidate_verifications
set
  aadhaar_status = coalesce(aadhaar_status, 'pending'),
  employment_status = coalesce(employment_status, 'pending'),
  police_status = coalesce(police_status, 'pending')
where true;
