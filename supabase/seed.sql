insert into jobs (id, role, company, location, type, salary, "postedDate", applications, status, featured)
values
  ('JOB-101', 'Solar Design Engineer', 'GreenRay Enterprises', 'Jaipur, Rajasthan', 'Full Time', '₹6 - 9 LPA', '2026-09-06', 34, 'Active', true),
  ('JOB-102', 'Project Manager — Solar EPC', 'HelioGrid Renewables', 'Hyderabad, Telangana', 'Full Time', '₹12 - 18 LPA', '2026-09-05', 28, 'Active', true),
  ('JOB-103', 'BESS Electrical Engineer', 'Ampere Storage Labs', 'Bengaluru, Karnataka', 'Full Time', '₹8 - 12 LPA', '2026-09-07', 21, 'Pending', false)
on conflict (id) do nothing;

insert into candidates (
  id, name, email, phone, role, location, experience, verified, "joinedDate", skills,
  "profileCompletion", "resumeStrength", "talentPassportScore", "accountStatus",
  "emailVerified", "phoneVerified", "deviceType", "deviceName", browser,
  "operatingSystem", "totalLogins", "applicationsCount", "savedJobsCount", "profileViews"
)
values (
  'CAN-201', 'Priya Sharma', 'priya.sharma@example.com', '+91 98765 43210',
  'Solar Design Engineer', 'Ahmedabad, Gujarat', '6 years', true, '2026-08-14',
  '["PVsyst","AutoCAD","HelioScope"]'::jsonb, 96, 91, 88, 'Active', true, true,
  'Desktop', 'Windows PC', 'Microsoft Edge 152', 'Windows 11', 27, 12, 8, 34
)
on conflict (id) do nothing;

insert into employers (id, "companyName", "contactPerson", email, location, "jobsPosted", verified, "joinedDate", status)
values
  ('EMP-301', 'GreenRay Enterprises', 'Rajesh Kumar', 'rajesh@greenray.in', 'Jaipur, Rajasthan', 12, true, '2026-06-10', 'Approved'),
  ('EMP-302', 'HelioGrid Renewables', 'Sonal Gupta', 'hr@heliogrid.com', 'Hyderabad, Telangana', 8, true, '2026-07-01', 'Approved'),
  ('EMP-303', 'Ampere Storage Labs', 'Vikram Shah', 'careers@amperestorage.com', 'Bengaluru, Karnataka', 4, false, '2026-09-01', 'Pending Verification')
on conflict (id) do nothing;

insert into companies (id, "companyName", industry, location, website, "contactPerson", email, phone, "jobsPosted", verified, status, "joinedDate", "verificationStatus")
values
  ('COM-001', 'GreenRay Enterprises', 'Solar EPC', 'Jaipur, Rajasthan', 'https://greenray.in', 'Rajesh Kumar', 'rajesh@greenray.in', '+91 98765 43210', 12, true, 'Active', '2026-06-10', 'Approved'),
  ('COM-002', 'HelioGrid Renewables', 'Renewable Energy', 'Hyderabad, Telangana', 'https://heliogrid.com', 'Sonal Gupta', 'hr@heliogrid.com', '+91 98111 22334', 8, true, 'Active', '2026-07-01', 'Approved')
on conflict (id) do nothing;

insert into categories (id, name, slug, description, "jobsCount", status)
values
  ('CAT-001', 'Rooftop Solar', 'rooftop-solar', 'Residential and commercial rooftop solar opportunities.', 26, 'Active'),
  ('CAT-002', 'Utility Scale Solar', 'utility-scale-solar', 'Large-scale solar plant and project opportunities.', 34, 'Active'),
  ('CAT-003', 'Manufacturing', 'manufacturing', 'Solar module, cell and equipment manufacturing jobs.', 18, 'Active')
on conflict (id) do nothing;

insert into ambassadors (id, name, email, phone, college, city, course, year, "referralCount", "joinedCandidates", status, "joinedDate")
values
  ('AMB-401', 'Riya Sharma', 'riya@example.com', '+91 98765 11111', 'JECRC University', 'Jaipur', 'B.Tech', '3rd Year', 26, 18, 'Active', '2026-08-20'),
  ('AMB-402', 'Karan Mehta', 'karan@example.com', '+91 98222 33333', 'Manipal University Jaipur', 'Jaipur', 'MBA', '2nd Year', 14, 9, 'Active', '2026-08-27')
on conflict (id) do nothing;

insert into applications (id, "jobId", "candidateId", status, "appliedAt", "updatedAt", notes)
values ('APP-001', 'JOB-101', 'CAN-201', 'Applied', '2026-09-10T10:00:00Z', '2026-09-10T10:00:00Z', '')
on conflict (id) do nothing;

insert into activities (id, type, title, description, time)
values
  ('ACT-1', 'employer', 'New employer registered', 'SunPeak Energy submitted company verification documents', '12 min ago'),
  ('ACT-2', 'job', 'Job posted awaiting approval', 'BESS Electrical Engineer from Ampere Storage Labs', '28 min ago'),
  ('ACT-3', 'candidate', 'Candidate skill verified', 'Priya Sharma uploaded PVsyst certification', '46 min ago')
on conflict (id) do nothing;
