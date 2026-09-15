import { Router, Request, Response, NextFunction } from "express";
import { store } from "../store";
import { patchEntity } from "../repository";
import { requireWriteRoles } from "../middleware/rbac";
import { createCrudRouter } from "./crud";

const router = Router();
const table = "jobs";

const wrap = (fn: (req: Request, res: Response) => Promise<Response | void>) =>
  (req: Request, res: Response, next: NextFunction) => Promise.resolve(fn(req, res)).catch(next);

// Reading job data stays public. Any create/edit/delete/status change must be
// performed by a recruiter, campus ambassador, or admin.
router.use(requireWriteRoles("recruiter", "ambassador", "admin"));

router.patch("/:id/status", wrap(async (req, res) => {
  const allowed = ["Pending", "Active", "Closed"];
  if (!allowed.includes(req.body.status)) return res.status(400).json({ error: "Invalid job status" });
  const job = await patchEntity(table, store.jobs, req.params.id, { status: req.body.status, updatedAt: new Date().toISOString() });
  if (!job) return res.status(404).json({ error: "Job not found" });
  res.json({ data: job });
}));

router.patch("/:id/featured", wrap(async (req, res) => {
  const job = await patchEntity(table, store.jobs, req.params.id, { featured: Boolean(req.body.featured), updatedAt: new Date().toISOString() });
  if (!job) return res.status(404).json({ error: "Job not found" });
  res.json({ data: job });
}));

router.use(createCrudRouter(store.jobs, {
  prefix: "JOB",
  entityName: "Job",
  table,
  required: ["role", "company", "location", "type", "status"],
}));

export default router;
