create table if not exists jobs (
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

create table if not exists candidates (
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

create table if not exists employers (
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

create table if not exists companies (
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

create table if not exists categories (
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

create table if not exists ambassadors (
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

create table if not exists applications (
  id text primary key,
  "jobId" text references jobs(id) on delete cascade,
  "candidateId" text references candidates(id) on delete cascade,
  status text default 'Applied',
  "appliedAt" timestamptz default now(),
  "updatedAt" timestamptz default now(),
  notes text
);

create table if not exists activities (
  id text primary key,
  type text not null,
  title text not null,
  description text,
  time text,
  "createdAt" timestamptz default now(),
  "updatedAt" timestamptz default now()
);

create table if not exists settings (
  id text primary key default 'platform',
  "siteName" text default 'SolarNaukri',
  "contactEmail" text default 'admin@solarnaukri.com',
  "emailAlerts" boolean default true,
  "autoApproveVerified" boolean default false,
  "weeklyDigest" boolean default true,
  "createdAt" timestamptz default now(),
  "updatedAt" timestamptz default now()
);

create index if not exists idx_jobs_status on jobs(status);
create index if not exists idx_jobs_company on jobs(company);
create index if not exists idx_candidates_email on candidates(email);
create index if not exists idx_employers_email on employers(email);
create index if not exists idx_companies_status on companies(status);
create index if not exists idx_applications_job on applications("jobId");
create index if not exists idx_applications_candidate on applications("candidateId");

insert into settings (id) values ('platform') on conflict (id) do nothing;
