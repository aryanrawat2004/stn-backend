import { randomUUID } from "crypto";
import { Router, Request, Response, NextFunction } from "express";
import { Entity } from "../store";
import {
  createEntity,
  deleteEntity,
  getEntity,
  listEntities,
  patchEntity,
  replaceEntity,
} from "../repository";

interface CrudOptions {
  prefix: string;
  entityName: string;
  table: string;
  required?: string[];
}

function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void | Response>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function generateId(prefix: string) {
  return `${prefix}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

export function createCrudRouter(items: Entity[], options: CrudOptions) {
  const router = Router();
  const { prefix, entityName, table, required = [] } = options;

  router.get(
    "/",
    asyncHandler(async (req, res) => {
      const result = await listEntities(table, items, {
        search: req.query.search ? String(req.query.search) : undefined,
        status: req.query.status ? String(req.query.status) : undefined,
        page: Number(req.query.page) || 1,
        limit: Number(req.query.limit) || 50,
        sort: req.query.sort ? String(req.query.sort) : undefined,
      });
      res.json(result);
    }),
  );

  router.get(
    "/:id",
    asyncHandler(async (req, res) => {
      const item = await getEntity(table, items, req.params.id);
      if (!item) return res.status(404).json({ error: `${entityName} not found` });
      res.json({ data: item });
    }),
  );

  router.post(
    "/",
    asyncHandler(async (req, res) => {
      const missing = required.filter(
        (field) => req.body?.[field] === undefined || req.body?.[field] === "",
      );
      if (missing.length) {
        return res.status(400).json({ error: `Missing required fields: ${missing.join(", ")}` });
      }

      const now = new Date().toISOString();
      const item: Entity = {
        ...req.body,
        id: req.body.id || generateId(prefix),
        createdAt: req.body.createdAt || now,
        updatedAt: now,
      };

      const created = await createEntity(table, items, item);
      res.status(201).json({ data: created });
    }),
  );

  router.put(
    "/:id",
    asyncHandler(async (req, res) => {
      const existing = await getEntity(table, items, req.params.id);
      if (!existing) return res.status(404).json({ error: `${entityName} not found` });

      const missing = required.filter(
        (field) => req.body?.[field] === undefined || req.body?.[field] === "",
      );
      if (missing.length) {
        return res.status(400).json({ error: `Missing required fields: ${missing.join(", ")}` });
      }

      const updated = await replaceEntity(table, items, req.params.id, {
        ...req.body,
        id: req.params.id,
        createdAt: existing.createdAt,
        updatedAt: new Date().toISOString(),
      });

      res.json({ data: updated });
    }),
  );

  router.patch(
    "/:id",
    asyncHandler(async (req, res) => {
      const updated = await patchEntity(table, items, req.params.id, {
        ...req.body,
        updatedAt: new Date().toISOString(),
      });
      if (!updated) return res.status(404).json({ error: `${entityName} not found` });
      res.json({ data: updated });
    }),
  );

  router.delete(
    "/:id",
    asyncHandler(async (req, res) => {
      const deleted = await deleteEntity(table, items, req.params.id);
      if (!deleted) return res.status(404).json({ error: `${entityName} not found` });
      res.json({ success: true, data: deleted });
    }),
  );

  return router;
}
