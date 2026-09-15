import { Router, Request, Response, NextFunction } from "express";
import { store } from "../store";
import { patchEntity } from "../repository";
import { createCrudRouter } from "./crud";

const router = Router();
const table = "ambassadors";

const wrap = (fn: (req: Request, res: Response) => Promise<Response | void>) =>
  (req: Request, res: Response, next: NextFunction) => Promise.resolve(fn(req, res)).catch(next);

router.patch("/:id/status", wrap(async (req, res) => {
  const allowed = ["Active", "Pending", "Suspended"];
  if (!allowed.includes(req.body.status)) return res.status(400).json({ error: "Invalid ambassador status" });
  const ambassador = await patchEntity(table, store.ambassadors, req.params.id, {
    status: req.body.status,
    updatedAt: new Date().toISOString(),
  });
  if (!ambassador) return res.status(404).json({ error: "Ambassador not found" });
  res.json({ data: ambassador });
}));

router.use(createCrudRouter(store.ambassadors, {
  prefix: "AMB",
  entityName: "Ambassador",
  table,
  required: ["name", "email", "phone", "college", "city"],
}));

export default router;
