import { Router, Request, Response } from "express";
import { store } from "../store";
import { createCrudRouter } from "./crud";

const router = Router();

router.patch("/:id/verify", (req: Request, res: Response) => {
  const candidate = store.candidates.find((item) => item.id === req.params.id);
  if (!candidate) return res.status(404).json({ error: "Candidate not found" });
  candidate.verified = req.body.verified ?? !candidate.verified;
  candidate.updatedAt = new Date().toISOString();
  res.json({ data: candidate });
});

router.patch("/:id/status", (req: Request, res: Response) => {
  const candidate = store.candidates.find((item) => item.id === req.params.id);
  if (!candidate) return res.status(404).json({ error: "Candidate not found" });
  const allowed = ["Active", "Suspended"];
  if (!allowed.includes(req.body.status)) return res.status(400).json({ error: "Invalid candidate status" });
  candidate.accountStatus = req.body.status;
  candidate.updatedAt = new Date().toISOString();
  res.json({ data: candidate });
});

router.use(createCrudRouter(store.candidates, {
  prefix: "CAN",
  entityName: "Candidate",
  required: ["name", "email", "phone", "role", "location"],
}));

export default router;
