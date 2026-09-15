import { Router, Request, Response, NextFunction } from "express";
import { store } from "../store";
import { patchEntity } from "../repository";
import { createCrudRouter } from "./crud";

const router = Router();
const table = "applications";

const wrap = (fn: (req: Request, res: Response) => Promise<Response | void>) =>
  (req: Request, res: Response, next: NextFunction) => Promise.resolve(fn(req, res)).catch(next);

router.patch("/:id/status", wrap(async (req, res) => {
  const allowed = ["Applied", "Screening", "Interview", "Offer", "Joined", "Rejected"];
  if (!allowed.includes(req.body.status)) return res.status(400).json({ error: "Invalid application status" });
  const application = await patchEntity(table, store.applications, req.params.id, {
    status: req.body.status,
    updatedAt: new Date().toISOString(),
  });
  if (!application) return res.status(404).json({ error: "Application not found" });
  res.json({ data: application });
}));

router.use(createCrudRouter(store.applications, {
  prefix: "APP",
  entityName: "Application",
  table,
  required: ["jobId", "candidateId", "status"],
}));

export default router;
