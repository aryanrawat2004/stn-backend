import { Router, Request, Response, NextFunction } from "express";
import { store } from "../store";
import { patchEntity } from "../repository";
import { createCrudRouter } from "./crud";

const router = Router();
const table = "companies";

const wrap = (fn: (req: Request, res: Response) => Promise<Response | void>) =>
  (req: Request, res: Response, next: NextFunction) => Promise.resolve(fn(req, res)).catch(next);

router.patch("/:id/verify", wrap(async (req, res) => {
  const current = store.companies.find((item) => item.id === req.params.id);
  const verified = req.body.verified ?? !(current?.verified ?? false);
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
