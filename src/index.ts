import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import swaggerUi from "swagger-ui-express";
import path from "path";
import passportVerificationRoutes from "./routes/passportVerification";
import passportTalentRouter from "./routes/passportTalent";
import aadhaarVerificationRouter from "./routes/aadhaarVerification";

import employersRouter from "./routes/employers";
import candidatesRouter from "./routes/candidates";
import candidateSignupRouter from "./routes/candidateSignup";
import jobsRouter from "./routes/jobs";
import activitiesRouter from "./routes/activities";
import companiesRouter from "./routes/companies";
import categoriesRouter from "./routes/categories";
import ambassadorsRouter from "./routes/ambassadors";
import applicationsRouter from "./routes/applications";
import dashboardRouter from "./routes/dashboard";
import analyticsRouter from "./routes/analytics";
import verificationRouter from "./routes/verification";
import settingsRouter from "./routes/settings";
import talentRouter from "./routes/talent";
import linkedinAuthRouter from "./routes/linkedin-auth";
import meRouter from "./routes/me";
import pricingRouter from "./routes/pricing";
import paymentsRouter from "./routes/payments";
import cvUsageRouter from "./routes/cvUsage";
import { couponsAdminRouter, couponsPublicRouter } from "./routes/coupons";
import proposalsRouter from "./routes/proposals";
import { resourcesAdminRouter, resourcesPublicRouter } from "./routes/resources";
import { requireWriteRoles } from "./middleware/rbac";

import { swaggerSpec } from "./swagger";
import { databaseMode, databaseConfig, supabase } from "./db";

const app = express();
const PORT = process.env.PORT || 5000;
const isDevelopment = process.env.NODE_ENV !== "production";
const adminWriteGuard = requireWriteRoles("admin");

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "16mb" }));

app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

app.get("/api-docs.json", (_req, res) => { res.json(swaggerSpec); });
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customSiteTitle: "SolarNaukri API Documentation",
  swaggerOptions: { persistAuthorization: true, displayRequestDuration: true, filter: true, tryItOutEnabled: true },
}));

app.use("/api/auth/linkedin", linkedinAuthRouter);
app.use("/api/resources", resourcesPublicRouter);
app.use("/api/pricing", pricingRouter);
app.use("/api/payments", paymentsRouter);
app.use("/api/coupons", couponsPublicRouter);
app.use("/api/cv-usage", cvUsageRouter);
app.use("/api/candidates", candidateSignupRouter);
app.use("/api/passport-verification", passportVerificationRoutes);
app.use("/api/passport-talent", passportTalentRouter);
app.use("/api/aadhaar-verification", aadhaarVerificationRouter);
app.use("/api/jobs", jobsRouter);
app.use("/api/talent", talentRouter);
app.use("/api/me", meRouter);
app.use("/api/admin/dashboard", dashboardRouter);
app.use("/api/admin/analytics", analyticsRouter);
app.use("/api/admin/jobs", jobsRouter);
app.use("/api/admin/resources", adminWriteGuard, resourcesAdminRouter);
app.use("/api/admin/coupons", adminWriteGuard, couponsAdminRouter);
app.use("/api/admin/candidates", adminWriteGuard, candidatesRouter);
app.use("/api/admin/job-seekers", adminWriteGuard, candidatesRouter);
app.use("/api/admin/proposals", adminWriteGuard, proposalsRouter);
app.use("/api/admin/employers", adminWriteGuard, employersRouter);
app.use("/api/admin/Employers", adminWriteGuard, employersRouter);
app.use("/api/admin/companies", adminWriteGuard, companiesRouter);
app.use("/api/admin/categories", adminWriteGuard, categoriesRouter);
app.use("/api/admin/ambassadors", adminWriteGuard, ambassadorsRouter);
app.use("/api/admin/applications", adminWriteGuard, applicationsRouter);
app.use("/api/admin/activities", adminWriteGuard, activitiesRouter);
app.use("/api/admin/verification", adminWriteGuard, verificationRouter);
app.use("/api/admin/settings", adminWriteGuard, settingsRouter);

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "SolarNaukri Backend", database: databaseMode, databaseConfig, timestamp: new Date().toISOString() });
});

app.get("/health/db", async (_req, res) => {
  if (!supabase) return res.status(503).json({ status: "error", database: databaseMode, databaseConfig, error: "Supabase client is not configured" });
  const { data, error } = await supabase.from("sn_companies").select("id").limit(1);
  if (error) {
    console.error("Supabase database health check failed:", error);
    return res.status(500).json({ status: "error", database: databaseMode, databaseConfig, supabase: { code: error.code, message: error.message, details: error.details, hint: error.hint } });
  }
  return res.json({ status: "ok", database: databaseMode, databaseConfig, table: "sn_companies", reachable: true, sampleRows: data?.length ?? 0 });
});

app.get("/health/schema", async (_req, res) => {
  if (!supabase) return res.status(503).json({ status: "error", database: databaseMode, error: "Supabase client is not configured" });
  const db = supabase!;
  const requiredTables: Record<string, string> = {
    sn_jobs: 'id,role,company,location,type,status,createdAt,updatedAt',
    sn_candidates: 'id,name,email,phone,role,location,accountStatus,profileCompletion,resumeStrength,talentPassportScore,currentSalary,expectedSalary,noticePeriod,about,resumeUrl,resumeName,firebaseUid,createdAt,updatedAt',
    sn_employers: 'id,companyName,contactPerson,email,location,status,createdAt,updatedAt',
    sn_companies: 'id,companyName,industry,location,email,phone,verificationStatus,accountStatus,createdAt,updatedAt',
    sn_categories: 'id,name,slug,description,status,createdAt,updatedAt',
    sn_ambassadors: 'id,name,email,phone,college,city,status,createdAt,updatedAt',
    sn_applications: 'id,jobId,candidateId,status,appliedAt,createdAt,updatedAt',
    sn_saved_jobs: 'id,candidateId,jobId,createdAt',
    sn_activities: 'id,type,title,description,createdAt,updatedAt',
    settings: 'id,siteName,contactEmail,emailAlerts,autoApproveVerified,weeklyDigest,createdAt,updatedAt',
    sn_resources: 'id,slug,type,title,excerpt,content,category,read_time,cover_image_url,resource_url,author_name,status,featured,published_at,created_at,updated_at',
    site_visits: 'id,visitor_id,session_id,user_id,path,started_at,last_seen,active_seconds,device,referrer',
    sn_coupons: 'id,code,discount_type,discount_value,applicable_plans,min_order_amount,max_uses,used_count,active,created_at,updated_at',
  };
  const checks = await Promise.all(Object.entries(requiredTables).map(async ([table, columns]) => {
    const { error } = await db.from(table).select(columns).limit(1);
    return { table, ok: !error, error: error ? { code: error.code, message: error.message, hint: error.hint } : null };
  }));
  const { data: buckets, error: bucketError } = await db.storage.listBuckets();
  const resourcesBucket = buckets?.find((bucket) => bucket.id === "resources");
  const resumesBucket = buckets?.find((bucket) => bucket.id === "candidate-resumes");
  const storage = {
    ok: !bucketError && Boolean(resourcesBucket) && Boolean(resumesBucket),
    resourcesBucket: resourcesBucket ? { id: resourcesBucket.id, name: resourcesBucket.name, public: resourcesBucket.public } : null,
    resumesBucket: resumesBucket ? { id: resumesBucket.id, name: resumesBucket.name, public: resumesBucket.public } : null,
    error: bucketError ? bucketError.message : !resourcesBucket ? "resources bucket is missing" : !resumesBucket ? "candidate-resumes bucket is missing" : null,
  };
  const failedTables = checks.filter((check) => !check.ok);
  const ok = failedTables.length === 0 && storage.ok;
  return res.status(ok ? 200 : 500).json({ status: ok ? "ok" : "error", database: databaseMode, tables: checks, storage, summary: { checkedTables: checks.length, passedTables: checks.length - failedTables.length, failedTables: failedTables.map((check) => check.table) } });
});

app.use((_req, res) => { res.status(404).json({ error: "Route not found" }); });
app.use((error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("Unhandled API error:", error);
  const payload: Record<string, unknown> = { error: "Internal server error" };
  if (isDevelopment) payload.details = { code: error?.code ?? null, message: error?.message ?? String(error), details: error?.details ?? null, hint: error?.hint ?? null };
  res.status(500).json(payload);
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`🗄️ Database mode: ${databaseMode}`);
  console.log(`🔑 Database key type: ${databaseConfig.keyType}`);
  console.log(`📚 Swagger Docs: http://localhost:${PORT}/api-docs`);
  console.log(`📄 OpenAPI JSON: http://localhost:${PORT}/api-docs.json`);
  console.log(`🩺 DB diagnostics: http://localhost:${PORT}/health/db`);
  console.log(`🧩 Schema diagnostics: http://localhost:${PORT}/health/schema`);
  console.log(`🔗 LinkedIn auth: http://localhost:${PORT}/api/auth/linkedin/start?role=candidate`);
  console.log(`📚 Resources API: http://localhost:${PORT}/api/resources`);
  console.log(`👤 Candidate signup API: http://localhost:${PORT}/api/candidates/signup`);
  console.log(`💳 Pricing API: http://localhost:${PORT}/api/pricing`);
  console.log(`💳 Razorpay API: http://localhost:${PORT}/api/payments`);
  console.log(`🎟️ Coupon API: http://localhost:${PORT}/api/coupons`);
  console.log(`📊 CV usage API: http://localhost:${PORT}/api/cv-usage`);
  console.log(`🪪 Passport Verification API: http://localhost:${PORT}/api/passport-verification`);
  console.log(`📤 Passport Talent Sync: http://localhost:${PORT}/api/passport-talent`);
  console.log(`👤 Candidate self API: http://localhost:${PORT}/api/me/candidate`);
  console.log(`💼 Public jobs API: http://localhost:${PORT}/api/jobs`);
  console.log(`📁 SharePoint talent: http://localhost:${PORT}/api/talent/sharepoint`);
});
