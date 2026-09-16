import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import swaggerUi from "swagger-ui-express";

import employersRouter from "./routes/employers";
import candidatesRouter from "./routes/candidates";
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
import { requireWriteRoles } from "./middleware/rbac";

import { swaggerSpec } from "./swagger";
import { databaseMode, databaseConfig, supabase } from "./db";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const isDevelopment = process.env.NODE_ENV !== "production";
const adminWriteGuard = requireWriteRoles("admin");

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "2mb" }));

app.get("/api-docs.json", (_req, res) => {
  res.json(swaggerSpec);
});

app.use(
  "/api-docs",
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, {
    customSiteTitle: "SolarNaukri API Documentation",
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
      filter: true,
      tryItOutEnabled: true,
    },
  }),
);

// Public authentication APIs.
app.use("/api/auth/linkedin", linkedinAuthRouter);

// Public/read-only APIs.
app.use("/api/talent", talentRouter);
app.use("/api/admin/dashboard", dashboardRouter);
app.use("/api/admin/analytics", analyticsRouter);

// Job reads remain public, while the jobs router itself protects every write
// for recruiter / campus ambassador / admin roles.
app.use("/api/admin/jobs", jobsRouter);

// Admin management reads stay available to the existing dashboard. Any
// mutation (POST/PUT/PATCH/DELETE) requires an authenticated admin role.
app.use("/api/admin/candidates", adminWriteGuard, candidatesRouter);
app.use("/api/admin/job-seekers", adminWriteGuard, candidatesRouter);
app.use("/api/admin/employers", adminWriteGuard, employersRouter);
app.use("/api/admin/recruiters", adminWriteGuard, employersRouter);
app.use("/api/admin/companies", adminWriteGuard, companiesRouter);
app.use("/api/admin/categories", adminWriteGuard, categoriesRouter);
app.use("/api/admin/ambassadors", adminWriteGuard, ambassadorsRouter);
app.use("/api/admin/applications", adminWriteGuard, applicationsRouter);
app.use("/api/admin/activities", adminWriteGuard, activitiesRouter);
app.use("/api/admin/verification", adminWriteGuard, verificationRouter);
app.use("/api/admin/settings", adminWriteGuard, settingsRouter);

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "SolarNaukri Backend",
    database: databaseMode,
    databaseConfig,
    timestamp: new Date().toISOString(),
  });
});

app.get("/health/db", async (_req, res) => {
  if (!supabase) {
    return res.status(503).json({
      status: "error",
      database: databaseMode,
      databaseConfig,
      error: "Supabase client is not configured",
    });
  }

  const { data, error } = await supabase
    .from("sn_companies")
    .select("id")
    .limit(1);

  if (error) {
    console.error("Supabase database health check failed:", error);
    return res.status(500).json({
      status: "error",
      database: databaseMode,
      databaseConfig,
      supabase: {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      },
    });
  }

  return res.json({
    status: "ok",
    database: databaseMode,
    databaseConfig,
    table: "sn_companies",
    reachable: true,
    sampleRows: data?.length ?? 0,
  });
});

app.use((_req, res) => {
  res.status(404).json({ error: "Route not found" });
});

app.use((error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("Unhandled API error:", error);

  const payload: Record<string, unknown> = {
    error: "Internal server error",
  };

  if (isDevelopment) {
    payload.details = {
      code: error?.code ?? null,
      message: error?.message ?? String(error),
      details: error?.details ?? null,
      hint: error?.hint ?? null,
    };
  }

  res.status(500).json(payload);
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`🗄️ Database mode: ${databaseMode}`);
  console.log(`🔑 Database key type: ${databaseConfig.keyType}`);
  console.log(`📚 Swagger Docs: http://localhost:${PORT}/api-docs`);
  console.log(`📄 OpenAPI JSON: http://localhost:${PORT}/api-docs.json`);
  console.log(`🩺 DB diagnostics: http://localhost:${PORT}/health/db`);
  console.log(`🔗 LinkedIn auth: http://localhost:${PORT}/api/auth/linkedin/start?role=candidate`);
  console.log(`📁 SharePoint talent: http://localhost:${PORT}/api/talent/sharepoint`);
});
