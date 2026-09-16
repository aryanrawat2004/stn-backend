import { randomUUID } from "crypto";
import { Router, Request, Response, NextFunction } from "express";
import { supabase } from "../db";
import { resolveAuthContext, AuthContext } from "../middleware/auth-context";

const router = Router();

const wrap = (fn: (req: Request, res: Response) => Promise<Response | void>) =>
  (req: Request, res: Response, next: NextFunction) => Promise.resolve(fn(req, res)).catch(next);

function requireDb(res: Response) {
  if (!supabase) {
    res.status(503).json({ error: "Database is not configured" });
    return false;
  }
  return true;
}

async function requireAuth(req: Request, res: Response): Promise<AuthContext | null> {
  const auth = await resolveAuthContext(req);
  if (!auth?.email) {
    res.status(401).json({ error: "Authenticated email is required" });
    return null;
  }
  return auth;
}

function normalizeSkills(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).map((v) => v.trim()).filter(Boolean);
  if (typeof value === "string") {
    return value
      .split(/[,|;]/g)
      .map((v) => v.trim())
      .filter(Boolean);
  }
  return [];
}

function calculateMatch(candidate: Record<string, any>, job: Record<string, any>) {
  const candidateSkills = normalizeSkills(candidate.skills).map((s) => s.toLowerCase());
  const jobSkills = [
    ...normalizeSkills(job.skills),
    ...normalizeSkills(job.tools),
    ...normalizeSkills(job.requirements),
  ].map((s) => s.toLowerCase());

  const uniqueJobSkills = [...new Set(jobSkills)].slice(0, 12);
  const matchedSkills = uniqueJobSkills.filter((skill) =>
    candidateSkills.some((candidateSkill) =>
      candidateSkill.includes(skill) || skill.includes(candidateSkill),
    ),
  );
  const missingSkills = uniqueJobSkills.filter((skill) => !matchedSkills.includes(skill));

  let score = 45;
  if (uniqueJobSkills.length) {
    score += Math.round((matchedSkills.length / uniqueJobSkills.length) * 35);
  }

  const candidateRole = String(candidate.role || "").toLowerCase();
  const jobRole = String(job.role || "").toLowerCase();
  if (candidateRole && jobRole && (candidateRole.includes(jobRole) || jobRole.includes(candidateRole))) score += 10;

  const candidateLocation = String(candidate.location || "").toLowerCase();
  const jobLocation = String(job.location || "").toLowerCase();
  if (candidateLocation && jobLocation && (candidateLocation.includes(jobLocation) || jobLocation.includes(candidateLocation))) score += 5;

  if (candidate.verified) score += 3;
  if (Number(candidate.profileCompletion || 0) >= 80) score += 2;

  return {
    score: Math.max(0, Math.min(100, score)),
    matchedSkills: matchedSkills.map((skill) => uniqueJobSkills.find((s) => s === skill) || skill),
    missingSkills: missingSkills.slice(0, 5),
  };
}

async function ensureCandidate(auth: AuthContext) {
  if (!supabase || !auth.email) return null;

  const { data: existing, error: findError } = await supabase
    .from("sn_candidates")
    .select("*")
    .ilike("email", auth.email)
    .maybeSingle();

  if (findError) throw findError;
  if (existing) {
    if (auth.uid && !existing.firebaseUid) {
      const { data, error } = await supabase
        .from("sn_candidates")
        .update({ firebaseUid: auth.uid, updatedAt: new Date().toISOString() })
        .eq("id", existing.id)
        .select("*")
        .single();
      if (error) throw error;
      return data;
    }
    return existing;
  }

  const now = new Date().toISOString();
  const candidate = {
    id: `CAN-${randomUUID().slice(0, 8).toUpperCase()}`,
    name: auth.name || auth.email.split("@")[0],
    email: auth.email,
    phone: "",
    role: "",
    location: "",
    experience: "",
    skills: [],
    verified: false,
    profileCompletion: 15,
    resumeStrength: 0,
    talentPassportScore: 15,
    accountStatus: "Active",
    emailVerified: true,
    firebaseUid: auth.uid,
    createdAt: now,
    updatedAt: now,
  };

  const { data, error } = await supabase.from("sn_candidates").insert(candidate).select("*").single();
  if (error) throw error;
  return data;
}

async function ensureRecruiter(auth: AuthContext) {
  if (!supabase || !auth.email) return null;

  const { data, error } = await supabase
    .from("sn_employers")
    .select("*")
    .ilike("email", auth.email)
    .maybeSingle();

  if (error) throw error;
  return data;
}

router.get("/candidate", wrap(async (req, res) => {
  if (!requireDb(res)) return;
  const auth = await requireAuth(req, res);
  if (!auth) return;
  const candidate = await ensureCandidate(auth);
  res.json({ data: candidate });
}));

router.patch("/candidate", wrap(async (req, res) => {
  if (!requireDb(res)) return;
  const auth = await requireAuth(req, res);
  if (!auth) return;
  const candidate = await ensureCandidate(auth);
  if (!candidate) return res.status(404).json({ error: "Candidate not found" });

  const allowedFields = [
    "name",
    "phone",
    "role",
    "location",
    "experience",
    "skills",
    "currentSalary",
    "expectedSalary",
    "noticePeriod",
    "about",
    "resumeUrl",
    "resumeName",
    "resumeUploadedAt",
    "projectExperience",
    "certifications",
  ];

  const patch: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (Object.prototype.hasOwnProperty.call(req.body || {}, field)) patch[field] = req.body[field];
  }

  const completionFields = ["name", "phone", "role", "location", "experience", "skills", "about", "resumeUrl"];
  const projected = { ...candidate, ...patch } as Record<string, any>;
  const completed = completionFields.filter((field) => {
    const value = projected[field];
    return Array.isArray(value) ? value.length > 0 : Boolean(String(value || "").trim());
  }).length;
  const profileCompletion = Math.round((completed / completionFields.length) * 100);
  const resumeStrength = projected.resumeUrl ? Math.min(100, 55 + normalizeSkills(projected.skills).length * 5) : 0;
  const talentPassportScore = Math.min(100, Math.round(profileCompletion * 0.55 + resumeStrength * 0.25 + (projected.verified ? 20 : 5)));

  patch.profileCompletion = profileCompletion;
  patch.resumeStrength = resumeStrength;
  patch.talentPassportScore = talentPassportScore;
  patch.updatedAt = new Date().toISOString();

  const { data, error } = await supabase!
    .from("sn_candidates")
    .update(patch)
    .eq("id", candidate.id)
    .select("*")
    .single();

  if (error) throw error;
  res.json({ data });
}));

router.get("/applications", wrap(async (req, res) => {
  if (!requireDb(res)) return;
  const auth = await requireAuth(req, res);
  if (!auth) return;
  const candidate = await ensureCandidate(auth);
  if (!candidate) return res.json({ data: [] });

  const { data: applications, error } = await supabase!
    .from("sn_applications")
    .select("*")
    .eq("candidateId", candidate.id)
    .order("appliedAt", { ascending: false });
  if (error) throw error;

  const jobIds = [...new Set((applications || []).map((item: any) => item.jobId).filter(Boolean))];
  let jobs: any[] = [];
  if (jobIds.length) {
    const result = await supabase!.from("sn_jobs").select("*").in("id", jobIds);
    if (result.error) throw result.error;
    jobs = result.data || [];
  }

  const byJob = new Map(jobs.map((job) => [job.id, job]));
  res.json({
    data: (applications || []).map((application: any) => ({
      ...application,
      job: byJob.get(application.jobId) || null,
    })),
  });
}));

router.post("/applications", wrap(async (req, res) => {
  if (!requireDb(res)) return;
  const auth = await requireAuth(req, res);
  if (!auth) return;
  const candidate = await ensureCandidate(auth);
  if (!candidate) return res.status(404).json({ error: "Candidate not found" });

  const jobId = String(req.body?.jobId || "").trim();
  if (!jobId) return res.status(400).json({ error: "jobId is required" });

  const existing = await supabase!
    .from("sn_applications")
    .select("id")
    .eq("candidateId", candidate.id)
    .eq("jobId", jobId)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return res.status(409).json({ error: "You have already applied for this job" });

  const now = new Date().toISOString();
  const { data, error } = await supabase!
    .from("sn_applications")
    .insert({
      id: `APP-${randomUUID().slice(0, 8).toUpperCase()}`,
      candidateId: candidate.id,
      jobId,
      status: "Applied",
      appliedAt: now,
      createdAt: now,
      updatedAt: now,
      notes: "",
    })
    .select("*")
    .single();
  if (error) throw error;

  res.status(201).json({ data });
}));

router.delete("/applications/:id", wrap(async (req, res) => {
  if (!requireDb(res)) return;
  const auth = await requireAuth(req, res);
  if (!auth) return;
  const candidate = await ensureCandidate(auth);
  if (!candidate) return res.status(404).json({ error: "Candidate not found" });

  const { data, error } = await supabase!
    .from("sn_applications")
    .delete()
    .eq("id", req.params.id)
    .eq("candidateId", candidate.id)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) return res.status(404).json({ error: "Application not found" });
  res.json({ success: true });
}));

router.get("/saved-jobs", wrap(async (req, res) => {
  if (!requireDb(res)) return;
  const auth = await requireAuth(req, res);
  if (!auth) return;
  const candidate = await ensureCandidate(auth);
  if (!candidate) return res.json({ data: [] });

  const { data: saved, error } = await supabase!
    .from("sn_saved_jobs")
    .select("*")
    .eq("candidateId", candidate.id)
    .order("createdAt", { ascending: false });
  if (error) throw error;

  const jobIds = [...new Set((saved || []).map((item: any) => item.jobId).filter(Boolean))];
  let jobs: any[] = [];
  if (jobIds.length) {
    const result = await supabase!.from("sn_jobs").select("*").in("id", jobIds);
    if (result.error) throw result.error;
    jobs = result.data || [];
  }
  const byJob = new Map(jobs.map((job) => [job.id, job]));

  res.json({ data: (saved || []).map((item: any) => ({ ...item, job: byJob.get(item.jobId) || null })) });
}));

router.post("/saved-jobs", wrap(async (req, res) => {
  if (!requireDb(res)) return;
  const auth = await requireAuth(req, res);
  if (!auth) return;
  const candidate = await ensureCandidate(auth);
  if (!candidate) return res.status(404).json({ error: "Candidate not found" });

  const jobId = String(req.body?.jobId || "").trim();
  if (!jobId) return res.status(400).json({ error: "jobId is required" });

  const now = new Date().toISOString();
  const payload = {
    id: `SAV-${randomUUID().slice(0, 8).toUpperCase()}`,
    candidateId: candidate.id,
    jobId,
    createdAt: now,
  };

  const { data, error } = await supabase!
    .from("sn_saved_jobs")
    .upsert(payload, { onConflict: "candidateId,jobId", ignoreDuplicates: true })
    .select("*")
    .maybeSingle();
  if (error) throw error;
  res.status(201).json({ data: data || payload });
}));

router.delete("/saved-jobs/:jobId", wrap(async (req, res) => {
  if (!requireDb(res)) return;
  const auth = await requireAuth(req, res);
  if (!auth) return;
  const candidate = await ensureCandidate(auth);
  if (!candidate) return res.status(404).json({ error: "Candidate not found" });

  const { error } = await supabase!
    .from("sn_saved_jobs")
    .delete()
    .eq("candidateId", candidate.id)
    .eq("jobId", req.params.jobId);
  if (error) throw error;
  res.json({ success: true });
}));

router.get("/dashboard", wrap(async (req, res) => {
  if (!requireDb(res)) return;
  const auth = await requireAuth(req, res);
  if (!auth) return;
  const candidate = await ensureCandidate(auth);
  if (!candidate) return res.status(404).json({ error: "Candidate not found" });

  const [applicationsResult, savedResult, jobsResult] = await Promise.all([
    supabase!.from("sn_applications").select("*").eq("candidateId", candidate.id),
    supabase!.from("sn_saved_jobs").select("*").eq("candidateId", candidate.id),
    supabase!.from("sn_jobs").select("*").eq("status", "Active").limit(200),
  ]);

  if (applicationsResult.error) throw applicationsResult.error;
  if (savedResult.error) throw savedResult.error;
  if (jobsResult.error) throw jobsResult.error;

  const applications = applicationsResult.data || [];
  const jobs = jobsResult.data || [];
  const matches = jobs
    .map((job: any) => ({ job, ...calculateMatch(candidate, job) }))
    .sort((a, b) => b.score - a.score);

  const interviews = applications.filter((item: any) => item.status === "Interview").length;
  const shortlisted = applications.filter((item: any) => ["Screening", "Shortlisted", "Interview", "Offer"].includes(item.status)).length;

  res.json({
    data: {
      candidate,
      metrics: {
        profileCompletion: Number(candidate.profileCompletion || 0),
        talentPassportScore: Number(candidate.talentPassportScore || 0),
        resumeStrength: Number(candidate.resumeStrength || 0),
        applications: applications.length,
        shortlisted,
        interviews,
        savedJobs: (savedResult.data || []).length,
        recruiterViews: Number(candidate.profileViews || 0),
        jobMatches: matches.filter((item) => item.score >= 60).length,
      },
      recommendedJobs: matches.slice(0, 5),
    },
  });
}));

router.get("/matches", wrap(async (req, res) => {
  if (!requireDb(res)) return;
  const auth = await requireAuth(req, res);
  if (!auth) return;
  const candidate = await ensureCandidate(auth);
  if (!candidate) return res.status(404).json({ error: "Candidate not found" });

  const { data: jobs, error } = await supabase!.from("sn_jobs").select("*").eq("status", "Active").limit(200);
  if (error) throw error;

  const data = (jobs || [])
    .map((job: any) => ({ job, ...calculateMatch(candidate, job) }))
    .sort((a, b) => b.score - a.score);

  res.json({ data });
}));

router.get("/recruiter", wrap(async (req, res) => {
  if (!requireDb(res)) return;
  const auth = await requireAuth(req, res);
  if (!auth) return;
  const recruiter = await ensureRecruiter(auth);
  if (!recruiter) return res.status(404).json({ error: "Recruiter profile not found for this email" });
  res.json({ data: recruiter });
}));

router.get("/recruiter/dashboard", wrap(async (req, res) => {
  if (!requireDb(res)) return;
  const auth = await requireAuth(req, res);
  if (!auth) return;
  const recruiter = await ensureRecruiter(auth);
  if (!recruiter) return res.status(404).json({ error: "Recruiter profile not found for this email" });

  const companyName = String(recruiter.companyName || "");
  const jobsResult = await supabase!.from("sn_jobs").select("*").eq("company", companyName).limit(200);
  if (jobsResult.error) throw jobsResult.error;
  const jobs = jobsResult.data || [];
  const jobIds = jobs.map((job: any) => job.id);

  let applications: any[] = [];
  if (jobIds.length) {
    const result = await supabase!.from("sn_applications").select("*").in("jobId", jobIds).limit(500);
    if (result.error) throw result.error;
    applications = result.data || [];
  }

  res.json({
    data: {
      recruiter,
      jobs,
      applications,
      metrics: {
        jobs: jobs.length,
        activeJobs: jobs.filter((job: any) => job.status === "Active").length,
        applications: applications.length,
        interviews: applications.filter((item: any) => item.status === "Interview").length,
        offers: applications.filter((item: any) => item.status === "Offer").length,
      },
    },
  });
}));

router.get("/recruiter/applications", wrap(async (req, res) => {
  if (!requireDb(res)) return;
  const auth = await requireAuth(req, res);
  if (!auth) return;
  const recruiter = await ensureRecruiter(auth);
  if (!recruiter) return res.status(404).json({ error: "Recruiter profile not found for this email" });

  const jobsResult = await supabase!.from("sn_jobs").select("*").eq("company", recruiter.companyName).limit(200);
  if (jobsResult.error) throw jobsResult.error;
  const jobs = jobsResult.data || [];
  const jobIds = jobs.map((job: any) => job.id);
  if (!jobIds.length) return res.json({ data: [] });

  const applicationsResult = await supabase!
    .from("sn_applications")
    .select("*")
    .in("jobId", jobIds)
    .order("appliedAt", { ascending: false });
  if (applicationsResult.error) throw applicationsResult.error;

  const candidateIds = [...new Set((applicationsResult.data || []).map((item: any) => item.candidateId))];
  let candidates: any[] = [];
  if (candidateIds.length) {
    const result = await supabase!.from("sn_candidates").select("*").in("id", candidateIds);
    if (result.error) throw result.error;
    candidates = result.data || [];
  }

  const byJob = new Map(jobs.map((job: any) => [job.id, job]));
  const byCandidate = new Map(candidates.map((candidate: any) => [candidate.id, candidate]));

  res.json({
    data: (applicationsResult.data || []).map((item: any) => ({
      ...item,
      job: byJob.get(item.jobId) || null,
      candidate: byCandidate.get(item.candidateId) || null,
    })),
  });
}));

export default router;
