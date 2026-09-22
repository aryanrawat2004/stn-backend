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

    let query = supabase.from("sn_candidates").select("*");
    query = id ? query.eq("id", id) : query.eq("email", email);
    const { data, error } = await query.maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: "Candidate not found" });

    let resumeAccessUrl: string | null = null;
    const storedUrl = String(data.resumeUrl || "");
    if (storedUrl.startsWith("storage://candidate-resumes/")) {
      const storagePath = storedUrl.replace("storage://candidate-resumes/", "");
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

router.post("/applications", async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ error: "Database is not configured" });

    const email = clean(req.body?.email).toLowerCase();
    const jobId = clean(req.body?.jobId);
    if (!email || !jobId) {
      return res.status(400).json({ error: "Candidate email and jobId are required" });
    }

    const { data: candidate, error: candidateError } = await supabase
      .from("sn_candidates")
      .select("id,email")
      .ilike("email", email)
      .maybeSingle();

    if (candidateError) throw candidateError;
    if (!candidate) {
      return res.status(404).json({ error: "Candidate profile not found. Please complete candidate signup first." });
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
