import { Router, Request, Response } from "express";
import { store } from "../store";
import { createCrudRouter } from "./crud";

const router = Router();

router.patch("/:id/verify", (req: Request, res: Response) => {
  const employer = store.employers.find((item) => item.id === req.params.id);
  if (!employer) return res.status(404).json({ error: "Employer not found" });
  const verified = req.body.verified ?? !employer.verified;
  employer.verified = Boolean(verified);
  employer.status = employer.verified ? "Approved" : "Pending Verification";
  employer.updatedAt = new Date().toISOString();
  res.json({ data: employer });
});

router.patch("/:id/status", (req: Request, res: Response) => {
  const employer = store.employers.find((item) => item.id === req.params.id);
  if (!employer) return res.status(404).json({ error: "Employer not found" });
  const allowed = ["Approved", "Pending Verification", "Suspended"];
  if (!allowed.includes(req.body.status)) return res.status(400).json({ error: "Invalid employer status" });
  employer.status = req.body.status;
  employer.verified = req.body.status === "Approved";
  employer.updatedAt = new Date().toISOString();
  res.json({ data: employer });
});

router.use(createCrudRouter(store.employers, {
  prefix: "EMP",
  entityName: "Employer",
  required: ["companyName", "contactPerson", "email", "location"],
}));

export default router;
