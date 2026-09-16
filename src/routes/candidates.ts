import { Router, Request, Response, NextFunction } from "express";
import { store } from "../store";
import { getEntity, patchEntity } from "../repository";
import { createCrudRouter } from "./crud";

const router = Router();
const table = "candidates";

const wrap = (fn: (req: Request, res: Response) => Promise<Response | void>) =>
  (req: Request, res: Response, next: NextFunction) => Promise.resolve(fn(req, res)).catch(next);

router.patch("/:id/verify", wrap(async (req, res) => {
  const current = await getEntity(table, store.candidates, req.params.id);
  if (!current) return res.status(404).json({ error: "Candidate not found" });
  const verified = req.body.verified ?? !Boolean(current.verified);
  const candidate = await patchEntity(table, store.candidates, req.params.id, { verified, updatedAt: new Date().toISOString() });
  if (!candidate) return res.status(404).json({ error: "Candidate not found" });
  res.json({ data: candidate });
}));

router.patch("/:id/status", wrap(async (req, res) => {
  const allowed = ["Active", "Suspended"];
  if (!allowed.includes(req.body.status)) return res.status(400).json({ error: "Invalid candidate status" });
  const candidate = await patchEntity(table, store.candidates, req.params.id, { accountStatus: req.body.status, updatedAt: new Date().toISOString() });
  if (!candidate) return res.status(404).json({ error: "Candidate not found" });
  res.json({ data: candidate });
}));

router.use(createCrudRouter(store.candidates, {
  prefix: "CAN",
  entityName: "Candidate",
  table,
  required: ["name", "email", "phone", "role", "location"],
}));

export default router;
