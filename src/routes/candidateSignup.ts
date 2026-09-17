import { Router } from "express";
import multer from "multer";
import { supabase } from "../db";

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
    }

    const now = new Date().toISOString();
    const record = {
      id: candidateId,
      name,
      email,
      phone,
      role: String(existing?.role || "Solar Candidate"),
      location: String(existing?.location || "India"),
      accountStatus: String(existing?.accountStatus || "Active"),
      profileCompletion: Number(existing?.profileCompletion || (resumeUrl ? 45 : 30)),
      resumeStrength: Number(existing?.resumeStrength || (resumeUrl ? 40 : 0)),
      talentPassportScore: Number(existing?.talentPassportScore || 0),
      currentSalary: existing?.currentSalary ?? null,
      expectedSalary: existing?.expectedSalary ?? null,
      noticePeriod: existing?.noticePeriod ?? null,
      about: existing?.about ?? null,
      resumeUrl: resumeUrl || null,
      resumeName: resumeName || null,
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
