import { Router, Request, Response } from "express";
import { store } from "../store";
import { createCrudRouter } from "./crud";

const router = Router();

router.patch("/:id/status", (req: Request, res: Response) => {
  const category = store.categories.find((item) => item.id === req.params.id);
  if (!category) return res.status(404).json({ error: "Category not found" });
  const allowed = ["Active", "Inactive"];
  if (!allowed.includes(req.body.status)) return res.status(400).json({ error: "Invalid category status" });
  category.status = req.body.status;
  category.updatedAt = new Date().toISOString();
  res.json({ data: category });
});

router.use(createCrudRouter(store.categories, {
  prefix: "CAT",
  entityName: "Category",
  required: ["name", "slug", "description"],
}));

export default router;
