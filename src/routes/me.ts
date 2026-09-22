import { randomUUID } from "crypto";
import { Router, Request, Response, NextFunction } from "express";
import { supabase } from "../db";
import { resolveAuthContext, AuthContext } from "../middleware/auth-context";
import { indexCandidateIntoAi } from "../services/resume-screener";
import { enforceCandidateApplicationLimit, getCandidateApplicationAccess } from "../services/application-limit";

const router = Router();

function normalizeCompanyIdentity(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/\b(private|pvt|limited|ltd|llp|incorporated|inc|company|co)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const wrap = (fn: (req: Request, res: Response) => Promise<Response | void>) =>
  (req: Request, res: Response, next: NextFunction) => Promise.resolve(fn(req, res)).catch(next);

function requireDb(res: Response) {
  if (!supabase) {
    res.status(503).json({ error: "Database is not configured" });
    return false;
  }
  return true;
}

type AuthenticatedContext = AuthContext & { email: string };

async function requireAuth(req: Request, res: Response): Promise<AuthenticatedContext | null> {
  const auth = await resolveAuthContext(req);
  if (!auth?.email) {
    res.status(401).json({ error: "Authenticated email is required" });
    return null;
  }
  return auth as AuthenticatedContext;
}

function normalizeSkills(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).map((v) => v.trim()).filter(Boolean);
  if (typeof value === "string") {
    return value.split(/[,|;]/g).map((v) => v.trim()).filter(Boolean);
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

  const candidateRole = String(candidate.role || "").toLowerCase();
  const jobRole = String(job.role || job.title || "").toLowerCase();
  const roleScore = candidateRole && jobRole
    ? (candidateRole.includes(jobRole) || jobRole.includes(candidateRole) ? 100 : candidateRole.split(/\s+/).some((term) => term.length > 3 && jobRole.includes(term)) ? 65 : 25)
    : 0;

  const skillsScore = uniqueJobSkills.length
    ? Math.round((matchedSkills.length / uniqueJobSkills.length) * 100)
    : (candidateSkills.length ? 55 : 0);

  const candidateYears = Number(String(candidate.experience || candidate.resumeData?.yearsExperience || "").match(/\d+(?:\.\d+)?/)?.[0] || 0);
  const jobExperienceText = String(job.experience || job.requirements || "");
  const jobYears = Number(jobExperienceText.match(/\d+(?:\.\d+)?/)?.[0] || 0);
  const experienceScore = jobYears
    ? (candidateYears >= jobYears ? 100 : candidateYears >= Math.max(0, jobYears - 1) ? 75 : 35)
    : (candidateYears ? 70 : 45);

  const candidateLocation = String(candidate.location || "").toLowerCase();
  const jobLocation = String(job.location || "").toLowerCase();
  const remote = /remote|work from home|wfh/i.test(String(job.workMode || job.location || ""));
  const locationScore = remote
    ? 100
    : candidateLocation && jobLocation && (candidateLocation.includes(jobLocation) || jobLocation.includes(candidateLocation))
      ? 100
      : candidateLocation && jobLocation
        ? 45
        : 50;

  const salaryText = String(job.salary || job.salaryRange || "");
  const expectedSalary = String(candidate.expectedSalary || candidate.resumeData?.expectedSalary || "");
  const salaryScore = salaryText && expectedSalary ? 75 : 50;

  const notice = String(candidate.noticePeriod || candidate.resumeData?.noticePeriod || "").toLowerCase();
  const immediate = /immediate|0\s*day|join\s*now/.test(notice);
  const noticeScore = immediate ? 100 : notice ? (/15/.test(notice) ? 90 : /30/.test(notice) ? 80 : /60/.test(notice) ? 60 : 50) : 45;

  const verifiedScore = candidate.is_verified || candidate.verified ? 100 : 0;

  const score = Math.round(
    roleScore * 0.20 +
    skillsScore * 0.35 +
    experienceScore * 0.15 +
    locationScore * 0.10 +
    salaryScore * 0.08 +
    noticeScore * 0.07 +
    verifiedScore * 0.05,
  );

  return {
    score: Math.max(0, Math.min(100, score)),
    matchedSkills,
    missingSkills: missingSkills.slice(0, 5),
    matchBreakdown: {
      role: roleScore,
      skills: skillsScore,
      experience: experienceScore,
      location: locationScore,
      salary: salaryScore,
      noticePeriod: noticeScore,
      verifiedTalent: verifiedScore,
    },
  };
}

async function withSignedResume(candidate: Record<string, any> | null) {
  if (!candidate || !supabase || !candidate.resumePath) return candidate;
  const { data } = await supabase.storage
    .from("candidate-resumes")
    .createSignedUrl(String(candidate.resumePath), 60 * 60);
  return { ...candidate, resumeUrl: data?.signedUrl || null };
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

async function ensureEmployer(auth: AuthContext) {
  if (!supabase || !auth.email) return null;

  const email = auth.email.trim().toLowerCase();

  const existingResult = await supabase
    .from("sn_employers")
    .select("*")
    .ilike("email", email)
    .limit(1)
    .maybeSingle();

  if (existingResult.data) return existingResult.data;
  if (existingResult.error) {
    console.warn("Employer lookup failed:", existingResult.error.message);
  }

  let company: any = null;
  const companyResult = await supabase
    .from("sn_companies")
    .select("*")
    .ilike("email", email)
    .limit(1)
    .maybeSingle();

  if (companyResult.data) company = companyResult.data;
  if (companyResult.error) {
    console.warn("Company lookup during employer recovery failed:", companyResult.error.message);
  }

  let ownedJob: any = null;

  // Legacy accounts can have jobs linked by either EmployerEmail or applicationEmail.
  // Query the columns independently so one missing/legacy column cannot crash the API.
  for (const column of ["EmployerEmail", "applicationEmail"] as const) {
    if (ownedJob) break;
    try {
      const result = await supabase
        .from("sn_jobs")
        .select("*")
        .eq(column, email)
        .limit(1)
        .maybeSingle();

      if (result.data) ownedJob = result.data;
      if (result.error) {
        console.warn(`Employer job recovery lookup failed for ${column}:`, result.error.message);
      }
    } catch (error: any) {
      console.warn(`Employer job recovery lookup threw for ${column}:`, error?.message || error);
    }
  }

  const companyName = String(company?.companyName || ownedJob?.company || "").trim();
  if (!companyName) return null;

  const now = new Date().toISOString();
  const employerRecord = {
    id: `employer-${auth.uid || email}`,
    companyName,
    contactPerson: String(
      company?.contactPerson ||
      ownedJob?.EmployerName ||
      auth.name ||
      email.split("@")[0]
    ).trim(),
    email,
    location: String(company?.location || ownedJob?.location || "").trim(),
    jobsPosted: Number(company?.jobsPosted || 0),
    verified: Boolean(company?.verified),
    joinedDate: String(company?.joinedDate || now.slice(0, 10)),
    status: String(
      company?.verificationStatus ||
      company?.status ||
      "Pending Verification"
    ),
    createdAt: now,
    updatedAt: now,
  };

  const upsertResult = await supabase
    .from("sn_employers")
    .upsert(employerRecord, { onConflict: "id" })
    .select("*")
    .single();

  if (upsertResult.data) return upsertResult.data;

  if (upsertResult.error) {
    console.warn("Employer auto-provision failed:", upsertResult.error.message);

    // The pipeline can still operate from company/job ownership even when
    // the legacy employer table cannot be written.
    return {
      ...employerRecord,
      id: employerRecord.id,
    };
  }

  return employerRecord;
}

router.get("/candidate", wrap(async (req, res) => {
  if (!requireDb(res)) return;
  const auth = await requireAuth(req, res);
  if (!auth) return;
  const candidate = await ensureCandidate(auth);
  res.json({ data: await withSignedResume(candidate) });
}));

router.patch("/candidate", wrap(async (req, res) => {
  if (!requireDb(res)) return;
  const auth = await requireAuth(req, res);
  if (!auth) return;
  const candidate = await ensureCandidate(auth);
  if (!candidate) return res.status(404).json({ error: "Candidate not found" });

  const allowedFields = [
    "name", "phone", "role", "location", "experience", "skills",
    "currentSalary", "expectedSalary", "noticePeriod", "about",
    "projectExperience", "certifications",
  ];

  const patch: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (Object.prototype.hasOwnProperty.call(req.body || {}, field)) patch[field] = req.body[field];
  }

  const completionFields = ["name", "phone", "role", "location", "experience", "skills", "about", "resumePath"];
  const projected = { ...candidate, ...patch } as Record<string, any>;
  const completed = completionFields.filter((field) => {
    const value = projected[field];
    return Array.isArray(value) ? value.length > 0 : Boolean(String(value || "").trim());
  }).length;
  const profileCompletion = Math.round((completed / completionFields.length) * 100);
  const resumeStrength = projected.resumePath ? Math.min(100, 55 + normalizeSkills(projected.skills).length * 5) : 0;
  const talentPassportScore = Math.min(
    100,
    Math.round(profileCompletion * 0.55 + resumeStrength * 0.25 + (projected.verified ? 20 : 5)),
  );

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

  indexCandidateIntoAi({
    id: data.id,
    name: data.name,
    resume_text: `${data.role || ""} ${data.about || ""} ${(data.skills || []).join(" ")}`,
    skills: Array.isArray(data.skills) ? data.skills : [],
    years_experience: Number(String(data.experience || "").replace(/\D/g, "")) || 0,
    location: data.location || "India",
    cv_path: data.resumePath || "",
  }).catch(() => undefined);

  res.json({ data: await withSignedResume(data) });
}));

router.post("/resume", wrap(async (req, res) => {
  if (!requireDb(res)) return;
  const auth = await requireAuth(req, res);
  if (!auth) return;
  const candidate = await ensureCandidate(auth);
  if (!candidate) return res.status(404).json({ error: "Candidate not found" });

  const fileName = String(req.body?.fileName || "").trim();
  const mimeType = String(req.body?.mimeType || "application/octet-stream").trim();
  const base64 = String(req.body?.base64 || "");
  if (!fileName || !base64) return res.status(400).json({ error: "fileName and base64 are required" });

  const allowed = new Set([
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ]);
  if (!allowed.has(mimeType)) return res.status(400).json({ error: "Only PDF, DOC and DOCX files are allowed" });

  const bytes = Buffer.from(base64, "base64");
  if (bytes.byteLength > 5 * 1024 * 1024) return res.status(400).json({ error: "Resume must be 5 MB or smaller" });

  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "-");
  const path = `${candidate.id}/${Date.now()}-${safeName}`;
  const { error: uploadError } = await supabase!.storage
    .from("candidate-resumes")
    .upload(path, bytes, { contentType: mimeType, upsert: false });
  if (uploadError) throw uploadError;

  if (candidate.resumePath) {
    await supabase!.storage.from("candidate-resumes").remove([String(candidate.resumePath)]).catch(() => undefined);
  }

  const now = new Date().toISOString();
  const skills = normalizeSkills(candidate.skills);
  const profileCompletion = Math.max(Number(candidate.profileCompletion || 0), 75);
  const resumeStrength = Math.min(100, 55 + skills.length * 5);
  const talentPassportScore = Math.min(
    100,
    Math.round(profileCompletion * 0.55 + resumeStrength * 0.25 + (candidate.verified ? 20 : 5)),
  );

  const { data, error } = await supabase!
    .from("sn_candidates")
    .update({
      resumePath: path,
      resumeName: fileName,
      resumeUploadedAt: now,
      profileCompletion,
      resumeStrength,
      talentPassportScore,
      updatedAt: now,
    })
    .eq("id", candidate.id)
    .select("*")
    .single();
  if (error) throw error;

  indexCandidateIntoAi({
    id: data.id,
    name: data.name,
    resume_text: `${data.role || ""} ${data.about || ""} ${(data.skills || []).join(" ")} ${data.resumeName || ""}`,
    skills: Array.isArray(data.skills) ? data.skills : [],
    years_experience: Number(String(data.experience || "").replace(/\D/g, "")) || 0,
    location: data.location || "India",
    cv_path: data.resumePath || "",
  }).catch(() => undefined);

  res.json({ data: await withSignedResume(data) });
}));

router.delete("/resume", wrap(async (req, res) => {
  if (!requireDb(res)) return;
  const auth = await requireAuth(req, res);
  if (!auth) return;
  const candidate = await ensureCandidate(auth);
  if (!candidate) return res.status(404).json({ error: "Candidate not found" });

  if (candidate.resumePath) {
    await supabase!.storage.from("candidate-resumes").remove([String(candidate.resumePath)]);
  }
  const { data, error } = await supabase!
    .from("sn_candidates")
    .update({ resumePath: null, resumeName: null, resumeUploadedAt: null, resumeStrength: 0, updatedAt: new Date().toISOString() })
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
  res.json({ data: (applications || []).map((application: any) => ({ ...application, job: byJob.get(application.jobId) || null })) });
}));

router.get("/application-access", wrap(async (req, res) => {
  if (!requireDb(res)) return;
  const auth = await requireAuth(req, res);
  if (!auth) return;
  const candidate = await ensureCandidate(auth);
  if (!candidate) return res.status(404).json({ error: "Candidate not found" });

  const access = await getCandidateApplicationAccess(candidate);
  return res.json({ data: access });
}));

router.post("/applications", wrap(async (req, res) => {
  if (!requireDb(res)) return;
  const auth = await requireAuth(req, res);
  if (!auth) return;
  const candidate = await ensureCandidate(auth);
  if (!candidate) return res.status(404).json({ error: "Candidate not found" });

  const jobId = String(req.body?.jobId || "").trim();
  if (!jobId) return res.status(400).json({ error: "jobId is required" });

  const jobCheck = await supabase!.from("sn_jobs").select("id,status").eq("id", jobId).maybeSingle();
  if (jobCheck.error) throw jobCheck.error;
  if (!jobCheck.data || jobCheck.data.status !== "Active") return res.status(404).json({ error: "Active job not found" });

  const existing = await supabase!
    .from("sn_applications")
    .select("id")
    .eq("candidateId", candidate.id)
    .eq("jobId", jobId)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return res.status(409).json({ error: "You have already applied for this job" });

  const applicationAccess = await enforceCandidateApplicationLimit(candidate);
  if (!applicationAccess.allowed) {
    return res.status(429).json({
      error: "Weekly application limit reached. Standard candidates can apply to up to 4 jobs in a rolling 7-day period. Verify your Talent Passport for unlimited job applications.",
      code: "WEEKLY_APPLICATION_LIMIT_REACHED",
      access: applicationAccess,
    });
  }

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

  const updatedAccess = applicationAccess.unlimited
    ? applicationAccess
    : {
        ...applicationAccess,
        usedThisWeek: applicationAccess.usedThisWeek + 1,
        remainingThisWeek: Math.max(0, Number(applicationAccess.remainingThisWeek || 0) - 1),
      };

  res.status(201).json({ data, access: updatedAccess });
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

  const existing = await supabase!
    .from("sn_saved_jobs")
    .select("*")
    .eq("candidateId", candidate.id)
    .eq("jobId", jobId)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return res.json({ data: existing.data });

  const payload = {
    id: `SAV-${randomUUID().slice(0, 8).toUpperCase()}`,
    candidateId: candidate.id,
    jobId,
    createdAt: new Date().toISOString(),
  };
  const { data, error } = await supabase!.from("sn_saved_jobs").insert(payload).select("*").single();
  if (error) throw error;
  res.status(201).json({ data });
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
  const matches = jobs.map((job: any) => ({ job, ...calculateMatch(candidate, job) })).sort((a, b) => b.score - a.score);
  const interviews = applications.filter((item: any) => item.status === "Interview").length;
  const shortlisted = applications.filter((item: any) => ["Screening", "Shortlisted", "Interview", "Offer"].includes(item.status)).length;

  res.json({
    data: {
      candidate: await withSignedResume(candidate),
      metrics: {
        profileCompletion: Number(candidate.profileCompletion || 0),
        talentPassportScore: Number(candidate.talentPassportScore || 0),
        resumeStrength: Number(candidate.resumeStrength || 0),
        applications: applications.length,
        shortlisted,
        interviews,
        savedJobs: (savedResult.data || []).length,
        EmployerViews: Number(candidate.profileViews || 0),
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
  const data = (jobs || []).map((job: any) => ({ job, ...calculateMatch(candidate, job) })).sort((a, b) => b.score - a.score);
  res.json({ data });
}));

router.get("/Employer", wrap(async (req, res) => {
  if (!requireDb(res)) return;
  const auth = await requireAuth(req, res);
  if (!auth) return;
  const Employer = await ensureEmployer(auth);
  if (!Employer) return res.status(404).json({ error: "Employer profile not found for this email" });
  res.json({ data: Employer });
}));

router.get("/employer/dashboard", wrap(async (req, res) => {
  if (!requireDb(res)) return;
  const auth = await requireAuth(req, res);
  if (!auth) return;
  const Employer = await ensureEmployer(auth);
  if (!Employer) return res.status(404).json({ error: "Employer profile not found for this email" });

  const jobsResult = await supabase!.from("sn_jobs").select("*").eq("company", Employer.companyName).limit(200);
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
      Employer,
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

router.patch("/Employer/applications/:applicationId", wrap(async (req, res) => {
  if (!requireDb(res)) return;
  const auth = await requireAuth(req, res);
  if (!auth) return;
  const Employer = await ensureEmployer(auth);
  if (!Employer) return res.status(404).json({ error: "Employer profile not found for this email" });

  const allowedStatuses = ["Applied", "Screening", "Shortlisted", "Interview", "Offer", "Hired", "Rejected"];
  const nextStatus = String(req.body?.status || "").trim();
  const notes = String(req.body?.notes ?? "").trim();
  const tags = Array.isArray(req.body?.tags) ? req.body.tags.map(String).map((value: string) => value.trim()).filter(Boolean).slice(0, 10) : undefined;

  if (nextStatus && !allowedStatuses.includes(nextStatus)) {
    return res.status(400).json({ error: "Invalid application status" });
  }

  const jobsResult = await supabase!.from("sn_jobs").select("id").eq("company", Employer.companyName).limit(200);
  if (jobsResult.error) throw jobsResult.error;
  const ownedJobIds = (jobsResult.data || []).map((job: any) => job.id);
  if (!ownedJobIds.length) return res.status(404).json({ error: "Application not found" });

  const existing = await supabase!
    .from("sn_applications")
    .select("*")
    .eq("id", req.params.applicationId)
    .in("jobId", ownedJobIds)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (!existing.data) return res.status(404).json({ error: "Application not found" });

  const patch: Record<string, unknown> = {
    updatedAt: new Date().toISOString(),
  };
  if (nextStatus) patch.status = nextStatus;
  if (req.body?.notes !== undefined) patch.notes = notes;
  if (tags !== undefined) patch.tags = tags;

  const { data, error } = await supabase!
    .from("sn_applications")
    .update(patch)
    .eq("id", req.params.applicationId)
    .select("*")
    .single();
  if (error) throw error;

  return res.json({ data });
}));

router.post("/Employer/applications/repair", wrap(async (req, res) => {
  if (!requireDb(res)) return;
  const auth = await requireAuth(req, res);
  if (!auth) return;

  const employer = await ensureEmployer(auth);
  if (!employer?.companyName) {
    return res.json({ repaired: 0, data: [] });
  }

  const requestedJobIds = Array.isArray(req.body?.jobIds)
    ? req.body.jobIds.map((value: unknown) => String(value || "").trim()).filter(Boolean).slice(0, 200)
    : [];

  if (!requestedJobIds.length) {
    return res.json({ repaired: 0, data: [] });
  }

  const jobsResult = await supabase!
    .from("sn_jobs")
    .select("*")
    .in("id", requestedJobIds);

  if (jobsResult.error) throw jobsResult.error;

  const employerCompany = normalizeCompanyIdentity(employer.companyName);
  const ownedJobIds = (jobsResult.data || [])
    .filter((job: any) => {
      const jobCompany = normalizeCompanyIdentity(job.company);
      return Boolean(
        jobCompany &&
        employerCompany &&
        (jobCompany === employerCompany ||
          jobCompany.includes(employerCompany) ||
          employerCompany.includes(jobCompany))
      );
    })
    .map((job: any) => String(job.id));

  if (!ownedJobIds.length) {
    return res.json({ repaired: 0, data: [] });
  }

  const employerScopeCandidates = [
    auth.uid ? `employer:${String(auth.uid).toLowerCase()}` : "",
    auth.email ? `employer:${String(auth.email).toLowerCase()}` : "",
  ].filter(Boolean);

  const employerScope = employerScopeCandidates[0] || null;

  const applicationsResult = await supabase!
    .from("sn_applications")
    .select("*")
    .in("jobId", ownedJobIds);

  if (applicationsResult.error) throw applicationsResult.error;

  let repaired = 0;
  for (const application of applicationsResult.data || []) {
    const patch: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
    };

    if (!application.employerEmail && auth.email) {
      patch.employerEmail = auth.email;
    }
    if (!application.employerScope && employerScope) {
      patch.employerScope = employerScope;
    }

    if (Object.keys(patch).length > 1) {
      const updateResult = await supabase!
        .from("sn_applications")
        .update(patch)
        .eq("id", application.id);

      if (!updateResult.error) repaired += 1;
    }
  }

  return res.json({ repaired, jobIds: ownedJobIds });
}));

router.get("/Employer/applications", wrap(async (req, res) => {
  if (!requireDb(res)) return;
  const auth = await requireAuth(req, res);
  if (!auth) return;

  const employer = await ensureEmployer(auth);

  let companyName = String(employer?.companyName || "").trim();
  if (!companyName) {
    const companyLookup = await supabase!
      .from("sn_companies")
      .select("companyName")
      .ilike("email", auth.email)
      .limit(1)
      .maybeSingle();

    if (companyLookup.error) {
      console.warn("Employer company lookup failed:", companyLookup.error.message);
    }
    if (companyLookup.data?.companyName) {
      companyName = String(companyLookup.data.companyName).trim();
    }
  }

  const normalizedEmployerCompany = normalizeCompanyIdentity(companyName);
  if (!normalizedEmployerCompany) {
    return res.json({ data: [], employer: employer || null, debug: { reason: "missing_company" } });
  }

  // Source of truth:
  // sn_applications.jobId -> sn_jobs.id -> sn_jobs.company -> employer company.
  // This intentionally does not depend on legacy employerScope/employerEmail fields.
  const [applicationsResult, jobsResult] = await Promise.all([
    supabase!
      .from("sn_applications")
      .select("*")
      .order("appliedAt", { ascending: false })
      .limit(1000),
    supabase!
      .from("sn_jobs")
      .select("*")
      .limit(1000),
  ]);

  if (applicationsResult.error) throw applicationsResult.error;
  if (jobsResult.error) throw jobsResult.error;

  const allJobs = jobsResult.data || [];
  const jobsById = new Map(allJobs.map((job: any) => [String(job.id), job]));

  const ownedJobs = allJobs.filter((job: any) => {
    const normalizedJobCompany = normalizeCompanyIdentity(job.company);
    if (!normalizedJobCompany) return false;
    return (
      normalizedJobCompany === normalizedEmployerCompany ||
      normalizedJobCompany.includes(normalizedEmployerCompany) ||
      normalizedEmployerCompany.includes(normalizedJobCompany)
    );
  });

  const ownedJobIds = new Set(ownedJobs.map((job: any) => String(job.id)));

  const applicationData = (applicationsResult.data || []).filter((application: any) => {
    const jobId = String(application.jobId || "");
    if (ownedJobIds.has(jobId)) return true;

    // Extra legacy recovery: if the app points to a job that exists, compare
    // that linked job's company directly even if it was not captured above.
    const linkedJob = jobsById.get(jobId);
    const linkedCompany = normalizeCompanyIdentity(linkedJob?.company);
    return Boolean(
      linkedCompany &&
      (linkedCompany === normalizedEmployerCompany ||
        linkedCompany.includes(normalizedEmployerCompany) ||
        normalizedEmployerCompany.includes(linkedCompany))
    );
  });

  const candidateIds = [...new Set(
    applicationData
      .map((item: any) => String(item.candidateId || ""))
      .filter(Boolean)
  )];

  let candidates: any[] = [];
  if (candidateIds.length) {
    const candidateResult = await supabase!
      .from("sn_candidates")
      .select("*")
      .in("id", candidateIds);

    if (candidateResult.error) {
      console.warn("Employer applications candidate lookup failed:", candidateResult.error.message);
    } else {
      candidates = candidateResult.data || [];
    }
  }

  const byCandidate = new Map(candidates.map((candidate: any) => [String(candidate.id), candidate]));

  // Backfill ownership on rows we can now prove belong to this employer.
  for (const application of applicationData) {
    const patch: Record<string, unknown> = {};
    if (!application.employerEmail && auth.email) patch.employerEmail = auth.email;
    if (!application.employerScope) {
      patch.employerScope = auth.uid
        ? `employer:${String(auth.uid).toLowerCase()}`
        : `employer:${String(auth.email).toLowerCase()}`;
    }

    if (Object.keys(patch).length) {
      patch.updatedAt = new Date().toISOString();
      const repair = await supabase!
        .from("sn_applications")
        .update(patch)
        .eq("id", application.id);

      if (repair.error) {
        console.warn("Application ownership backfill failed:", repair.error.message);
      }
    }
  }

  return res.json({
    data: applicationData.map((item: any) => ({
      ...item,
      job: jobsById.get(String(item.jobId)) || null,
      candidate: byCandidate.get(String(item.candidateId)) || null,
    })),
    employer: employer || null,
    debug: {
      companyName,
      normalizedEmployerCompany,
      jobsMatched: ownedJobs.length,
      applicationsMatched: applicationData.length,
    },
  });
}));

router.get("/Employer/company", wrap(async (req, res) => {
  if (!requireDb(res)) return;
  const auth = await requireAuth(req, res);
  if (!auth) return;

  const employer = await ensureEmployer(auth);

  let company: any = null;
  const byEmail = await supabase!
    .from("sn_companies")
    .select("*")
    .ilike("email", auth.email)
    .limit(1)
    .maybeSingle();

  if (byEmail.error) throw byEmail.error;
  company = byEmail.data || null;

  if (!company && employer?.companyName) {
    const byName = await supabase!
      .from("sn_companies")
      .select("*")
      .eq("companyName", employer.companyName)
      .limit(1)
      .maybeSingle();
    if (byName.error) throw byName.error;
    company = byName.data || null;
  }

  return res.json({ data: company, employer: employer || null });
}));

router.put("/Employer/company", wrap(async (req, res) => {
  if (!requireDb(res)) return;
  const auth = await requireAuth(req, res);
  if (!auth) return;

  const companyName = String(req.body?.companyName || "").trim();
  const industry = String(req.body?.industry || "").trim();
  const location = String(req.body?.location || "").trim();
  const description = String(req.body?.description || "").trim();

  if (!companyName || !industry || !location || !description) {
    return res.status(400).json({ error: "Company name, industry, location and description are required" });
  }

  const existingEmployer = await ensureEmployer(auth);
  const existingCompanyByEmail = await supabase!
    .from("sn_companies")
    .select("*")
    .ilike("email", auth.email)
    .limit(1)
    .maybeSingle();
  if (existingCompanyByEmail.error) throw existingCompanyByEmail.error;

  const now = new Date().toISOString();
  const companyId = String(existingCompanyByEmail.data?.id || `company-${auth.uid || auth.email}`);
  const employerId = String(existingEmployer?.id || `employer-${auth.uid || auth.email}`);

  const companyRecord = {
    ...(existingCompanyByEmail.data || {}),
    ...req.body,
    id: companyId,
    companyName,
    industry,
    location,
    description,
    email: auth.email,
    contactPerson: String(req.body?.contactPerson || auth.name || auth.email.split("@")[0]).trim(),
    verified: Boolean(existingCompanyByEmail.data?.verified),
    verificationStatus: String(existingCompanyByEmail.data?.verificationStatus || "Pending"),
    status: String(existingCompanyByEmail.data?.status || "Pending"),
    accountStatus: String(existingCompanyByEmail.data?.accountStatus || "Active"),
    updatedAt: now,
    createdAt: existingCompanyByEmail.data?.createdAt || now,
  };

  const { data: company, error: companyError } = await supabase!
    .from("sn_companies")
    .upsert(companyRecord, { onConflict: "id" })
    .select("*")
    .single();
  if (companyError) throw companyError;

  const employerRecord = {
    ...(existingEmployer || {}),
    id: employerId,
    companyName,
    contactPerson: String(req.body?.contactPerson || existingEmployer?.contactPerson || auth.name || auth.email.split("@")[0]).trim(),
    email: auth.email,
    location,
    jobsPosted: Number(req.body?.jobsPosted ?? existingEmployer?.jobsPosted ?? 0),
    verified: Boolean(existingEmployer?.verified || existingCompanyByEmail.data?.verified),
    joinedDate: String(existingEmployer?.joinedDate || req.body?.joinedDate || new Date().toISOString().slice(0, 10)),
    status: String(existingEmployer?.status || existingCompanyByEmail.data?.verificationStatus || "Pending"),
    updatedAt: now,
    createdAt: existingEmployer?.createdAt || now,
  };

  const { data: employer, error: employerError } = await supabase!
    .from("sn_employers")
    .upsert(employerRecord, { onConflict: "id" })
    .select("*")
    .single();
  if (employerError) throw employerError;

  return res.json({ data: company, employer });
}));

export default router;
