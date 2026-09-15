import { Router } from "express";
import { store } from "../store";

const router = Router();

router.get("/summary", (_req, res) => {
  const activeJobs = store.jobs.filter((job) => job.status === "Active").length;
  const pendingJobs = store.jobs.filter((job) => job.status === "Pending").length;
  const applications = store.jobs.reduce((sum, job) => sum + Number(job.applications || 0), 0);
  const pendingCompanies = store.companies.filter((company) => !company.verified || company.status === "Pending").length;

  res.json({
    data: {
      jobs: store.jobs.length,
      activeJobs,
      pendingJobs,
      candidates: store.candidates.length,
      employers: store.employers.length,
      companies: store.companies.length,
      pendingCompanies,
      categories: store.categories.length,
      ambassadors: store.ambassadors.length,
      applications,
    },
  });
});

router.get("/snapshot", (_req, res) => {
  res.json({
    data: {
      totalJobPostings: store.jobs.length,
      companies: store.companies.length,
      candidates: store.candidates.length,
      employers: store.employers.length,
      applications: store.applications.length,
      activeJobs: store.jobs.filter((job) => job.status === "Active").length,
      pendingJobs: store.jobs.filter((job) => job.status === "Pending").length,
    },
  });
});

router.get("/recent-activity", (req, res) => {
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));
  res.json({ data: store.activities.slice(0, limit) });
});

export default router;
