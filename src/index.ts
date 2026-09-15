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

import { swaggerSpec } from "./swagger";
import { databaseMode } from "./db";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

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

app.use("/api/admin/dashboard", dashboardRouter);
app.use("/api/admin/jobs", jobsRouter);
app.use("/api/admin/candidates", candidatesRouter);
app.use("/api/admin/job-seekers", candidatesRouter);
app.use("/api/admin/employers", employersRouter);
app.use("/api/admin/recruiters", employersRouter);
app.use("/api/admin/companies", companiesRouter);
app.use("/api/admin/categories", categoriesRouter);
app.use("/api/admin/ambassadors", ambassadorsRouter);
app.use("/api/admin/applications", applicationsRouter);
app.use("/api/admin/activities", activitiesRouter);
app.use("/api/admin/analytics", analyticsRouter);
app.use("/api/admin/verification", verificationRouter);
app.use("/api/admin/settings", settingsRouter);

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "SolarNaukri Backend",
    database: databaseMode,
    timestamp: new Date().toISOString(),
  });
});

app.use((_req, res) => {
  res.status(404).json({ error: "Route not found" });
});

app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(error);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`🗄️ Database mode: ${databaseMode}`);
  console.log(`📚 Swagger Docs: http://localhost:${PORT}/api-docs`);
  console.log(`📄 OpenAPI JSON: http://localhost:${PORT}/api-docs.json`);
});
