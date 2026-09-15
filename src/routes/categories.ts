import { Router, Request, Response, NextFunction } from "express";
import { store } from "../store";
import { patchEntity } from "../repository";
import { createCrudRouter } from "./crud";

const router = Router();
const table = "categories";

const wrap = (fn: (req: Request, res: Response) => Promise<Response | void>) =>
  (req: Request, res: Response, next: NextFunction) => Promise.resolve(fn(req, res)).catch(next);

router.patch("/:id/status", wrap(async (req, res) => {
  const allowed = ["Active", "Inactive"];
  if (!allowed.includes(req.body.status)) return res.status(400).json({ error: "Invalid category status" });
  const category = await patchEntity(table, store.categories, req.params.id, {
    status: req.body.status,
    updatedAt: new Date().toISOString(),
  });
  if (!category) return res.status(404).json({ error: "Category not found" });
  res.json({ data: category });
}));

router.use(createCrudRouter(store.categories, {
  prefix: "CAT",
  entityName: "Category",
  table,
  required: ["name", "slug", "description"],
}));

export default router;
