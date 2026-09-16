import { Router } from "express";
import { supabase } from "../db";

const publicRouter = Router();
const adminRouter = Router();
const table = "sn_resources";
const bucket = "resources";

function dbUnavailable(res: any) {
  return res.status(503).json({ error: "Database is not configured" });
}

publicRouter.get("/", async (req, res) => {
  if (!supabase) return dbUnavailable(res);

  const type = typeof req.query.type === "string" ? req.query.type : undefined;
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";

  let query = supabase
    .from(table)
    .select("id,slug,type,title,excerpt,category,read_time,cover_image_url,resource_url,featured,published_at,created_at")
    .eq("status", "published")
    .order("featured", { ascending: false })
    .order("published_at", { ascending: false });

  if (type && type !== "all") query = query.eq("type", type);
  if (search) query = query.or(`title.ilike.%${search}%,excerpt.ilike.%${search}%,category.ilike.%${search}%`);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ data: data ?? [] });
});

publicRouter.get("/:slug", async (req, res) => {
  if (!supabase) return dbUnavailable(res);
  const { data, error } = await supabase
    .from(table)
    .select("*")
    .eq("slug", req.params.slug)
    .eq("status", "published")
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: "Resource not found" });
  return res.json({ data });
});

adminRouter.get("/", async (_req, res) => {
  if (!supabase) return dbUnavailable(res);
  const { data, error } = await supabase.from(table).select("*").order("updated_at", { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ data: data ?? [] });
});

adminRouter.post("/upload", async (req, res) => {
  if (!supabase) return dbUnavailable(res);

  const fileName = String(req.body.fileName || "").trim();
  const contentType = String(req.body.contentType || "application/octet-stream");
  const dataBase64 = String(req.body.dataBase64 || "");
  const folder = String(req.body.folder || "files").replace(/[^a-z0-9_-]/gi, "-");

  if (!fileName || !dataBase64) return res.status(400).json({ error: "fileName and dataBase64 are required" });

  const safeName = fileName.replace(/[^a-z0-9._-]/gi, "-");
  const path = `${folder}/${Date.now()}-${safeName}`;
  const buffer = Buffer.from(dataBase64, "base64");

  const { error } = await supabase.storage.from(bucket).upload(path, buffer, {
    contentType,
    upsert: false,
  });
  if (error) return res.status(400).json({ error: error.message });

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return res.status(201).json({ data: { path, url: data.publicUrl } });
});

adminRouter.post("/", async (req, res) => {
  if (!supabase) return dbUnavailable(res);

  const payload = {
    slug: req.body.slug,
    type: req.body.type ?? "blog",
    title: req.body.title,
    excerpt: req.body.excerpt ?? "",
    content: req.body.content ?? "",
    category: req.body.category ?? "General",
    read_time: req.body.read_time ?? "5 min read",
    cover_image_url: req.body.cover_image_url || null,
    resource_url: req.body.resource_url || null,
    status: req.body.status ?? "draft",
    featured: Boolean(req.body.featured),
    author_name: req.body.author_name ?? "SolarNaukri Team",
    published_at: req.body.status === "published" ? new Date().toISOString() : null,
  };

  if (!payload.slug || !payload.title) return res.status(400).json({ error: "slug and title are required" });

  const { data, error } = await supabase.from(table).insert(payload).select("*").single();
  if (error) return res.status(400).json({ error: error.message });
  return res.status(201).json({ data });
});

adminRouter.put("/:id", async (req, res) => {
  if (!supabase) return dbUnavailable(res);
  const patch: Record<string, unknown> = { ...req.body, updated_at: new Date().toISOString() };
  delete patch.id;
  delete patch.created_at;
  if (req.body.status === "published" && !req.body.published_at) patch.published_at = new Date().toISOString();

  const { data, error } = await supabase.from(table).update(patch).eq("id", req.params.id).select("*").single();
  if (error) return res.status(400).json({ error: error.message });
  return res.json({ data });
});

adminRouter.delete("/:id", async (req, res) => {
  if (!supabase) return dbUnavailable(res);
  const { error } = await supabase.from(table).delete().eq("id", req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  return res.status(204).send();
});

export { publicRouter as resourcesPublicRouter, adminRouter as resourcesAdminRouter };
