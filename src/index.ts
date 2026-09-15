import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import swaggerUi from "swagger-ui-express";

import employersRouter from "./routes/employers";
import candidatesRouter from "./routes/candidates";
import jobsRouter from "./routes/jobs";
import activitiesRouter from "./routes/activities";

import { swaggerSpec } from "./swagger";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

/* ================================
   SWAGGER
================================ */

app.get("/api-docs.json", (req, res) => {
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

/* ================================
   API ROUTES
================================ */

app.use("/api/admin/employers", employersRouter);
app.use("/api/admin/candidates", candidatesRouter);
app.use("/api/admin/jobs", jobsRouter);
app.use("/api/admin/activities", activitiesRouter);

/* ================================
   HEALTH
================================ */

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "SolarNaukri Backend",
  });
});

/* ================================
   START SERVER
================================ */

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📚 Swagger Docs: http://localhost:${PORT}/api-docs`);
  console.log(`📄 OpenAPI JSON: http://localhost:${PORT}/api-docs.json`);
});