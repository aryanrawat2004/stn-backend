import { Router, Request, Response, NextFunction } from "express";
import { store } from "../store";
import { patchEntity } from "../repository";
import { createCrudRouter } from "./crud";

const router = Router();
const table = "employers";

const wrap = (fn: (req: Request, res: Response) => Promise<Response | void>) =>
  (req: Request, res: Response, next: NextFunction) => Promise.resolve(fn(req, res)).catch(next);

router.patch("/:id/verify", wrap(async (req, res) => {
  const current = store.employers.find((item) => item.id === req.params.id);
  const verified = req.body.verified ?? !(current?.verified ?? false);
  const employer = await patchEntity(table, store.employers, req.params.id, {
    verified,
    status: verified ? "Approved" : "Pending Verification",
    updatedAt: new Date().toISOString(),
  });
  if (!employer) return res.status(404).json({ error: "Employer not found" });
  res.json({ data: employer });
}));

router.patch("/:id/status", wrap(async (req, res) => {
  const allowed = ["Approved", "Pending Verification", "Suspended"];
  if (!allowed.includes(req.body.status)) return res.status(400).json({ error: "Invalid employer status" });
  const employer = await patchEntity(table, store.employers, req.params.id, {
    status: req.body.status,
    verified: req.body.status === "Approved",
    updatedAt: new Date().toISOString(),
  });
  if (!employer) return res.status(404).json({ error: "Employer not found" });
  res.json({ data: employer });
}));

router.use(createCrudRouter(store.employers, {
  prefix: "EMP",
  entityName: "Employer",
  table,
  required: ["companyName", "contactPerson", "email", "location"],
}));

export default router;
