import { Router } from "express";
import multer from "multer";
import crypto from "crypto";
import path from "path";
import { supabase } from "../db";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];
    if (!allowed.includes(file.mimetype)) return cb(new Error("Only PDF, DOC and DOCX resumes are allowed"));
    cb(null, true);
  },
});

function config() {
  return {
    tenantId: (process.env.SHAREPOINT_TENANT_ID || process.env.MS_TENANT_ID || "").trim(),
    clientId: (process.env.SHAREPOINT_CLIENT_ID || process.env.MS_CLIENT_ID || "").trim(),
    clientSecret: (process.env.SHAREPOINT_CLIENT_SECRET || process.env.MS_CLIENT_SECRET || "").trim(),
    siteHost: (process.env.SHAREPOINT_HOST || "mabicons.sharepoint.com").trim(),
    sitePath: (process.env.SHAREPOINT_SITE_PATH || "/sites/Mabicons/recruitment").trim(),
    driveName: (process.env.SHAREPOINT_DRIVE_NAME || "Documents").trim(),
    rootFolder: (process.env.SHAREPOINT_TALENT_FOLDER || "CV Database/Master CV/position wise/Solar").trim(),
  };
}

async function getToken() {
  const c = config();
  if (!c.tenantId || !c.clientId || !c.clientSecret) throw new Error("SharePoint credentials are not configured");
  const response = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(c.tenantId)}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: c.clientId,
      client_secret: c.clientSecret,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
  });
  const payload: any = await response.json();
  if (!response.ok || !payload.access_token) throw new Error(payload.error_description || "Could not authenticate with Microsoft Graph");
  return payload.access_token as string;
}

async function graphJson<T>(token: string, url: string): Promise<T> {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const payload: any = await response.json();
  if (!response.ok) throw new Error(payload?.error?.message || `Microsoft Graph request failed (${response.status})`);
  return payload as T;
}

async function uploadResumeToSharePoint(file: Express.Multer.File, verification: any) {
  const c = config();
  const token = await getToken();
  const site = await graphJson<{ id: string }>(token, `https://graph.microsoft.com/v1.0/sites/${c.siteHost}:${c.sitePath}`);
  const drives = await graphJson<{ value?: Array<{ id: string; name: string }> }>(token, `https://graph.microsoft.com/v1.0/sites/${encodeURIComponent(site.id)}/drives?$select=id,name`);
  const drive = drives.value?.find((item) => item.name.toLowerCase() === c.driveName.toLowerCase());
  if (!drive) throw new Error(`SharePoint document library '${c.driveName}' was not found`);

  const safeName = String(verification.full_name || "candidate")
    .replace(/[^a-zA-Z0-9 _-]/g, "")
    .trim()
    .replace(/\s+/g, "_") || "candidate";
  const ext = path.extname(file.originalname).toLowerCase() || ".pdf";
  const finalName = `${safeName}_${Date.now()}${ext}`;
  const encodedPath = `${c.rootFolder}/${finalName}`.split("/").filter(Boolean).map(encodeURIComponent).join("/");
  const response = await fetch(`https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(drive.id)}/root:/${encodedPath}:/content`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": file.mimetype || "application/octet-stream",
    },
    body: file.buffer,
  });
  const result: any = await response.json();
  if (!response.ok) throw new Error(result?.error?.message || `SharePoint upload failed (${response.status})`);
  return { id: result.id as string, webUrl: result.webUrl as string, name: result.name as string };
}

router.post("/:verificationId/resume", upload.single("resume"), async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ error: "Database is not configured" });
    if (!req.file) return res.status(400).json({ error: "Resume file is required" });

    const { data: verification, error: verificationError } = await supabase
      .from("candidate_verifications")
      .select("*")
      .eq("id", req.params.verificationId)
      .maybeSingle();
    if (verificationError || !verification) return res.status(verificationError ? 500 : 404).json({ error: verificationError?.message || "Verification not found" });

    const sharepoint = await uploadResumeToSharePoint(req.file, verification);

    const { data: document, error: documentError } = await supabase
      .from("candidate_verification_documents")
      .insert({
        id: crypto.randomUUID(),
        verification_id: verification.id,
        document_type: "resume",
        file_url: sharepoint.webUrl,
        status: "pending",
        created_at: new Date().toISOString(),
      })
      .select("*")
      .single();
    if (documentError) return res.status(500).json({ error: documentError.message });

    if (verification.candidate_id) {
      await supabase
        .from("sn_candidates")
        .update({
          resumeUrl: sharepoint.webUrl,
          resumeName: sharepoint.name,
          updatedAt: new Date().toISOString(),
        })
        .eq("id", verification.candidate_id);
    }

    return res.status(201).json({
      message: "Resume saved to verification database and SharePoint talent pool",
      data: { document, sharepoint },
    });
  } catch (error: any) {
    console.error("Talent Passport SharePoint resume upload error:", error);
    return res.status(500).json({ error: error?.message || "Could not save resume to SharePoint" });
  }
});

export default router;
