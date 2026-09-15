import { Router, Request, Response, NextFunction } from "express";
import { store } from "../store";
import { listEntities, patchEntity } from "../repository";

const router = Router();
const table = "companies";

const wrap = (fn: (req: Request, res: Response) => Promise<Response | void>) =>
  (req: Request, res: Response, next: NextFunction) => Promise.resolve(fn(req, res)).catch(next);

router.get("/companies", wrap(async (_req, res) => {
  const result = await listEntities(table, store.companies, { limit: 100 });
  const data = result.data.filter((company) => !company.verified || company.status === "Pending");
  res.json({ data, meta: { total: data.length } });
}));

router.patch("/companies/:id/approve", wrap(async (req, res) => {
  const company = await patchEntity(table, store.companies, req.params.id, {
    verified: true,
    status: "Active",
    verificationStatus: "Approved",
    verificationReason: null,
    updatedAt: new Date().toISOString(),
  });
  if (!company) return res.status(404).json({ error: "Company not found" });
  res.json({ data: company });
}));

router.patch("/companies/:id/reject", wrap(async (req, res) => {
  const company = await patchEntity(table, store.companies, req.params.id, {
    verified: false,
    status: "Suspended",
    verificationStatus: "Rejected",
    verificationReason: req.body.reason || "Verification rejected",
    updatedAt: new Date().toISOString(),
  });
  if (!company) return res.status(404).json({ error: "Company not found" });
  res.json({ data: company });
}));

export default router;
