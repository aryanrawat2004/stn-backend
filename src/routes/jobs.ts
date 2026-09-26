import { Router, Request, Response, NextFunction } from "express";
import { store } from "../store";
import { createEntity, patchEntity } from "../repository";
import { requireWriteRoles } from "../middleware/rbac";
import { createCrudRouter } from "./crud";

const router = Router();
const table = "jobs";

const wrap = (fn: (req: Request, res: Response) => Promise<Response | void>) =>
  (req: Request, res: Response, next: NextFunction) => Promise.resolve(fn(req, res)).catch(next);

// Reading job data stays public. Any create/edit/delete/status change must be
// performed by a Employer, campus ambassador, or admin.
router.use(requireWriteRoles("Employer", "ambassador", "admin"));

// Create jobs with server-side ownership and lifecycle metadata. The public
// catalog is shared across all employers; ownership is only used for employer
// management/reporting, never to hide jobs from candidates.
router.post("/", wrap(async (req, res) => {
  const required = ["role", "company", "location", "type"];
  const missing = required.filter((field) => req.body?.[field] === undefined || req.body?.[field] === "");
  if (missing.length) {
    return res.status(400).json({ error: `Missing required fields: ${missing.join(", ")}` });
  }

  const auth = res.locals.auth as { uid?: string | null; email?: string | null } | undefined;
  const now = new Date();
  const createdAt = req.body.createdAt ? new Date(req.body.createdAt) : now;
  const safeCreatedAt = Number.isNaN(createdAt.getTime()) ? now : createdAt;
  const postingPlanId = String(req.body.postingPlanId || "free");
  const defaultExpiry = postingPlanId === "free"
    ? new Date(safeCreatedAt.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString()
    : null;

  const item = {
    ...req.body,
    id: req.body.id || `JOB-${Date.now()}`,
    status: req.body.status || "Active",
    postingPlanId,
    expiresAt: req.body.expiresAt || defaultExpiry,
    ownerId: auth?.uid || req.body.ownerId || null,
    EmployerEmail: (auth?.email || req.body.EmployerEmail || "").trim().toLowerCase() || null,
    createdAt: safeCreatedAt.toISOString(),
    updatedAt: now.toISOString(),
  };

  const created = await createEntity(table, store.jobs, item);
  return res.status(201).json({ data: created });
}));

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
