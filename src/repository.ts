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

export function resolveTableName(table: string): string {
  return table.startsWith("sn_") ? table : `sn_${table}`;
}

export async function listEntities(table: string, fallback: Entity[], options: QueryOptions = {}) {
  let rows: Entity[];

  if (supabase) {
    const { data, error } = await supabase.from(resolveTableName(table)).select("*");
    if (error) throw error;
    rows = (data || []) as Entity[];
  } else {
    rows = [...fallback];
  }

  if (options.search) {
    const q = options.search.toLowerCase();
    rows = rows.filter((item) => JSON.stringify(item).toLowerCase().includes(q));
  }

  if (options.status) rows = rows.filter((item) => String(item.status) === options.status);

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
  const limit = Math.min(100, Math.max(1, options.limit || 50));
  const start = (page - 1) * limit;

  return {
    data: rows.slice(start, start + limit),
    meta: { total: rows.length, page, limit },
  };
}

export async function getEntity(table: string, fallback: Entity[], id: RouteId) {
  const entityId = normalizeId(id);

  if (supabase) {
    const { data, error } = await supabase.from(resolveTableName(table)).select("*").eq("id", entityId).maybeSingle();
    if (error) throw error;
    return (data || null) as Entity | null;
  }
  return fallback.find((item) => item.id === entityId) || null;
}

export async function createEntity(table: string, fallback: Entity[], item: Entity) {
  if (supabase) {
    const { data, error } = await supabase.from(resolveTableName(table)).insert(item).select().single();
    if (error) throw error;
    return data as Entity;
  }
  fallback.push(item);
  return item;
}

export async function replaceEntity(table: string, fallback: Entity[], id: RouteId, item: Entity) {
  const entityId = normalizeId(id);

  if (supabase) {
    const { data, error } = await supabase.from(resolveTableName(table)).upsert({ ...item, id: entityId }).select().single();
    if (error) throw error;
    return data as Entity;
  }
  const index = fallback.findIndex((entry) => entry.id === entityId);
  if (index === -1) return null;
  fallback[index] = { ...item, id: entityId };
  return fallback[index];
}

export async function patchEntity(table: string, fallback: Entity[], id: RouteId, patch: Record<string, any>) {
  const entityId = normalizeId(id);

  if (supabase) {
    const { data, error } = await supabase.from(resolveTableName(table)).update(patch).eq("id", entityId).select().maybeSingle();
    if (error) throw error;
    return (data || null) as Entity | null;
  }
  const index = fallback.findIndex((entry) => entry.id === entityId);
  if (index === -1) return null;
  fallback[index] = { ...fallback[index], ...patch, id: entityId };
  return fallback[index];
}

export async function deleteEntity(table: string, fallback: Entity[], id: RouteId) {
  const entityId = normalizeId(id);

  if (supabase) {
    const { data, error } = await supabase.from(resolveTableName(table)).delete().eq("id", entityId).select().maybeSingle();
    if (error) throw error;
    return (data || null) as Entity | null;
  }
  const index = fallback.findIndex((entry) => entry.id === entityId);
  if (index === -1) return null;
  const [deleted] = fallback.splice(index, 1);
  return deleted;
}
