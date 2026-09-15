import { Router, Request, Response } from "express";
import { Entity, nextId } from "../store";

interface CrudOptions {
  prefix: string;
  entityName: string;
  required?: string[];
}

export function createCrudRouter(items: Entity[], options: CrudOptions) {
  const router = Router();
  const { prefix, entityName, required = [] } = options;

  router.get("/", (req: Request, res: Response) => {
    const { search = "", status, page = "1", limit = "50", sort = "" } = req.query;
    let result = [...items];

    if (search) {
      const q = String(search).toLowerCase();
      result = result.filter((item) => JSON.stringify(item).toLowerCase().includes(q));
    }

    if (status) result = result.filter((item) => String(item.status) === String(status));

    if (sort) {
      const [field, direction = "asc"] = String(sort).split(":");
      result.sort((a, b) => {
        const av = a[field];
        const bv = b[field];
        if (av === bv) return 0;
        const value = av > bv ? 1 : -1;
        return direction === "desc" ? -value : value;
      });
    }

    const pageNumber = Math.max(1, Number(page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(limit) || 50));
    const start = (pageNumber - 1) * pageSize;

    res.json({
      data: result.slice(start, start + pageSize),
      meta: { total: result.length, page: pageNumber, limit: pageSize },
    });
  });

  router.get("/:id", (req: Request, res: Response) => {
    const item = items.find((entry) => entry.id === req.params.id);
    if (!item) return res.status(404).json({ error: `${entityName} not found` });
    res.json({ data: item });
  });

  router.post("/", (req: Request, res: Response) => {
    const missing = required.filter((field) => req.body?.[field] === undefined || req.body?.[field] === "");
    if (missing.length) return res.status(400).json({ error: `Missing required fields: ${missing.join(", ")}` });

    const item: Entity = {
      ...req.body,
      id: req.body.id || nextId(prefix, items),
      createdAt: req.body.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    items.push(item);
    res.status(201).json({ data: item });
  });

  router.put("/:id", (req: Request, res: Response) => {
    const index = items.findIndex((entry) => entry.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: `${entityName} not found` });

    const missing = required.filter((field) => req.body?.[field] === undefined || req.body?.[field] === "");
    if (missing.length) return res.status(400).json({ error: `Missing required fields: ${missing.join(", ")}` });

    items[index] = {
      ...req.body,
      id: req.params.id,
      createdAt: items[index].createdAt,
      updatedAt: new Date().toISOString(),
    };
    res.json({ data: items[index] });
  });

  router.patch("/:id", (req: Request, res: Response) => {
    const index = items.findIndex((entry) => entry.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: `${entityName} not found` });
    items[index] = { ...items[index], ...req.body, id: req.params.id, updatedAt: new Date().toISOString() };
    res.json({ data: items[index] });
  });

  router.delete("/:id", (req: Request, res: Response) => {
    const index = items.findIndex((entry) => entry.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: `${entityName} not found` });
    const [deleted] = items.splice(index, 1);
    res.json({ success: true, data: deleted });
  });

  return router;
}
