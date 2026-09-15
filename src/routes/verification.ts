import { Router, Request, Response } from "express";
import { store } from "../store";

const router = Router();

router.get("/companies", (_req, res) => {
  const data = store.companies.filter((company) => !company.verified || company.status === "Pending");
  res.json({ data });
});

router.patch("/companies/:id/approve", (req: Request, res: Response) => {
  const company = store.companies.find((item) => item.id === req.params.id);
  if (!company) return res.status(404).json({ error: "Company not found" });
  company.verified = true;
  company.status = "Active";
  company.verificationStatus = "Approved";
  company.updatedAt = new Date().toISOString();
  res.json({ data: company });
});

router.patch("/companies/:id/reject", (req: Request, res: Response) => {
  const company = store.companies.find((item) => item.id === req.params.id);
  if (!company) return res.status(404).json({ error: "Company not found" });
  company.verified = false;
  company.status = "Suspended";
  company.verificationStatus = "Rejected";
  company.verificationReason = req.body.reason || "Verification rejected";
  company.updatedAt = new Date().toISOString();
  res.json({ data: company });
});

export default router;
