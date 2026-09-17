import { Router } from "express";
import multer from "multer";
import { supabase } from "../db";
import { calculateProfileScores, extractResumeText, parseResumeText } from "../services/resumeParser";

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

      resumeUrl = `storage://candidate-resumes/${storagePath}`;
      resumeName = req.file.originalname;

      try {
        resumeText = await extractResumeText(req.file);
        resumeData = resumeText
          ? parseResumeText(resumeText, { name, email, phone })
          : {
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
              parserVersion: "resume-parser-v1-unparsed",
            };
      } catch (parseError) {
        console.error("Resume parsing failed; storing file without parsed fields:", parseError);
        resumeText = "";
        resumeData = {
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
          parserVersion: "resume-parser-v1-error",
        };
      }
    }

    const parsed = resumeData || {
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
      experience: years !== null ? `${years} ${years === 1 ? "Year" : "Years"}` : String(existing?.experience || ""),
      accountStatus: String(existing?.accountStatus || "Active"),
      profileCompletion: scores.profileCompletion,
      resumeStrength: scores.resumeStrength,
      talentPassportScore: Number(existing?.talentPassportScore || 0),
      currentSalary: parsed.currentSalary || existing?.currentSalary || null,
      expectedSalary: parsed.expectedSalary || existing?.expectedSalary || null,
      noticePeriod: parsed.noticePeriod || existing?.noticePeriod || null,
      about: parsed.about || existing?.about || null,
      resumeUrl: resumeUrl || null,
      resumeName: resumeName || null,
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

export default router;
