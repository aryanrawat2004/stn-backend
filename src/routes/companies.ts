import { Router, Request, Response, NextFunction } from "express";
import { store } from "../store";
import { getEntity, patchEntity } from "../repository";
import { createCrudRouter } from "./crud";

const router = Router();
const table = "companies";

const wrap = (fn: (req: Request, res: Response) => Promise<Response | void>) =>
  (req: Request, res: Response, next: NextFunction) => Promise.resolve(fn(req, res)).catch(next);

router.patch("/:id/verify", wrap(async (req, res) => {
  const current = await getEntity(table, store.companies, req.params.id);
  if (!current) return res.status(404).json({ error: "Company not found" });
  const verified = req.body.verified ?? !Boolean(current.verified);
  const company = await patchEntity(table, store.companies, req.params.id, {
    verified,
    verificationStatus: verified ? "Approved" : "Pending",
    updatedAt: new Date().toISOString(),
  });
  if (!company) return res.status(404).json({ error: "Company not found" });
  res.json({ data: company });
}));

router.patch("/:id/status", wrap(async (req, res) => {
  const allowed = ["Active", "Pending", "Suspended"];
  if (!allowed.includes(req.body.status)) return res.status(400).json({ error: "Invalid company status" });
  const company = await patchEntity(table, store.companies, req.params.id, {
    status: req.body.status,
    updatedAt: new Date().toISOString(),
  });
  if (!company) return res.status(404).json({ error: "Company not found" });
  res.json({ data: company });
}));

router.use(createCrudRouter(store.companies, {
  prefix: "COM",
  entityName: "Company",
  table,
  required: ["companyName", "industry", "location", "email", "phone"],
}));

export default router;
