import { Router, Request, Response, NextFunction } from "express";
import { supabase } from "../db";

const router = Router();

let memorySettings = {
  id: "platform",
  siteName: "SolarNaukri",
  contactEmail: "admin@solarnaukri.com",
  emailAlerts: true,
  autoApproveVerified: false,
  weeklyDigest: true,
  updatedAt: new Date().toISOString(),
};

const wrap = (fn: (req: Request, res: Response) => Promise<Response | void>) =>
  (req: Request, res: Response, next: NextFunction) => Promise.resolve(fn(req, res)).catch(next);

router.get("/", wrap(async (_req, res) => {
  if (supabase) {
    const { data, error } = await supabase.from("settings").select("*").eq("id", "platform").maybeSingle();
    if (error) throw error;
    return res.json({ data: data || memorySettings });
  }
  res.json({ data: memorySettings });
}));

router.put("/", wrap(async (req, res) => {
  const next = {
    ...req.body,
    id: "platform",
    updatedAt: new Date().toISOString(),
  };

  if (supabase) {
    const { data, error } = await supabase.from("settings").upsert(next).select().single();
    if (error) throw error;
    return res.json({ data });
  }

  memorySettings = { ...memorySettings, ...next };
  res.json({ data: memorySettings });
}));

router.patch("/", wrap(async (req, res) => {
  const patch = { ...req.body, updatedAt: new Date().toISOString() };

  if (supabase) {
    const { data, error } = await supabase.from("settings").update(patch).eq("id", "platform").select().single();
    if (error) throw error;
    return res.json({ data });
  }

  memorySettings = { ...memorySettings, ...patch };
  res.json({ data: memorySettings });
}));

export default router;
