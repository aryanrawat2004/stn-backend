import { Router } from "express";
import { store } from "../store";

const router = Router();

router.get("/traffic", (_req, res) => {
  const pageViews = store.jobs.reduce((sum, job) => sum + Number(job.applications || 0), 0) * 4 + 120;
  const visitors = Math.max(store.candidates.length + store.employers.length + store.companies.length, 1) * 37;
  const sessions = Math.round(visitors * 1.22);
  res.json({ data: { activeNow: 0, uniqueVisitors: visitors, pageViews, sessions, avgActiveSeconds: 240 } });
});

router.get("/pages", (_req, res) => {
  const data = [
    { path: "/jobs", views: 20, visitors: 1, activeSeconds: 263 },
    { path: "/talent", views: 13, visitors: 1, activeSeconds: 266 },
    { path: "/", views: 12, visitors: 1, activeSeconds: 128 },
    { path: "/post-job", views: 6, visitors: 1, activeSeconds: 46 },
    { path: "/resume", views: 4, visitors: 1, activeSeconds: 66 },
  ];
  res.json({ data });
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

router.get("/visitors", (_req, res) => {
  res.json({
    data: store.candidates.map((candidate, index) => ({
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
});

export default router;
