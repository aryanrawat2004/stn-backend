import { Router } from "express";
import multer from "multer";
import { supabase } from "../db";
import { resolveAuthContext } from "../middleware/auth-context";
import { calculateProfileScores, extractResumeText, parseResumeText } from "../services/resumeParser";
import { enforceCandidateApplicationLimit } from "../services/application-limit";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = new Set([
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ]);
    if (!allowed.has(file.mimetype)) {
      return cb(new Error("Resume must be PDF, DOC or DOCX"));
    }
    cb(null, true);
  },
});

function clean(value: unknown) {
  return String(value || "").trim();
}

function safeFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-");
}

function experienceBucket(years: number | null) {
  if (years === null) return "";
  if (years <= 0) return "Fresher";
  if (years <= 1) return "0–1 Years";
  if (years <= 2) return "1–2 Years";
  if (years <= 4) return "2–4 Years";
  if (years <= 6) return "4–6 Years";
  if (years <= 10) return "6–10 Years";
  return "10+ Years";
}

function resumeNeedsReparse(data: any) {
  if (!data || typeof data !== "object") return true;
  const version = String(data.parserVersion || "");
  const hasUsefulData = Boolean(
    (Array.isArray(data.skills) && data.skills.length) ||
    (Array.isArray(data.experience) && data.experience.length) ||
    (Array.isArray(data.education) && data.education.length) ||
    (Array.isArray(data.projects) && data.projects.length) ||
    (data.about && String(data.about).trim())
  );
  return !hasUsefulData || version !== "resume-parser-v2";
}

function mimeFromFileName(name: string) {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (lower.endsWith(".doc")) return "application/msword";
  return "application/octet-stream";
}

function normalizeSkillsForMatch(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).map((v) => v.trim()).filter(Boolean);
  if (typeof value === "string") {
    return value.split(/[,|;]/g).map((v) => v.trim()).filter(Boolean);
  }
  return [];
}

function calculateCandidateJobMatch(candidate: Record<string, any>, job: Record<string, any>) {
  const candidateSkills = normalizeSkillsForMatch(candidate.skills).map((s) => s.toLowerCase());
  const jobSkills = [
    ...normalizeSkillsForMatch(job.skills),
    ...normalizeSkillsForMatch(job.tools),
    ...normalizeSkillsForMatch(job.requirements),
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
    ? (candidateRole.includes(jobRole) || jobRole.includes(candidateRole)
      ? 100
      : candidateRole.split(/\s+/).some((term) => term.length > 3 && jobRole.includes(term))
        ? 65
        : 25)
    : 0;

  const skillsScore = uniqueJobSkills.length
    ? Math.round((matchedSkills.length / uniqueJobSkills.length) * 100)
    : (candidateSkills.length ? 55 : 0);

  const candidateYears = Number(String(candidate.experience || candidate.resumeData?.yearsExperience || "").match(/\d+(?:\.\d+)?/)?.[0] || 0);
  const jobYears = Number(String(job.experience || job.requirements || "").match(/\d+(?:\.\d+)?/)?.[0] || 0);
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

  const salaryScore = String(job.salary || job.salaryRange || "") && String(candidate.expectedSalary || candidate.resumeData?.expectedSalary || "")
    ? 75
    : 50;

  const notice = String(candidate.noticePeriod || candidate.resumeData?.noticePeriod || "").toLowerCase();
  const noticeScore = /immediate|0\s*day|join\s*now/.test(notice)
    ? 100
    : notice
      ? (/15/.test(notice) ? 90 : /30/.test(notice) ? 80 : /60/.test(notice) ? 60 : 50)
      : 45;

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

function emptyParsedResume() {
  return {
    role: "Solar Candidate",
    location: "India",
    yearsExperience: null,
    about: "",
    skills: [],
    experience: [],
    education: [],
    projects: [],
    certifications: [],
    preferredRole: "",
    preferredLocations: [],
    noticePeriod: "",
    currentSalary: "",
    expectedSalary: "",
    parserVersion: "resume-parser-v1-empty",
  };
}

router.get("/profile", async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ error: "Database is not configured" });
    const id = clean(req.query.id);
    const email = clean(req.query.email).toLowerCase();
    if (!id && !email) return res.status(400).json({ error: "Candidate id or email is required" });

    let data: any = null;

    if (id) {
      const byId = await supabase
        .from("sn_candidates")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (byId.error) return res.status(500).json({ error: byId.error.message });
      data = byId.data;

      if (!data) {
        const byFirebaseUid = await supabase
          .from("sn_candidates")
          .select("*")
          .eq("firebaseUid", id)
          .maybeSingle();
        if (byFirebaseUid.error) return res.status(500).json({ error: byFirebaseUid.error.message });
        data = byFirebaseUid.data;
      }
    }

    if (!data && email) {
      const byEmail = await supabase
        .from("sn_candidates")
        .select("*")
        .ilike("email", email)
        .maybeSingle();
      if (byEmail.error) return res.status(500).json({ error: byEmail.error.message });
      data = byEmail.data;
    }

    if (!data) return res.status(404).json({ error: "Candidate not found" });

    let resumeAccessUrl: string | null = null;
    const storedUrl = String(data.resumeUrl || "");
    const storagePath = String(data.resumePath || (storedUrl.startsWith("storage://candidate-resumes/") ? storedUrl.replace("storage://candidate-resumes/", "") : ""));

    if (storagePath && resumeNeedsReparse(data.resumeData)) {
      try {
        const { data: downloaded, error: downloadError } = await supabase.storage
          .from("candidate-resumes")
          .download(storagePath);

        if (!downloadError && downloaded) {
          const bytes = Buffer.from(await downloaded.arrayBuffer());
          const fileName = String(data.resumeName || storagePath.split("/").pop() || "resume.pdf");
          const pseudoFile = {
            fieldname: "resume",
            originalname: fileName,
            encoding: "7bit",
            mimetype: mimeFromFileName(fileName),
            size: bytes.byteLength,
            buffer: bytes,
            destination: "",
            filename: fileName,
            path: storagePath,
          } as Express.Multer.File;

          const resumeText = await extractResumeText(pseudoFile);
          if (resumeText) {
            const parsed = parseResumeText(resumeText, {
              name: String(data.name || ""),
              email: String(data.email || ""),
              phone: String(data.phone || ""),
            });
            const scores = calculateProfileScores(parsed, true);
            const years = typeof parsed.yearsExperience === "number" ? parsed.yearsExperience : null;
            const patch: Record<string, unknown> = {
              resumeText,
              resumeData: parsed,
              resumeParsedAt: new Date().toISOString(),
              profileCompletion: scores.profileCompletion,
              resumeStrength: scores.resumeStrength,
              updatedAt: new Date().toISOString(),
            };

            if (parsed.role && parsed.role !== "Solar Candidate") patch.role = parsed.role;
            if (parsed.location && parsed.location !== "India") patch.location = parsed.location;
            const experience = experienceBucket(years);
            if (experience) patch.experience = experience;
            if (parsed.skills.length) patch.skills = parsed.skills;
            if (parsed.about) patch.about = parsed.about;
            if (parsed.noticePeriod) patch.noticePeriod = parsed.noticePeriod;
            if (parsed.currentSalary) patch.currentSalary = parsed.currentSalary;
            if (parsed.expectedSalary) patch.expectedSalary = parsed.expectedSalary;

            const updated = await supabase
              .from("sn_candidates")
              .update(patch)
              .eq("id", data.id)
              .select("*")
              .single();

            if (!updated.error && updated.data) data = updated.data;
          }
        }
      } catch (parseError) {
        console.warn("Automatic resume re-parse failed:", parseError);
      }
    }

    if (storagePath) {
      const { data: signed } = await supabase.storage.from("candidate-resumes").createSignedUrl(storagePath, 60 * 30);
      resumeAccessUrl = signed?.signedUrl || null;
    } else if (storedUrl) {
      resumeAccessUrl = storedUrl;
    }

    return res.json({ data: { ...data, resumeAccessUrl } });
  } catch (error: any) {
    console.error("Candidate profile fetch failed:", error);
    return res.status(500).json({ error: error?.message || "Could not load candidate profile" });
  }
});

router.post("/signup", upload.single("resume"), async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ error: "Database is not configured" });

    const name = clean(req.body?.name);
    const email = clean(req.body?.email).toLowerCase();
    const phone = clean(req.body?.phone).replace(/\D/g, "");
    const firebaseUid = clean(req.body?.firebaseUid) || null;

    if (!name || !email || !/^[6-9]\d{9}$/.test(phone)) {
      return res.status(400).json({ error: "Name, email and a valid 10-digit mobile number are required" });
    }

    const { data: existing, error: existingError } = await supabase
      .from("sn_candidates")
      .select("*")
      .eq("email", email)
      .maybeSingle();

    if (existingError) return res.status(500).json({ error: existingError.message });

    const candidateId = String(existing?.id || `CAN-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    let resumeUrl = String(existing?.resumeUrl || "");
    let resumePath = String(existing?.resumePath || "");
    let resumeName = String(existing?.resumeName || "");
    let resumeText = String(existing?.resumeText || "");
    let resumeData = existing?.resumeData || null;

    if (req.file) {
      const fileName = safeFileName(req.file.originalname || "resume.pdf");
      const storagePath = `${candidateId}/${Date.now()}-${fileName}`;
      const { error: uploadError } = await supabase.storage
        .from("candidate-resumes")
        .upload(storagePath, req.file.buffer, {
          contentType: req.file.mimetype,
          upsert: true,
        });

      if (uploadError) {
        return res.status(500).json({ error: `Resume upload failed: ${uploadError.message}` });
      }

      resumePath = storagePath;
      resumeUrl = `storage://candidate-resumes/${storagePath}`;
      resumeName = req.file.originalname;

      try {
        resumeText = await extractResumeText(req.file);
        resumeData = resumeText ? parseResumeText(resumeText, { name, email, phone }) : emptyParsedResume();
      } catch (parseError) {
        console.error("Resume parsing failed; storing file without parsed fields:", parseError);
        resumeText = "";
        resumeData = { ...emptyParsedResume(), parserVersion: "resume-parser-v1-error" };
      }
    }

    const parsed = resumeData || emptyParsedResume();
    const scores = calculateProfileScores(parsed, Boolean(resumeUrl));
    const now = new Date().toISOString();
    const years = typeof parsed.yearsExperience === "number" ? parsed.yearsExperience : null;

    const record = {
      id: candidateId,
      name,
      email,
      phone,
      role: parsed.role && parsed.role !== "Solar Candidate" ? parsed.role : String(existing?.role || "Solar Candidate"),
      location: parsed.location && parsed.location !== "India" ? parsed.location : String(existing?.location || "India"),
      experience: experienceBucket(years) || String(existing?.experience || ""),
      skills: Array.isArray(parsed.skills) && parsed.skills.length ? parsed.skills : (existing?.skills || []),
      accountStatus: String(existing?.accountStatus || "Active"),
      profileCompletion: scores.profileCompletion,
      resumeStrength: scores.resumeStrength,
      talentPassportScore: Number(existing?.talentPassportScore || 0),
      currentSalary: parsed.currentSalary || existing?.currentSalary || null,
      expectedSalary: parsed.expectedSalary || existing?.expectedSalary || null,
      noticePeriod: parsed.noticePeriod || existing?.noticePeriod || null,
      about: parsed.about || existing?.about || null,
      resumeUrl: resumeUrl || null,
      resumePath: resumePath || null,
      resumeName: resumeName || null,
      resumeUploadedAt: req.file ? now : existing?.resumeUploadedAt || null,
      resumeText: resumeText || null,
      resumeData: parsed,
      resumeParsedAt: req.file ? now : existing?.resumeParsedAt || null,
      firebaseUid: firebaseUid || existing?.firebaseUid || null,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    const query = existing
      ? supabase.from("sn_candidates").update(record).eq("id", candidateId)
      : supabase.from("sn_candidates").insert(record);

    const { data, error } = await query.select("*").single();
    if (error) return res.status(500).json({ error: error.message });

    return res.status(existing ? 200 : 201).json({ data });
  } catch (error: any) {
    console.error("Candidate signup persistence failed:", error);
    return res.status(500).json({ error: error?.message || "Could not save candidate signup" });
  }
});

router.get("/application-access", async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ error: "Database is not configured" });
    const email = clean(req.query.email).toLowerCase();
    if (!email) return res.status(400).json({ error: "Candidate email is required" });

    const { data: candidate, error } = await supabase
      .from("sn_candidates")
      .select("*")
      .ilike("email", email)
      .maybeSingle();
    if (error) throw error;
    if (!candidate) return res.status(404).json({ error: "Candidate profile not found" });

    const access = await enforceCandidateApplicationLimit(candidate);
    return res.json({ data: access });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || "Could not load application access" });
  }
});

router.post("/applications", async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ error: "Database is not configured" });

    const email = clean(req.body?.email).toLowerCase();
    const jobId = clean(req.body?.jobId);
    const jobTitle = clean(req.body?.jobTitle);
    const jobCompany = clean(req.body?.jobCompany);
    const jobLocation = clean(req.body?.jobLocation);
    const jobType = clean(req.body?.jobType) || "Full-time";
    const jobMode = clean(req.body?.jobMode);
    const fullName = clean(req.body?.fullName);
    const phone = clean(req.body?.phone).replace(/\D/g, "");
    const currentJobRole = clean(req.body?.currentJobRole);
    const currentDesignation = clean(req.body?.currentDesignation);
    const currentSalary = clean(req.body?.currentSalary);
    const expectedSalary = clean(req.body?.expectedSalary);
    const currentLocation = clean(req.body?.currentLocation);
    const hometownLocation = clean(req.body?.hometownLocation);
    const preferredWorkLocation = clean(req.body?.preferredWorkLocation);
    const totalExperience = clean(req.body?.totalExperience);
    const relevantExperience = clean(req.body?.relevantExperience);
    const highestQualification = clean(req.body?.highestQualification);
    const workSkills = clean(req.body?.workSkills);
    const reasonOfLeaving = clean(req.body?.reasonOfLeaving);
    const noticePeriod = clean(req.body?.noticePeriod);
    const coverNote = clean(req.body?.coverNote).slice(0, 1200);

    if (!email || !jobId) {
      return res.status(400).json({ error: "Candidate email and jobId are required" });
    }
    if (phone && !/^[6-9]\d{9}$/.test(phone)) {
      return res.status(400).json({ error: "Enter a valid 10-digit Indian mobile number" });
    }

    const { data: candidate, error: candidateError } = await supabase
      .from("sn_candidates")
      .select("*")
      .ilike("email", email)
      .maybeSingle();

    if (candidateError) throw candidateError;
    if (!candidate) {
      return res.status(404).json({ error: "Candidate profile not found. Please complete candidate signup first." });
    }

    const profilePatch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (fullName) profilePatch.name = fullName;
    if (phone) profilePatch.phone = phone;
    if (currentJobRole) profilePatch.role = currentJobRole;
    if (currentSalary) profilePatch.currentSalary = currentSalary;
    if (expectedSalary) profilePatch.expectedSalary = expectedSalary;
    if (currentLocation) profilePatch.location = currentLocation;
    if (totalExperience) profilePatch.experience = totalExperience;
    if (noticePeriod) profilePatch.noticePeriod = noticePeriod;

    const currentSkills = Array.isArray(candidate.skills) ? candidate.skills.map(String) : [];
    const incomingSkills = workSkills
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    if (incomingSkills.length) {
      profilePatch.skills = [...new Set([...currentSkills, ...incomingSkills])].slice(0, 30);
    }

    const existingResumeData =
      candidate.resumeData && typeof candidate.resumeData === "object"
        ? candidate.resumeData
        : {};
    profilePatch.resumeData = {
      ...existingResumeData,
      applicationProfile: {
        fullName,
        email,
        phone,
        currentJobRole,
        currentDesignation,
        currentSalary,
        expectedSalary,
        currentLocation,
        hometownLocation,
        preferredWorkLocation,
        totalExperience,
        relevantExperience,
        highestQualification,
        workSkills,
        reasonOfLeaving,
        noticePeriod,
        updatedAt: new Date().toISOString(),
      },
    };

    if (Object.keys(profilePatch).length > 1) {
      const { error: profileError } = await supabase
        .from("sn_candidates")
        .update(profilePatch)
        .eq("id", candidate.id);
      if (profileError) throw profileError;
    }

    const { data: existingJob, error: jobLookupError } = await supabase
      .from("sn_jobs")
      .select("*")
      .eq("id", jobId)
      .maybeSingle();

    if (jobLookupError) throw jobLookupError;

    if (!existingJob) {
      if (!jobTitle || !jobCompany || !jobLocation) {
        return res.status(404).json({
          error: "This job is not available in the hiring catalog. Please reopen the job and try again.",
          code: "JOB_CATALOG_ENTRY_MISSING",
        });
      }

      const now = new Date().toISOString();
      const jobRecord: Record<string, unknown> = {
        id: jobId,
        role: jobTitle,
        company: jobCompany,
        location: jobLocation,
        type: jobType,
        status: "Active",
        createdAt: now,
        updatedAt: now,
      };

      if (jobMode) jobRecord.workMode = jobMode;

      const { error: syncError } = await supabase
        .from("sn_jobs")
        .insert(jobRecord);

      if (syncError) {
        console.error("Application job catalog sync failed:", syncError);
        return res.status(500).json({
          error: "Could not prepare this job for applications. Please try again.",
          detail: syncError.message,
          code: "JOB_CATALOG_SYNC_FAILED",
        });
      }
    }

    const { data: duplicate, error: duplicateError } = await supabase
      .from("sn_applications")
      .select("id,jobId,candidateId,status,appliedAt")
      .eq("candidateId", candidate.id)
      .eq("jobId", jobId)
      .maybeSingle();

    if (duplicateError) throw duplicateError;
    if (duplicate) {
      return res.status(409).json({ error: "You have already applied to this job.", data: duplicate });
    }

    const applicationAccess = await enforceCandidateApplicationLimit(candidate);
    if (!applicationAccess.allowed) {
      return res.status(429).json({
        error: "Weekly application limit reached. Standard candidates can apply to up to 4 jobs in a rolling 7-day period. Verify your Talent Passport for unlimited job applications.",
        code: "WEEKLY_APPLICATION_LIMIT_REACHED",
        access: applicationAccess,
      });
    }

    const now = new Date().toISOString();
    const record = {
      id: clean(req.body?.id) || `APP-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      jobId,
      candidateId: String(candidate.id),
      status: "Applied",
      appliedAt: now,
      createdAt: now,
      updatedAt: now,
      notes: coverNote,
      tags: incomingSkills.slice(0, 8),
    };

    const { data, error } = await supabase
      .from("sn_applications")
      .insert(record)
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

    return res.status(201).json({ data, access: updatedAccess });
  } catch (error: any) {
    console.error("Candidate application persistence failed:", error);
    return res.status(500).json({ error: error?.message || "Could not save candidate application" });
  }
});


router.get("/dashboard", async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ error: "Database is not configured" });

    const email = clean(req.query.email).toLowerCase();
    if (!email) return res.status(400).json({ error: "Candidate email is required" });

    const { data: candidate, error: candidateError } = await supabase
      .from("sn_candidates")
      .select("*")
      .ilike("email", email)
      .maybeSingle();

    if (candidateError) throw candidateError;
    if (!candidate) return res.status(404).json({ error: "Candidate profile not found" });

    const [applicationsResult, savedResult, jobsResult] = await Promise.all([
      supabase.from("sn_applications").select("*").eq("candidateId", candidate.id),
      supabase.from("sn_saved_jobs").select("*").eq("candidateId", candidate.id),
      supabase.from("sn_jobs").select("*").eq("status", "Active").limit(200),
    ]);

    if (applicationsResult.error) throw applicationsResult.error;
    if (savedResult.error) throw savedResult.error;
    if (jobsResult.error) throw jobsResult.error;

    const applications = applicationsResult.data || [];
    const jobs = jobsResult.data || [];
    const matches = jobs
      .map((job: any) => ({ job, ...calculateCandidateJobMatch(candidate, job) }))
      .sort((a, b) => b.score - a.score);

    const interviews = applications.filter((item: any) => item.status === "Interview").length;
    const shortlisted = applications.filter((item: any) =>
      ["Screening", "Shortlisted", "Interview", "Offer"].includes(item.status)
    ).length;

    return res.json({
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
          EmployerViews: Number(candidate.profileViews || 0),
          jobMatches: matches.filter((item) => item.score >= 60).length,
        },
        recommendedJobs: matches.slice(0, 5),
      },
    });
  } catch (error: any) {
    console.error("Candidate dashboard fetch failed:", error);
    return res.status(500).json({ error: error?.message || "Could not load candidate dashboard" });
  }
});

router.get("/applications", async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ error: "Database is not configured" });

    const email = clean(req.query.email).toLowerCase();
    if (!email) return res.status(400).json({ error: "Candidate email is required" });

    const { data: candidate, error: candidateError } = await supabase
      .from("sn_candidates")
      .select("id,email")
      .ilike("email", email)
      .maybeSingle();

    if (candidateError) throw candidateError;
    if (!candidate) return res.status(404).json({ error: "Candidate profile not found" });

    const { data: applications, error: applicationsError } = await supabase
      .from("sn_applications")
      .select("*")
      .eq("candidateId", candidate.id)
      .order("appliedAt", { ascending: false });

    if (applicationsError) throw applicationsError;

    const jobIds = [...new Set((applications || []).map((item: any) => item.jobId).filter(Boolean))];
    let jobs: any[] = [];

    if (jobIds.length) {
      const jobsResult = await supabase
        .from("sn_jobs")
        .select("*")
        .in("id", jobIds);

      if (jobsResult.error) throw jobsResult.error;
      jobs = jobsResult.data || [];
    }

    const jobsById = new Map(jobs.map((job: any) => [String(job.id), job]));

    return res.json({
      data: (applications || []).map((application: any) => ({
        ...application,
        job: jobsById.get(String(application.jobId)) || null,
      })),
    });
  } catch (error: any) {
    console.error("Candidate applications fetch failed:", error);
    return res.status(500).json({ error: error?.message || "Could not load candidate applications" });
  }
});

router.delete("/applications/:applicationId", async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ error: "Database is not configured" });

    const email = clean(req.query.email).toLowerCase();
    const applicationId = clean(req.params.applicationId);

    if (!email) return res.status(400).json({ error: "Candidate email is required" });
    if (!applicationId) return res.status(400).json({ error: "Application id is required" });

    const { data: candidate, error: candidateError } = await supabase
      .from("sn_candidates")
      .select("id,email")
      .ilike("email", email)
      .maybeSingle();

    if (candidateError) throw candidateError;
    if (!candidate) return res.status(404).json({ error: "Candidate profile not found" });

    const { data: existing, error: existingError } = await supabase
      .from("sn_applications")
      .select("id,candidateId")
      .eq("id", applicationId)
      .eq("candidateId", candidate.id)
      .maybeSingle();

    if (existingError) throw existingError;
    if (!existing) return res.status(404).json({ error: "Application not found" });

    const { error } = await supabase
      .from("sn_applications")
      .delete()
      .eq("id", applicationId)
      .eq("candidateId", candidate.id);

    if (error) throw error;
    return res.json({ success: true });
  } catch (error: any) {
    console.error("Candidate application withdrawal failed:", error);
    return res.status(500).json({ error: error?.message || "Could not withdraw application" });
  }
});

router.post("/resume-parse", async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ error: "Database is not configured" });

    const auth = await resolveAuthContext(req);
    if (!auth?.email) return res.status(401).json({ error: "Authenticated email is required" });

    const fileName = clean(req.body?.fileName);
    const mimeType = clean(req.body?.mimeType) || "application/octet-stream";
    const base64 = clean(req.body?.base64);
    if (!fileName || !base64) return res.status(400).json({ error: "fileName and base64 are required" });

    const allowed = new Set([
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ]);
    if (!allowed.has(mimeType)) return res.status(400).json({ error: "Only PDF, DOC and DOCX files are allowed" });

    const bytes = Buffer.from(base64, "base64");
    if (!bytes.length) return res.status(400).json({ error: "Resume file is empty" });
    if (bytes.byteLength > 5 * 1024 * 1024) return res.status(400).json({ error: "Resume must be 5 MB or smaller" });

    const { data: candidate, error: candidateError } = await supabase
      .from("sn_candidates")
      .select("*")
      .ilike("email", auth.email)
      .maybeSingle();
    if (candidateError) throw candidateError;
    if (!candidate) return res.status(404).json({ error: "Candidate profile not found. Please complete signup first." });

    const safeName = safeFileName(fileName);
    const storagePath = `${candidate.id}/${Date.now()}-${safeName}`;
    const { error: uploadError } = await supabase.storage
      .from("candidate-resumes")
      .upload(storagePath, bytes, { contentType: mimeType, upsert: false });
    if (uploadError) throw uploadError;

    const pseudoFile = {
      fieldname: "resume",
      originalname: fileName,
      encoding: "7bit",
      mimetype: mimeType,
      size: bytes.byteLength,
      buffer: bytes,
      destination: "",
      filename: safeName,
      path: storagePath,
    } as Express.Multer.File;

    const resumeText = await extractResumeText(pseudoFile);
    if (!resumeText) {
      await supabase.storage.from("candidate-resumes").remove([storagePath]).catch(() => undefined);
      return res.status(422).json({
        error: fileName.toLowerCase().endsWith(".doc")
          ? "Legacy DOC files cannot be parsed reliably. Please upload PDF or DOCX."
          : "Could not read text from this resume. Please upload a text-based PDF or DOCX.",
      });
    }

    const parsed = parseResumeText(resumeText, {
      name: String(candidate.name || auth.name || ""),
      email: String(candidate.email || auth.email),
      phone: String(candidate.phone || ""),
    });
    const scores = calculateProfileScores(parsed, true);
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = {
      resumePath: storagePath,
      resumeUrl: `storage://candidate-resumes/${storagePath}`,
      resumeName: fileName,
      resumeUploadedAt: now,
      resumeText,
      resumeData: parsed,
      resumeParsedAt: now,
      profileCompletion: scores.profileCompletion,
      resumeStrength: scores.resumeStrength,
      talentPassportScore: Math.min(100, Math.round(scores.profileCompletion * 0.55 + scores.resumeStrength * 0.25 + (candidate.verified ? 20 : 5))),
      updatedAt: now,
    };

    if (parsed.role && parsed.role !== "Solar Candidate") patch.role = parsed.role;
    if (parsed.location && parsed.location !== "India") patch.location = parsed.location;
    const experience = experienceBucket(parsed.yearsExperience);
    if (experience) patch.experience = experience;
    if (parsed.skills.length) patch.skills = parsed.skills;
    if (parsed.about) patch.about = parsed.about;
    if (parsed.noticePeriod) patch.noticePeriod = parsed.noticePeriod;
    if (parsed.currentSalary) patch.currentSalary = parsed.currentSalary;
    if (parsed.expectedSalary) patch.expectedSalary = parsed.expectedSalary;

    const { data, error } = await supabase
      .from("sn_candidates")
      .update(patch)
      .eq("id", candidate.id)
      .select("*")
      .single();
    if (error) throw error;

    if (candidate.resumePath && candidate.resumePath !== storagePath) {
      await supabase.storage.from("candidate-resumes").remove([String(candidate.resumePath)]).catch(() => undefined);
    }

    const { data: signed } = await supabase.storage.from("candidate-resumes").createSignedUrl(storagePath, 60 * 60);
    return res.json({ data: { ...data, resumeUrl: signed?.signedUrl || null }, parsed: true });
  } catch (error: any) {
    console.error("Candidate resume parsing failed:", error);
    return res.status(500).json({ error: error?.message || "Could not parse candidate resume" });
  }
});

export default router;
