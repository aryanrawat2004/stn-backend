import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { supabase } from "../db";
import { resolveAuthContext } from "../middleware/auth-context";

const router = Router();

const uploadDirectory = path.join(process.cwd(), "uploads", "passport-verification");
if (!fs.existsSync(uploadDirectory)) fs.mkdirSync(uploadDirectory, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDirectory),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${crypto.randomUUID()}${path.extname(file.originalname)}`),
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["application/pdf", "image/jpeg", "image/png"];
    if (!allowed.includes(file.mimetype)) return cb(new Error("Only PDF, JPG and PNG documents are allowed"));
    cb(null, true);
  },
});

const STEP_DOCUMENTS = {
  aadhaar: ["aadhaar_front", "aadhaar_back"],
  employment: ["resume"],
  police: ["police_verification_certificate"],
} as const;

type VerificationStep = keyof typeof STEP_DOCUMENTS;
type StepStatus = "pending" | "submitted" | "under_review" | "verified" | "rejected";

function stableUuid(input: string) {
  const bytes = crypto.createHash("sha256").update(input.toLowerCase()).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

function statusColumn(step: VerificationStep) {
  return `${step}_status`;
}

function verifiedAtColumn(step: VerificationStep) {
  return `${step}_verified_at`;
}

async function getVerificationWithDocuments(verificationId: string) {
  if (!supabase) return null;
  const { data: verification, error: verificationError } = await supabase
    .from("candidate_verifications")
    .select("*")
    .eq("id", verificationId)
    .maybeSingle();
  if (verificationError) throw verificationError;
  if (!verification) return null;

  const { data: documents, error: documentsError } = await supabase
    .from("candidate_verification_documents")
    .select("*")
    .eq("verification_id", verificationId)
    .order("created_at", { ascending: true });
  if (documentsError) throw documentsError;
  return { verification, documents: documents || [] };
}

async function refreshOverallStatus(verificationId: string) {
  if (!supabase) return;
  const { data, error } = await supabase
    .from("candidate_verifications")
    .select("aadhaar_status,employment_status,police_status,payment_status")
    .eq("id", verificationId)
    .single();
  if (error || !data) return;

  const statuses = [data.aadhaar_status, data.employment_status, data.police_status];
  let status = "draft";
  if (statuses.includes("rejected")) status = "action_required";
  else if (statuses.every((value) => value === "verified") && data.payment_status === "paid") status = "verified";
  else if (statuses.some((value) => ["submitted", "under_review", "verified"].includes(value))) status = "under_review";

  await supabase
    .from("candidate_verifications")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", verificationId);
}

router.post("/", async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ error: "Database is not configured" });

    const {
      candidateId,
      fullName,
      phone,
      currentRole,
      experience,
      location,
      aadhaarLast4,
      policeReferenceNumber,
      policeIssueDate,
      policeIssuingAuthority,
      policeState,
    } = req.body || {};

    if (!fullName || !phone) return res.status(400).json({ error: "Full name and phone are required" });

    const auth = await resolveAuthContext(req);
    let verifiedIdentity: any = null;
    if (auth?.email || auth?.uid) {
      const userId = stableUuid(auth.uid || auth.email || "");
      const { data: latestIdentity } = await supabase
        .from("identity_verifications")
        .select("aadhaar_last4,full_name,verified_at,status")
        .eq("user_id", userId)
        .eq("verification_type", "aadhaar_otp")
        .eq("status", "verified")
        .order("verified_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      verifiedIdentity = latestIdentity || null;
    }

    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("candidate_verifications")
      .insert({
        id: crypto.randomUUID(),
        candidate_id: candidateId || null,
        full_name: verifiedIdentity?.full_name || fullName,
        phone,
        current_role: currentRole || null,
        experience: experience || null,
        location: location || null,
        aadhaar_last4: verifiedIdentity?.aadhaar_last4 || aadhaarLast4 || null,
        police_reference_number: policeReferenceNumber || null,
        police_issue_date: policeIssueDate || null,
        police_issuing_authority: policeIssuingAuthority || null,
        police_state: policeState || null,
        status: "draft",
        aadhaar_status: verifiedIdentity ? "verified" : "pending",
        aadhaar_verified_at: verifiedIdentity?.verified_at || null,
        employment_status: "pending",
        police_status: "pending",
        payment_status: "pending",
        amount: 999,
        created_at: now,
        updated_at: now,
      })
      .select("*")
      .single();

    if (error) return res.status(500).json({ error: "Could not create verification request", details: error.message });
    return res.status(201).json({ message: "Verification request created", data });
  } catch (error) {
    console.error("Create verification error:", error);
    return res.status(500).json({ error: "Could not create verification request" });
  }
});

router.post("/:verificationId/documents", upload.single("document"), async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ error: "Database is not configured" });
    const { verificationId } = req.params;
    const documentType = String(req.body.documentType || "");

    if (!req.file) return res.status(400).json({ error: "Document file is required" });
    if (!documentType) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: "Document type is required" });
    }

    const { data: verification, error: verificationError } = await supabase
      .from("candidate_verifications")
      .select("id")
      .eq("id", verificationId)
      .maybeSingle();

    if (verificationError || !verification) {
      fs.unlinkSync(req.file.path);
      return res.status(verificationError ? 500 : 404).json({ error: verificationError?.message || "Verification request not found" });
    }

    const { data, error } = await supabase
      .from("candidate_verification_documents")
      .insert({
        id: crypto.randomUUID(),
        verification_id: verificationId,
        document_type: documentType,
        file_url: `/uploads/passport-verification/${req.file.filename}`,
        status: "pending",
        created_at: new Date().toISOString(),
      })
      .select("*")
      .single();

    if (error) return res.status(500).json({ error: "Could not save uploaded document", details: error.message });
    return res.status(201).json({ message: "Document uploaded", data });
  } catch (error) {
    console.error("Upload verification document error:", error);
    return res.status(500).json({ error: "Could not upload verification document" });
  }
});

router.patch("/:verificationId/steps/:step/submit", async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ error: "Database is not configured" });
    const verificationId = req.params.verificationId;
    const step = req.params.step as VerificationStep;
    if (!(step in STEP_DOCUMENTS)) return res.status(400).json({ error: "Invalid verification step" });

    const { data: documents, error: documentsError } = await supabase
      .from("candidate_verification_documents")
      .select("document_type")
      .eq("verification_id", verificationId);
    if (documentsError) return res.status(500).json({ error: documentsError.message });

    const uploaded = (documents || []).map((row: { document_type: string }) => row.document_type);

    if (step === "aadhaar") {
      const { data: existingVerification, error: verificationLookupError } = await supabase
        .from("candidate_verifications")
        .select("aadhaar_status")
        .eq("id", verificationId)
        .single();
      if (verificationLookupError) return res.status(500).json({ error: verificationLookupError.message });
      if (existingVerification?.aadhaar_status === "verified") {
        await refreshOverallStatus(verificationId);
        return res.json({ message: "aadhaar verification already verified by OTP", data: existingVerification });
      }
    }

    const missing = STEP_DOCUMENTS[step].filter((type) => !uploaded.includes(type));
    if (missing.length) return res.status(400).json({ error: "Required documents are missing", missing });

    const { data, error } = await supabase
      .from("candidate_verifications")
      .update({ [statusColumn(step)]: "submitted" as StepStatus, updated_at: new Date().toISOString() })
      .eq("id", verificationId)
      .select("*")
      .single();
    if (error) return res.status(500).json({ error: error.message });

    await refreshOverallStatus(verificationId);
    return res.json({ message: `${step} verification submitted`, data });
  } catch (error) {
    console.error("Submit verification step error:", error);
    return res.status(500).json({ error: "Could not submit verification step" });
  }
});

router.patch("/:verificationId/submit", async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ error: "Database is not configured" });
    const { verificationId } = req.params;
    const details = await getVerificationWithDocuments(verificationId);
    if (!details) return res.status(404).json({ error: "Verification not found" });

    const uploaded = details.documents.map((row: any) => row.document_type);
    const required = [
      ...(details.verification.aadhaar_status === "verified" ? [] : STEP_DOCUMENTS.aadhaar),
      ...STEP_DOCUMENTS.employment,
      ...STEP_DOCUMENTS.police,
    ];
    const missing = required.filter((type) => !uploaded.includes(type));
    if (missing.length) return res.status(400).json({ error: "Required documents are missing", missing });

    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("candidate_verifications")
      .update({
        aadhaar_status: details.verification.aadhaar_status === "pending" ? "submitted" : details.verification.aadhaar_status,
        employment_status: details.verification.employment_status === "pending" ? "submitted" : details.verification.employment_status,
        police_status: details.verification.police_status === "pending" ? "submitted" : details.verification.police_status,
        status: "under_review",
        submitted_at: now,
        updated_at: now,
      })
      .eq("id", verificationId)
      .select("*")
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ message: "Talent Passport verification submitted for review", data });
  } catch (error) {
    console.error("Submit full verification error:", error);
    return res.status(500).json({ error: "Could not submit verification" });
  }
});

router.get("/admin/requests", async (_req, res) => {
  try {
    if (!supabase) return res.status(503).json({ error: "Database is not configured" });
    const { data: verifications, error } = await supabase
      .from("candidate_verifications")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) return res.status(500).json({ error: error.message });

    const { data: documents } = await supabase.from("candidate_verification_documents").select("verification_id");
    const countMap = new Map<string, number>();
    (documents || []).forEach((document: { verification_id: string }) => {
      countMap.set(document.verification_id, (countMap.get(document.verification_id) || 0) + 1);
    });

    return res.json({ data: (verifications || []).map((verification: any) => ({ ...verification, document_count: countMap.get(verification.id) || 0 })) });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Could not load verification requests" });
  }
});

router.get("/admin/requests/:verificationId", async (req, res) => {
  try {
    const details = await getVerificationWithDocuments(req.params.verificationId);
    if (!details) return res.status(404).json({ error: "Verification not found" });
    return res.json({ data: details });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || "Could not load verification request" });
  }
});

router.patch("/admin/requests/:verificationId/steps/:step/:decision", async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ error: "Database is not configured" });
    const verificationId = req.params.verificationId;
    const step = req.params.step as VerificationStep;
    const decision = req.params.decision as "approve" | "reject";

    if (!(step in STEP_DOCUMENTS)) return res.status(400).json({ error: "Invalid verification step" });
    if (!["approve", "reject"].includes(decision)) return res.status(400).json({ error: "Invalid decision" });

    const stepStatus: StepStatus = decision === "approve" ? "verified" : "rejected";
    const update: Record<string, unknown> = { [statusColumn(step)]: stepStatus, updated_at: new Date().toISOString() };
    if (decision === "approve") update[verifiedAtColumn(step)] = new Date().toISOString();
    if (decision === "reject") update.rejection_reason = req.body?.reason || `${step} verification rejected`;

    const { error } = await supabase.from("candidate_verifications").update(update).eq("id", verificationId);
    if (error) return res.status(500).json({ error: error.message });
    await refreshOverallStatus(verificationId);

    const { data: refreshed, error: refreshError } = await supabase
      .from("candidate_verifications")
      .select("*")
      .eq("id", verificationId)
      .single();
    if (refreshError || !refreshed) return res.status(500).json({ error: refreshError?.message || "Could not refresh verification" });

    if (
      refreshed.aadhaar_status === "verified" &&
      refreshed.employment_status === "verified" &&
      refreshed.police_status === "verified" &&
      refreshed.payment_status === "paid"
    ) {
      await supabase.from("candidate_verifications").update({
        status: "verified",
        verified_at: new Date().toISOString(),
        valid_until: null,
        updated_at: new Date().toISOString(),
      }).eq("id", verificationId);

      if (refreshed.candidate_id) {
        await supabase.from("sn_candidates").update({
          is_verified: true,
          verification_valid_until: null,
          verification_priority: 1,
        }).eq("id", refreshed.candidate_id);
      }
    }

    return res.json({ message: `${step} verification ${stepStatus}`, data: refreshed });
  } catch (error) {
    console.error("Update verification step error:", error);
    return res.status(500).json({ error: "Could not update verification step" });
  }
});

router.patch("/admin/requests/:verificationId/approve", async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ error: "Database is not configured" });
    const verificationId = req.params.verificationId;
    const { data: verification, error: verificationError } = await supabase
      .from("candidate_verifications")
      .select("*")
      .eq("id", verificationId)
      .single();
    if (verificationError || !verification) return res.status(404).json({ error: "Verification not found" });

    const now = new Date().toISOString();
    const { data, error } = await supabase.from("candidate_verifications").update({
      status: "verified",
      aadhaar_status: "verified",
      employment_status: "verified",
      police_status: "verified",
      aadhaar_verified_at: now,
      employment_verified_at: now,
      police_verified_at: now,
      verified_at: now,
      valid_until: null,
      updated_at: now,
    }).eq("id", verificationId).select("*").single();
    if (error) return res.status(500).json({ error: error.message });

    if (verification.candidate_id) {
      await supabase.from("sn_candidates").update({
        is_verified: true,
        verification_valid_until: null,
        verification_priority: 1,
      }).eq("id", verification.candidate_id);
    }

    return res.json({ message: "Candidate fully verified", data });
  } catch (error) {
    console.error("Approve verification error:", error);
    return res.status(500).json({ error: "Could not approve candidate" });
  }
});

router.patch("/admin/requests/:verificationId/reject", async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ error: "Database is not configured" });
    const { data, error } = await supabase.from("candidate_verifications").update({
      status: "rejected",
      rejection_reason: req.body?.reason || "Verification rejected",
      updated_at: new Date().toISOString(),
    }).eq("id", req.params.verificationId).select("*").single();
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ message: "Verification rejected", data });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Could not reject verification" });
  }
});

router.get("/:verificationId", async (req, res) => {
  try {
    const details = await getVerificationWithDocuments(req.params.verificationId);
    if (!details) return res.status(404).json({ error: "Verification not found" });
    return res.json({ data: details });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || "Could not load verification" });
  }
});

export default router;
