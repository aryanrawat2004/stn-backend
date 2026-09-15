import { Router, Request, Response, NextFunction } from "express";
import { store } from "../store";
import { listEntities } from "../repository";

const router = Router();

const wrap = (fn: (req: Request, res: Response) => Promise<Response | void>) =>
  (req: Request, res: Response, next: NextFunction) => Promise.resolve(fn(req, res)).catch(next);

async function loadDashboardData() {
  const [jobs, candidates, employers, companies, categories, ambassadors, applications, activities] = await Promise.all([
    listEntities("jobs", store.jobs, { limit: 100 }),
    listEntities("candidates", store.candidates, { limit: 100 }),
    listEntities("employers", store.employers, { limit: 100 }),
    listEntities("companies", store.companies, { limit: 100 }),
    listEntities("categories", store.categories, { limit: 100 }),
    listEntities("ambassadors", store.ambassadors, { limit: 100 }),
    listEntities("applications", store.applications, { limit: 100 }),
    listEntities("activities", store.activities, { limit: 100 }),
  ]);

  return {
    jobs: jobs.data,
    candidates: candidates.data,
    employers: employers.data,
    companies: companies.data,
    categories: categories.data,
    ambassadors: ambassadors.data,
    applications: applications.data,
    activities: activities.data,
  };
}

router.get("/summary", wrap(async (_req, res) => {
  const data = await loadDashboardData();
  const activeJobs = data.jobs.filter((job) => job.status === "Active").length;
  const pendingJobs = data.jobs.filter((job) => job.status === "Pending").length;
  const applicationTotal = data.jobs.reduce((sum, job) => sum + Number(job.applications || 0), 0);
  const pendingCompanies = data.companies.filter((company) => !company.verified || company.status === "Pending").length;

  res.json({
    data: {
      jobs: data.jobs.length,
      activeJobs,
      pendingJobs,
      candidates: data.candidates.length,
      employers: data.employers.length,
      companies: data.companies.length,
      pendingCompanies,
      categories: data.categories.length,
      ambassadors: data.ambassadors.length,
      applications: data.applications.length || applicationTotal,
    },
  });
}));

router.get("/snapshot", wrap(async (_req, res) => {
  const data = await loadDashboardData();
  res.json({
    data: {
      totalJobPostings: data.jobs.length,
      companies: data.companies.length,
      candidates: data.candidates.length,
      employers: data.employers.length,
      applications: data.applications.length,
      activeJobs: data.jobs.filter((job) => job.status === "Active").length,
      pendingJobs: data.jobs.filter((job) => job.status === "Pending").length,
    },
  });
}));

router.get("/recent-activity", wrap(async (req, res) => {
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));
  const result = await listEntities("activities", store.activities, { limit });
  res.json({ data: result.data, meta: result.meta });
}));

export default router;
