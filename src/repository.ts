import { supabase } from "./db";
import { Entity } from "./store";

export interface QueryOptions {
  search?: string;
  status?: string;
  page?: number;
  limit?: number;
  sort?: string;
}

type RouteId = string | string[];

function normalizeId(id: RouteId): string {
  return Array.isArray(id) ? id[0] ?? "" : id;
}

function db() {
  if (!supabase) {
    throw new Error("Database is not configured. Set the Supabase environment variables before starting the backend.");
  }
  return supabase;
}

export function resolveTableName(table: string): string {
  return table.startsWith("sn_") ? table : `sn_${table}`;
}

export async function listEntities(table: string, _fallback: Entity[], options: QueryOptions = {}) {
  const { data, error } = await db().from(resolveTableName(table)).select("*");
  if (error) throw error;
  let rows = (data || []) as Entity[];

  if (options.search) {
    const q = options.search.toLowerCase();
    rows = rows.filter((item) => JSON.stringify(item).toLowerCase().includes(q));
  }

  if (options.status) rows = rows.filter((item) => String(item.status) === options.status);

  // Public job listings must not surface expired free postings. This keeps the
  // shared /api/jobs catalog consistent for every candidate, regardless of
  // which employer created the job.
  if (resolveTableName(table) === "sn_jobs") {
    const now = Date.now();
    rows = rows.filter((item) => {
      const expiresAt = item.expiresAt;
      if (!expiresAt) return true;
      const timestamp = new Date(String(expiresAt)).getTime();
      return Number.isNaN(timestamp) || timestamp > now;
    });
  }

  if (options.sort) {
    const [field, direction = "asc"] = options.sort.split(":");
    rows.sort((a, b) => {
      const av = a[field];
      const bv = b[field];
      if (av === bv) return 0;
      const value = av > bv ? 1 : -1;
      return direction === "desc" ? -value : value;
    });
  }

  const page = Math.max(1, options.page || 1);
  const limit = Math.min(200, Math.max(1, options.limit || 50));
  const start = (page - 1) * limit;

  return {
    data: rows.slice(start, start + limit),
    meta: { total: rows.length, page, limit },
  };
}

export async function getEntity(table: string, _fallback: Entity[], id: RouteId) {
  const entityId = normalizeId(id);
  const { data, error } = await db().from(resolveTableName(table)).select("*").eq("id", entityId).maybeSingle();
  if (error) throw error;
  return (data || null) as Entity | null;
}

export async function createEntity(table: string, _fallback: Entity[], item: Entity) {
  const { data, error } = await db().from(resolveTableName(table)).insert(item).select().single();
  if (error) throw error;
  return data as Entity;
}

export async function replaceEntity(table: string, _fallback: Entity[], id: RouteId, item: Entity) {
  const entityId = normalizeId(id);
  const { data, error } = await db().from(resolveTableName(table)).upsert({ ...item, id: entityId }).select().single();
  if (error) throw error;
  return data as Entity;
}

export async function patchEntity(table: string, _fallback: Entity[], id: RouteId, patch: Record<string, any>) {
  const entityId = normalizeId(id);
  const { data, error } = await db().from(resolveTableName(table)).update(patch).eq("id", entityId).select().maybeSingle();
  if (error) throw error;
  return (data || null) as Entity | null;
}

export async function deleteEntity(table: string, _fallback: Entity[], id: RouteId) {
  const entityId = normalizeId(id);
  const { data, error } = await db().from(resolveTableName(table)).delete().eq("id", entityId).select().maybeSingle();
  if (error) throw error;
  return (data || null) as Entity | null;
}
