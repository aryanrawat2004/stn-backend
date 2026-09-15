import { Router, Request, Response } from "express";
import { store } from "../store";
import { createCrudRouter } from "./crud";

const router = Router();

router.patch("/:id/status", (req: Request, res: Response) => {
  const ambassador = store.ambassadors.find((item) => item.id === req.params.id);
  if (!ambassador) return res.status(404).json({ error: "Ambassador not found" });
  const allowed = ["Active", "Pending", "Suspended"];
  if (!allowed.includes(req.body.status)) return res.status(400).json({ error: "Invalid ambassador status" });
  ambassador.status = req.body.status;
  ambassador.updatedAt = new Date().toISOString();
  res.json({ data: ambassador });
});

router.use(createCrudRouter(store.ambassadors, {
  prefix: "AMB",
  entityName: "Ambassador",
  required: ["name", "email", "phone", "college", "city"],
}));

export default router;
