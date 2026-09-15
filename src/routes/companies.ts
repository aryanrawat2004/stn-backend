import { Router, Request, Response } from "express";
import { store } from "../store";
import { createCrudRouter } from "./crud";

const router = Router();

router.patch("/:id/verify", (req: Request, res: Response) => {
  const company = store.companies.find((item) => item.id === req.params.id);
  if (!company) return res.status(404).json({ error: "Company not found" });
  company.verified = req.body.verified ?? !company.verified;
  company.verificationStatus = company.verified ? "Approved" : "Pending";
  company.updatedAt = new Date().toISOString();
  res.json({ data: company });
});

router.patch("/:id/status", (req: Request, res: Response) => {
  const company = store.companies.find((item) => item.id === req.params.id);
  if (!company) return res.status(404).json({ error: "Company not found" });
  const allowed = ["Active", "Pending", "Suspended"];
  if (!allowed.includes(req.body.status)) return res.status(400).json({ error: "Invalid company status" });
  company.status = req.body.status;
  company.updatedAt = new Date().toISOString();
  res.json({ data: company });
});

router.use(createCrudRouter(store.companies, {
  prefix: "COM",
  entityName: "Company",
  required: ["companyName", "industry", "location", "email", "phone"],
}));

export default router;
