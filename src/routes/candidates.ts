import { Router, Request, Response, NextFunction } from "express";
import { store } from "../store";
import { getEntity, patchEntity } from "../repository";
import { createCrudRouter } from "./crud";
import { supabase } from "../db";

const router = Router();
const table = "candidates";

const wrap = (fn: (req: Request, res: Response) => Promise<Response | void>) =>
  (req: Request, res: Response, next: NextFunction) => Promise.resolve(fn(req, res)).catch(next);

function normalizeSkills(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  if (typeof value === "string") return value.split(/[,|;]/g).map((item) => item.trim()).filter(Boolean);
  return [];
}

async function signedResumeUrl(candidate: Record<string, any>) {
  if (!supabase) return null;

  const resumePath = String(candidate.resumePath || "").trim();
  if (resumePath) {
    const { data } = await supabase.storage.from("candidate-resumes").createSignedUrl(resumePath, 60 * 60);
    return data?.signedUrl || null;
  }

  const storedUrl = String(candidate.resumeUrl || "").trim();
  if (storedUrl.startsWith("storage://candidate-resumes/")) {
    const path = storedUrl.replace("storage://candidate-resumes/", "");
    const { data } = await supabase.storage.from("candidate-resumes").createSignedUrl(path, 60 * 60);
    return data?.signedUrl || null;
  }

  return storedUrl || null;
}

// Admin candidate list is intentionally backed by the same sn_candidates table used by
// candidate signup/profile APIs. This keeps candidate, admin and employer views in sync.
router.get("/", wrap(async (req, res) => {
  if (!supabase) return res.status(503).json({ error: "Database is not configured" });

  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 100));
  const search = String(req.query.search || "").trim().toLowerCase();

  const { data: candidateRows, error: candidateError } = await supabase
    .from("sn_candidates")
    .select("*")
    .order("createdAt", { ascending: false });
  if (candidateError) throw candidateError;

  const candidates = candidateRows || [];
  const candidateIds = candidates.map((candidate: any) => candidate.id).filter(Boolean);

  let applications: any[] = [];
  let savedJobs: any[] = [];
  if (candidateIds.length) {
    const [applicationResult, savedJobsResult] = await Promise.all([
      supabase.from("sn_applications").select("candidateId").in("candidateId", candidateIds),
      supabase.from("sn_saved_jobs").select("candidateId").in("candidateId", candidateIds),
    ]);
    if (applicationResult.error) throw applicationResult.error;
    if (savedJobsResult.error) throw savedJobsResult.error;
    applications = applicationResult.data || [];
    savedJobs = savedJobsResult.data || [];
  }

  const applicationCounts = new Map<string, number>();
  const savedCounts = new Map<string, number>();
  for (const item of applications) applicationCounts.set(String(item.candidateId), (applicationCounts.get(String(item.candidateId)) || 0) + 1);
  for (const item of savedJobs) savedCounts.set(String(item.candidateId), (savedCounts.get(String(item.candidateId)) || 0) + 1);

  const hydrated = await Promise.all(candidates.map(async (candidate: any) => ({
    ...candidate,
    joinedDate: candidate.joinedDate || candidate.createdAt || candidate.created_at || new Date().toISOString(),
    skills: normalizeSkills(candidate.skills),
    verified: Boolean(candidate.verified),
    accountStatus: candidate.accountStatus || "Active",
    applicationsCount: applicationCounts.get(String(candidate.id)) || 0,
    savedJobsCount: savedCounts.get(String(candidate.id)) || 0,
    profileViews: Number(candidate.profileViews || 0),
    resumeAccessUrl: await signedResumeUrl(candidate),
  })));

  const filtered = search
    ? hydrated.filter((candidate: any) => JSON.stringify({
        name: candidate.name,
        email: candidate.email,
        phone: candidate.phone,
        role: candidate.role,
        location: candidate.location,
        skills: candidate.skills,
      }).toLowerCase().includes(search))
    : hydrated;

  const start = (page - 1) * limit;
  return res.json({
    data: filtered.slice(start, start + limit),
    meta: { total: filtered.length, page, limit },
  });
}));

router.patch("/:id/verify", wrap(async (req, res) => {
  const current = await getEntity(table, store.candidates, req.params.id);
  if (!current) return res.status(404).json({ error: "Candidate not found" });
  const verified = req.body.verified ?? !Boolean(current.verified);
  const candidate = await patchEntity(table, store.candidates, req.params.id, { verified, updatedAt: new Date().toISOString() });
  if (!candidate) return res.status(404).json({ error: "Candidate not found" });
  res.json({ data: candidate });
}));

router.patch("/:id/status", wrap(async (req, res) => {
  const allowed = ["Active", "Suspended"];
  if (!allowed.includes(req.body.status)) return res.status(400).json({ error: "Invalid candidate status" });
  const candidate = await patchEntity(table, store.candidates, req.params.id, { accountStatus: req.body.status, updatedAt: new Date().toISOString() });
  if (!candidate) return res.status(404).json({ error: "Candidate not found" });
  res.json({ data: candidate });
}));

router.use(createCrudRouter(store.candidates, {
  prefix: "CAN",
  entityName: "Candidate",
  table,
  required: ["name", "email", "phone", "role", "location"],
}));

export default router;
