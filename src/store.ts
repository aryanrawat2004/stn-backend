export type Entity = Record<string, any> & { id: string };

// Runtime data is database-backed. These arrays are intentionally empty and are
// kept only to preserve the existing CRUD-router function signatures while the
// application transitions fully to Supabase-backed repositories.
export const store = {
  jobs: [] as Entity[],
  candidates: [] as Entity[],
  employers: [] as Entity[],
  companies: [] as Entity[],
  categories: [] as Entity[],
  ambassadors: [] as Entity[],
  activities: [] as Entity[],
  applications: [] as Entity[],
};

export function nextId(prefix: string, items: Entity[]) {
  const max = items.reduce((m, item) => Math.max(m, Number(item.id.replace(/\D/g, "")) || 0), 0);
  return `${prefix}-${String(max + 1).padStart(3, "0")}`;
}
