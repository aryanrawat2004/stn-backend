# SolarNaukri Backend

Express + TypeScript backend for the SolarNaukri admin platform.

## Features

- Full CRUD APIs for jobs, candidates, employers, companies, categories, ambassadors, applications and activities
- Recruiter and job-seeker aliases for the frontend user-role screens
- Job approval/status and featured controls
- Candidate, employer and company verification/status controls
- Company verification approval/rejection workflow
- Dashboard summary and snapshot APIs
- Traffic, pages, sources, devices and visitor analytics endpoints
- Platform settings API
- Swagger/OpenAPI documentation
- Supabase persistence when credentials are configured
- In-memory fallback for local development without Supabase

## Requirements

- Node.js 22 recommended
- npm
- Optional: Supabase project

## Local setup

```bash
npm install
```

Copy the environment template:

```bash
copy .env.example .env
```

Configure `.env`:

```env
PORT=5000
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

If `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are omitted, the backend automatically runs with its in-memory fallback data.

Start development server:

```bash
npm run dev
```

Build TypeScript:

```bash
npm run build
```

## Swagger

- Swagger UI: `http://localhost:5000/api-docs`
- OpenAPI JSON: `http://localhost:5000/api-docs.json`
- Health: `http://localhost:5000/health`

## Supabase database

Run the SQL file below in the Supabase SQL Editor:

```text
supabase/schema.sql
```

It creates the tables required for:

- jobs
- candidates
- employers
- companies
- categories
- ambassadors
- applications
- activities
- settings

## Main API routes

### Dashboard

- `GET /api/admin/dashboard/summary`
- `GET /api/admin/dashboard/snapshot`
- `GET /api/admin/dashboard/recent-activity`

### Jobs

- `GET /api/admin/jobs`
- `GET /api/admin/jobs/:id`
- `POST /api/admin/jobs`
- `PUT /api/admin/jobs/:id`
- `PATCH /api/admin/jobs/:id`
- `PATCH /api/admin/jobs/:id/status`
- `PATCH /api/admin/jobs/:id/featured`
- `DELETE /api/admin/jobs/:id`

### Candidates / Job Seekers

- CRUD: `/api/admin/candidates`
- Alias: `/api/admin/job-seekers`
- `PATCH /api/admin/candidates/:id/verify`
- `PATCH /api/admin/candidates/:id/status`

### Employers / Recruiters

- CRUD: `/api/admin/employers`
- Alias: `/api/admin/recruiters`
- `PATCH /api/admin/employers/:id/verify`
- `PATCH /api/admin/employers/:id/status`

### Companies

- CRUD: `/api/admin/companies`
- `PATCH /api/admin/companies/:id/verify`
- `PATCH /api/admin/companies/:id/status`

### Categories

- CRUD: `/api/admin/categories`
- `PATCH /api/admin/categories/:id/status`

### Ambassadors

- CRUD: `/api/admin/ambassadors`
- `PATCH /api/admin/ambassadors/:id/status`

### Applications

- CRUD: `/api/admin/applications`
- `PATCH /api/admin/applications/:id/status`

### Activities

- CRUD: `/api/admin/activities`

### Analytics

- `GET /api/admin/analytics/traffic`
- `GET /api/admin/analytics/pages`
- `GET /api/admin/analytics/sources`
- `GET /api/admin/analytics/devices`
- `GET /api/admin/analytics/visitors`

### Company verification

- `GET /api/admin/verification/companies`
- `PATCH /api/admin/verification/companies/:id/approve`
- `PATCH /api/admin/verification/companies/:id/reject`

### Platform settings

- `GET /api/admin/settings`
- `PUT /api/admin/settings`
- `PATCH /api/admin/settings`

## Query support

CRUD list endpoints support:

```text
?search=solar
?status=Active
?page=1
?limit=20
?sort=createdAt:desc
```

## Response examples

List response:

```json
{
  "data": [],
  "meta": {
    "total": 0,
    "page": 1,
    "limit": 50
  }
}
```

Single object response:

```json
{
  "data": {
    "id": "JOB-12345678"
  }
}
```

Error response:

```json
{
  "error": "Job not found"
}
```

## Security notes

- Never commit `.env`.
- Keep `SUPABASE_SERVICE_ROLE_KEY` on the backend only.
- The service-role key bypasses Supabase RLS and must never be exposed to the frontend.
- Add authentication/RBAC middleware before exposing admin endpoints publicly.
