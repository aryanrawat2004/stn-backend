import { Router, Request, Response, NextFunction } from "express";
import { store } from "../store";
import { listEntities } from "../repository";

const router = Router();

const wrap = (fn: (req: Request, res: Response) => Promise<Response | void>) =>
  (req: Request, res: Response, next: NextFunction) => Promise.resolve(fn(req, res)).catch(next);

router.get("/traffic", wrap(async (_req, res) => {
  const [jobs, candidates, employers, companies] = await Promise.all([
    listEntities("jobs", store.jobs, { limit: 100 }),
    listEntities("candidates", store.candidates, { limit: 100 }),
    listEntities("employers", store.employers, { limit: 100 }),
    listEntities("companies", store.companies, { limit: 100 }),
  ]);

  const pageViews = jobs.data.reduce((sum, job) => sum + Number(job.applications || 0), 0) * 4 + 120;
  const visitors = Math.max(candidates.data.length + employers.data.length + companies.data.length, 1) * 37;
  const sessions = Math.round(visitors * 1.22);

  res.json({
    data: {
      activeNow: candidates.data.filter((candidate) => candidate.accountStatus === "Active").length,
      uniqueVisitors: visitors,
      pageViews,
      sessions,
      avgActiveSeconds: 240,
    },
  });
}));

router.get("/pages", async (_req, res) => {
  res.json({ data: [
    { path: "/jobs", views: 20, visitors: 1, activeSeconds: 263 },
    { path: "/talent", views: 13, visitors: 1, activeSeconds: 266 },
    { path: "/", views: 12, visitors: 1, activeSeconds: 128 },
    { path: "/post-job", views: 6, visitors: 1, activeSeconds: 46 },
    { path: "/resume", views: 4, visitors: 1, activeSeconds: 66 },
  ] });
});

router.get("/sources", (_req, res) => {
  res.json({ data: [
    { source: "Direct", views: 6 },
    { source: "Google Search", views: 18 },
    { source: "LinkedIn", views: 9 },
    { source: "Referral", views: 4 },
  ] });
});

router.get("/devices", (_req, res) => {
  res.json({ data: [
    { device: "Desktop", views: 38 },
    { device: "Mobile", views: 25 },
    { device: "Tablet", views: 3 },
  ] });
});

router.get("/visitors", wrap(async (_req, res) => {
  const candidates = await listEntities("candidates", store.candidates, { limit: 100 });
  res.json({
    data: candidates.data.map((candidate, index) => ({
      id: `VIS-${String(index + 1).padStart(3, "0")}`,
      name: candidate.name,
      type: "Candidate",
      city: candidate.location,
      device: candidate.deviceType || "Desktop",
      source: "Direct",
      active: candidate.accountStatus === "Active",
      pages: ["/jobs", "/companies"],
      seconds: 246,
      time: candidate.lastActive || "",
    })),
  });
}));

export default router;
