import { Router } from "express";
import crypto from "crypto";
import { supabase } from "../db";
import { resolveAuthContext } from "../middleware/auth-context";

const router = Router();

const VERHOEFF_D = [
  [0,1,2,3,4,5,6,7,8,9],[1,2,3,4,0,6,7,8,9,5],[2,3,4,0,1,7,8,9,5,6],
  [3,4,0,1,2,8,9,5,6,7],[4,0,1,2,3,9,5,6,7,8],[5,9,8,7,6,0,4,3,2,1],
  [6,5,9,8,7,1,0,4,3,2],[7,6,5,9,8,2,1,0,4,3],[8,7,6,5,9,3,2,1,0,4],
  [9,8,7,6,5,4,3,2,1,0],
];
const VERHOEFF_P = [
  [0,1,2,3,4,5,6,7,8,9],[1,5,7,6,2,8,3,0,9,4],[5,8,0,3,7,9,6,1,4,2],
  [8,9,1,6,0,4,3,5,2,7],[9,4,5,3,1,2,6,8,7,0],[4,2,8,6,5,7,3,9,0,1],
  [2,7,9,3,8,0,6,4,1,5],[7,0,4,6,9,1,3,2,5,8],
];

function isValidAadhaar(value: string) {
  if (!/^\d{12}$/.test(value) || /^0|^1/.test(value)) return false;
  let c = 0;
  const reversed = value.split("").reverse().map(Number);
  for (let i = 0; i < reversed.length; i += 1) c = VERHOEFF_D[c][VERHOEFF_P[i % 8][reversed[i]]];
  return c === 0;
}


function extractProviderAddress(provider: Record<string, any>) {
  const direct = provider.address || provider.full_address || provider.address_text || provider.formatted_address;
  if (typeof direct === "string" && direct.trim()) return direct.trim();

  const source = provider.address_data || provider.address_details || provider.kyc?.address || provider.data?.address;
  if (source && typeof source === "object") {
    const parts = [
      source.house,
      source.building,
      source.street,
      source.landmark,
      source.locality,
      source.vtc,
      source.city,
      source.district,
      source.state,
      source.pincode || source.postal_code,
    ]
      .map((value) => String(value || "").trim())
      .filter(Boolean);
    if (parts.length) return [...new Set(parts)].join(", ");
  }

  return null;
}

function stableUuid(input: string) {
  const bytes = crypto.createHash("sha256").update(input.toLowerCase()).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

function providerConfig() {
  const baseUrl = process.env.AADHAAR_PROVIDER_BASE_URL?.trim().replace(/\/$/, "");
  const apiKey = process.env.AADHAAR_PROVIDER_API_KEY?.trim();
  const flowSecret = process.env.AADHAAR_FLOW_SECRET?.trim();
  return {
    baseUrl,
    apiKey,
    flowSecret,
    sendOtpPath: process.env.AADHAAR_PROVIDER_SEND_OTP_PATH?.trim() || "/aadhaar/generate-otp",
    verifyOtpPath: process.env.AADHAAR_PROVIDER_VERIFY_OTP_PATH?.trim() || "/aadhaar/verify-otp",
    authHeader: process.env.AADHAAR_PROVIDER_AUTH_HEADER?.trim() || "Authorization",
    authPrefix: process.env.AADHAAR_PROVIDER_AUTH_PREFIX ?? "Bearer ",
    providerName: process.env.AADHAAR_PROVIDER_NAME?.trim() || "configured-provider",
  };
}

async function callProvider(pathname: string, body: Record<string, unknown>) {
  const cfg = providerConfig();
  if (!cfg.baseUrl || !cfg.apiKey) throw new Error("Aadhaar provider is not configured");
  const headers: Record<string,string> = { "Content-Type": "application/json" };
  headers[cfg.authHeader] = `${cfg.authPrefix}${cfg.apiKey}`;
  const response = await fetch(`${cfg.baseUrl}${pathname.startsWith("/") ? pathname : `/${pathname}`}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({})) as Record<string, any>;
  if (!response.ok) throw new Error(String(payload.message || payload.error || `Provider request failed (${response.status})`));
  return payload;
}

function signFlow(payload: Record<string, unknown>) {
  const secret = providerConfig().flowSecret;
  if (!secret) throw new Error("AADHAAR_FLOW_SECRET is not configured");
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(encoded).digest("base64url");
  return `${encoded}.${sig}`;
}

function verifyFlow(token: string) {
  const secret = providerConfig().flowSecret;
  if (!secret) throw new Error("AADHAAR_FLOW_SECRET is not configured");
  const [encoded, sig] = token.split(".");
  if (!encoded || !sig) throw new Error("Invalid verification state");
  const expected = crypto.createHmac("sha256", secret).update(encoded).digest("base64url");
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) throw new Error("Invalid verification state");
  const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Record<string, any>;
  if (!payload.exp || Date.now() > Number(payload.exp)) throw new Error("Verification session expired");
  return payload;
}

async function addEvent(verificationId: string, eventType: string, providerStatus: string, providerReference?: string) {
  if (!supabase) return;
  try {
    await supabase.from("verification_events").insert({
      verification_id: verificationId,
      event_type: eventType,
      provider_status: providerStatus,
      provider_reference: providerReference || null,
      created_at: new Date().toISOString(),
    });
  } catch {
    // Audit table is optional in older database deployments.
  }
}

router.post("/otp/start", async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ error: "Database is not configured" });
    const auth = await resolveAuthContext(req);
    if (!auth?.email && !auth?.uid) return res.status(401).json({ error: "Authentication is required" });

    const aadhaarNumber = String(req.body?.aadhaarNumber || "").replace(/\D/g, "");
    const consent = req.body?.consent === true;
    if (!consent) return res.status(400).json({ error: "Explicit Aadhaar verification consent is required" });
    if (!isValidAadhaar(aadhaarNumber)) return res.status(400).json({ error: "Enter a valid 12-digit Aadhaar number" });

    const cfg = providerConfig();
    if (!cfg.baseUrl || !cfg.apiKey || !cfg.flowSecret) {
      return res.status(503).json({
        error: "Live Aadhaar OTP verification is not configured",
        code: "AADHAAR_PROVIDER_NOT_CONFIGURED",
      });
    }

    const provider = await callProvider(cfg.sendOtpPath, {
      aadhaar_number: aadhaarNumber,
      consent: true,
      purpose: "SolarNaukri identity verification",
    });

    const providerReference = String(
      provider.transaction_id || provider.reference_id || provider.request_id || provider.txn_id || "",
    );
    if (!providerReference) throw new Error("Provider did not return a transaction reference");

    const userKey = auth.uid || auth.email || "";
    const userId = stableUuid(userKey);
    const now = new Date().toISOString();
    const { data, error } = await supabase.from("identity_verifications").insert({
      user_id: userId,
      verification_type: "aadhaar_otp",
      provider: cfg.providerName,
      status: "otp_sent",
      aadhaar_last4: aadhaarNumber.slice(-4),
      provider_reference_id: providerReference,
      consent_given: true,
      consent_at: now,
      created_at: now,
      updated_at: now,
    }).select("*").single();
    if (error) return res.status(500).json({ error: "Could not create Aadhaar verification", details: error.message });

    await addEvent(data.id, "otp_requested", "otp_sent", providerReference);

    const state = signFlow({
      verificationId: data.id,
      providerReference,
      subject: userKey,
      exp: Date.now() + 10 * 60 * 1000,
    });

    return res.json({
      verificationId: data.id,
      state,
      maskedAadhaar: `XXXX XXXX ${aadhaarNumber.slice(-4)}`,
      message: String(provider.message || "OTP sent to Aadhaar-linked mobile number"),
    });
  } catch (error: any) {
    console.error("Aadhaar OTP start failed:", error?.message || error);
    return res.status(500).json({ error: error?.message || "Could not start Aadhaar verification" });
  }
});

router.post("/otp/verify", async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ error: "Database is not configured" });
    const auth = await resolveAuthContext(req);
    if (!auth?.email && !auth?.uid) return res.status(401).json({ error: "Authentication is required" });

    const otp = String(req.body?.otp || "").replace(/\D/g, "");
    const state = String(req.body?.state || "");
    if (!/^\d{4,8}$/.test(otp)) return res.status(400).json({ error: "Enter a valid OTP" });

    const flow = verifyFlow(state);
    const subject = auth.uid || auth.email || "";
    if (flow.subject !== subject) return res.status(403).json({ error: "Verification session does not belong to this account" });

    const cfg = providerConfig();
    const provider = await callProvider(cfg.verifyOtpPath, {
      transaction_id: flow.providerReference,
      otp,
    });

    const statusText = String(provider.status || provider.result || "").toLowerCase();
    const verified =
      provider.verified === true ||
      provider.authenticated === true ||
      provider.success === true ||
      ["verified", "success", "authenticated", "approved"].includes(statusText);

    const now = new Date().toISOString();
    if (!verified) {
      await supabase.from("identity_verifications").update({
        status: "failed",
        updated_at: now,
      }).eq("id", flow.verificationId);
      await addEvent(flow.verificationId, "verification_failed", statusText || "failed", flow.providerReference);
      return res.status(400).json({ error: String(provider.message || "Aadhaar OTP verification failed") });
    }

    const update: Record<string, unknown> = {
      status: "verified",
      verified_at: now,
      updated_at: now,
      verification_reference: String(provider.verification_reference || provider.kyc_reference || flow.providerReference),
    };
    if (provider.name || provider.full_name) update.full_name = String(provider.name || provider.full_name);
    if (provider.dob) update.dob = provider.dob;
    if (provider.gender) update.gender = String(provider.gender);

    const { data, error } = await supabase.from("identity_verifications")
      .update(update).eq("id", flow.verificationId).select("*").single();
    if (error) return res.status(500).json({ error: "Could not save verification result", details: error.message });

    await addEvent(flow.verificationId, "verification_completed", "verified", flow.providerReference);

    // Optional profile mirror. Ignore missing table/columns so Aadhaar verification itself still succeeds.
    try {
      await supabase.from("profiles").update({
        identity_verified: true,
        identity_verification_type: "aadhaar_otp",
        identity_verified_at: now,
      }).eq("id", stableUuid(subject));
    } catch {}

    return res.json({
      verified: true,
      status: data.status,
      verifiedAt: data.verified_at,
      aadhaarLast4: data.aadhaar_last4,
      fullName: data.full_name || null,
      address: extractProviderAddress(provider),
    });
  } catch (error: any) {
    console.error("Aadhaar OTP verification failed:", error?.message || error);
    return res.status(500).json({ error: error?.message || "Could not verify Aadhaar OTP" });
  }
});

router.get("/status", async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ error: "Database is not configured" });
    const auth = await resolveAuthContext(req);
    if (!auth?.email && !auth?.uid) return res.status(401).json({ error: "Authentication is required" });
    const userId = stableUuid(auth.uid || auth.email || "");
    const { data, error } = await supabase.from("identity_verifications")
      .select("id,verification_type,provider,status,aadhaar_last4,verified_at,created_at,updated_at")
      .eq("user_id", userId)
      .eq("verification_type", "aadhaar_otp")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ data: data || null });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || "Could not load Aadhaar verification status" });
  }
});

export default router;
