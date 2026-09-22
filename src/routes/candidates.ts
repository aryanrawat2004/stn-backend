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

function sortCandidateRows(rows: any[]) {
  return [...rows].sort((a, b) => {
    const aDate = new Date(a.createdAt || a.created_at || a.joinedDate || 0).getTime();
    const bDate = new Date(b.createdAt || b.created_at || b.joinedDate || 0).getTime();
    return bDate - aDate;
  });
}

// Admin candidate list is intentionally backed by the same sn_candidates table used by
// candidate signup/profile APIs. Supplemental tables must never prevent candidate records
// from loading: applications and saved jobs are optional enrichment only.
router.get("/", wrap(async (req, res) => {
  if (!supabase) return res.status(503).json({ error: "Database is not configured" });

  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 100));
  const search = String(req.query.search || "").trim().toLowerCase();

  const { data: candidateRows, error: candidateError } = await supabase
    .from("sn_candidates")
    .select("*");

  if (candidateError) {
    console.error("Admin candidate list failed to read sn_candidates:", candidateError);
    return res.status(500).json({
      error: "Could not load candidates",
      details: {
        code: candidateError.code,
        message: candidateError.message,
        hint: candidateError.hint,
      },
    });
  }

  const candidates = sortCandidateRows(candidateRows || []);
  const candidateIds = candidates.map((candidate: any) => candidate.id).filter(Boolean);

  let applications: any[] = [];
  let savedJobs: any[] = [];
  let appliedJobRows: any[] = [];

  if (candidateIds.length) {
    const [applicationResult, savedJobsResult] = await Promise.all([
      supabase.from("sn_applications").select("id,candidateId,jobId,status,appliedAt,createdAt").in("candidateId", candidateIds),
      supabase.from("sn_saved_jobs").select("candidateId").in("candidateId", candidateIds),
    ]);

    if (applicationResult.error) {
      console.warn(
        "Admin candidate list: sn_applications enrichment unavailable; continuing without application counts:",
        applicationResult.error.message,
      );
    } else {
      applications = applicationResult.data || [];
    }

    if (savedJobsResult.error) {
      console.warn(
        "Admin candidate list: sn_saved_jobs enrichment unavailable; continuing without saved-job counts:",
        savedJobsResult.error.message,
      );
    } else {
      savedJobs = savedJobsResult.data || [];
    }
  }

  const applicationCounts = new Map<string, number>();
  const savedCounts = new Map<string, number>();

  const jobIds = [...new Set(applications.map((item: any) => String(item.jobId || "")).filter(Boolean))];
  if (jobIds.length) {
    const { data: jobRows, error: jobError } = await supabase
      .from("sn_jobs")
      .select("id,role,company,location,status")
      .in("id", jobIds);

    if (jobError) {
      console.warn("Admin candidate list: sn_jobs enrichment unavailable; continuing with application IDs:", jobError.message);
    } else {
      appliedJobRows = jobRows || [];
    }
  }

  const jobsById = new Map(appliedJobRows.map((job: any) => [String(job.id), job]));
  const applicationsByCandidate = new Map<string, any[]>();

  for (const item of applications) {
    const id = String(item.candidateId);
    applicationCounts.set(id, (applicationCounts.get(id) || 0) + 1);

    const jobId = String(item.jobId || "");
    const job = jobsById.get(jobId) || {};
    const current = applicationsByCandidate.get(id) || [];
    current.push({
      applicationId: String(item.id || ""),
      jobId,
      jobTitle: String(job.role || "Job"),
      company: String(job.company || ""),
      location: String(job.location || ""),
      jobStatus: String(job.status || ""),
      applicationStatus: String(item.status || "Applied"),
      appliedAt: String(item.appliedAt || item.createdAt || ""),
    });
    applicationsByCandidate.set(id, current);
  }
  for (const item of savedJobs) {
    const id = String(item.candidateId);
    savedCounts.set(id, (savedCounts.get(id) || 0) + 1);
  }

  const hydrated = await Promise.all(candidates.map(async (candidate: any) => ({
    ...candidate,
    joinedDate: candidate.joinedDate || candidate.createdAt || candidate.created_at || new Date().toISOString(),
    skills: normalizeSkills(candidate.skills),
    verified: Boolean(candidate.verified),
    accountStatus: candidate.accountStatus || "Active",
    applicationsCount: applicationCounts.get(String(candidate.id)) || 0,
    appliedJobs: (applicationsByCandidate.get(String(candidate.id)) || []).sort((a: any, b: any) =>
      new Date(b.appliedAt || 0).getTime() - new Date(a.appliedAt || 0).getTime()
    ),
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
