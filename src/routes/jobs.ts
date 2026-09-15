import { Router, Request, Response } from "express";
import { store } from "../store";
import { createCrudRouter } from "./crud";

const router = Router();
const crud = createCrudRouter(store.jobs, {
  prefix: "JOB",
  entityName: "Job",
  required: ["role", "company", "location", "type", "status"],
});

router.patch("/:id/status", (req: Request, res: Response) => {
  const job = store.jobs.find((item) => item.id === req.params.id);
  if (!job) return res.status(404).json({ error: "Job not found" });
  const allowed = ["Pending", "Active", "Closed"];
  if (!allowed.includes(req.body.status)) return res.status(400).json({ error: "Invalid job status" });
  job.status = req.body.status;
  job.updatedAt = new Date().toISOString();
  res.json({ data: job });
});

router.patch("/:id/featured", (req: Request, res: Response) => {
  const job = store.jobs.find((item) => item.id === req.params.id);
  if (!job) return res.status(404).json({ error: "Job not found" });
  job.featured = Boolean(req.body.featured);
  job.updatedAt = new Date().toISOString();
  res.json({ data: job });
});

router.use(crud);

export default router;
