import { Router, Request, Response } from "express";
import { store } from "../store";
import { createCrudRouter } from "./crud";

const router = Router();

router.patch("/:id/status", (req: Request, res: Response) => {
  const application = store.applications.find((item) => item.id === req.params.id);
  if (!application) return res.status(404).json({ error: "Application not found" });
  const allowed = ["Applied", "Screening", "Interview", "Offer", "Joined", "Rejected"];
  if (!allowed.includes(req.body.status)) return res.status(400).json({ error: "Invalid application status" });
  application.status = req.body.status;
  application.updatedAt = new Date().toISOString();
  res.json({ data: application });
});

router.use(createCrudRouter(store.applications, {
  prefix: "APP",
  entityName: "Application",
  required: ["jobId", "candidateId", "status"],
}));

export default router;
