import { Router, Request, Response, NextFunction } from "express";
import { supabase } from "../db";

const router = Router();

type SiteVisit = {
  id: string;
  visitor_id: string;
  session_id: string;
  user_id?: string | null;
  path: string;
  started_at: string;
  last_seen: string;
  active_seconds: number;
  device: string;
  referrer: string;
};

const wrap = (fn: (req: Request, res: Response) => Promise<Response | void>) =>
  (req: Request, res: Response, next: NextFunction) => Promise.resolve(fn(req, res)).catch(next);

async function loadVisits(days = 90): Promise<SiteVisit[]> {
  if (!supabase) return [];
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const { data, error } = await supabase
    .from("site_visits")
    .select("id,visitor_id,session_id,user_id,path,started_at,last_seen,active_seconds,device,referrer")
    .gte("started_at", since)
    .order("started_at", { ascending: false })
    .limit(10000);
  if (error) throw error;
  return (data || []) as SiteVisit[];
}

router.get("/traffic", wrap(async (_req, res) => {
  const visits = await loadVisits(30);
  const now = Date.now();
  const activeWindow = 5 * 60 * 1000;
  const uniqueVisitors = new Set(visits.map((v) => v.visitor_id)).size;
  const sessions = new Set(visits.map((v) => v.session_id)).size;
  const activeNow = new Set(
    visits.filter((v) => now - Date.parse(v.last_seen) <= activeWindow).map((v) => v.visitor_id),
  ).size;
  const avgActiveSeconds = sessions
    ? Math.round(visits.reduce((sum, v) => sum + Number(v.active_seconds || 0), 0) / sessions)
    : 0;

  res.json({
    data: {
      activeNow,
      uniqueVisitors,
      pageViews: visits.length,
      sessions,
      avgActiveSeconds,
    },
  });
}));

router.get("/pages", wrap(async (_req, res) => {
  const visits = await loadVisits(90);
  const grouped = new Map<string, { views: number; visitors: Set<string>; activeSeconds: number }>();
  for (const visit of visits) {
    const current = grouped.get(visit.path) || { views: 0, visitors: new Set<string>(), activeSeconds: 0 };
    current.views += 1;
    current.visitors.add(visit.visitor_id);
    current.activeSeconds += Number(visit.active_seconds || 0);
    grouped.set(visit.path, current);
  }
  const data = [...grouped.entries()]
    .map(([path, value]) => ({
      path,
      views: value.views,
      visitors: value.visitors.size,
      activeSeconds: value.views ? Math.round(value.activeSeconds / value.views) : 0,
    }))
    .sort((a, b) => b.views - a.views);
  res.json({ data });
}));

router.get("/sources", wrap(async (_req, res) => {
  const visits = await loadVisits(90);
  const grouped = new Map<string, number>();
  for (const visit of visits) {
    const source = visit.referrer?.trim() || "Direct";
    grouped.set(source, (grouped.get(source) || 0) + 1);
  }
  res.json({ data: [...grouped.entries()].map(([source, views]) => ({ source, views })).sort((a, b) => b.views - a.views) });
}));

router.get("/devices", wrap(async (_req, res) => {
  const visits = await loadVisits(90);
  const grouped = new Map<string, number>();
  for (const visit of visits) {
    const device = visit.device?.trim() || "Other";
    grouped.set(device, (grouped.get(device) || 0) + 1);
  }
  res.json({ data: [...grouped.entries()].map(([device, views]) => ({ device, views })).sort((a, b) => b.views - a.views) });
}));

router.get("/visitors", wrap(async (_req, res) => {
  const visits = await loadVisits(90);
  const now = Date.now();
  const visitorMap = new Map<string, SiteVisit[]>();
  for (const visit of visits) {
    const list = visitorMap.get(visit.visitor_id) || [];
    list.push(visit);
    visitorMap.set(visit.visitor_id, list);
  }

  const data = [...visitorMap.entries()].map(([visitorId, rows], index) => {
    rows.sort((a, b) => Date.parse(b.last_seen) - Date.parse(a.last_seen));
    const latest = rows[0];
    return {
      id: `VIS-${String(index + 1).padStart(3, "0")}`,
      name: `Visitor ${visitorId.slice(0, 8)}`,
      type: latest.user_id ? "Authenticated" : "Visitor",
      city: "—",
      device: latest.device || "Other",
      source: latest.referrer || "Direct",
      active: now - Date.parse(latest.last_seen) <= 5 * 60 * 1000,
      pages: [...new Set(rows.map((r) => r.path))],
      seconds: rows.reduce((sum, row) => sum + Number(row.active_seconds || 0), 0),
      time: latest.last_seen,
    };
  });

  res.json({ data });
}));

export default router;
