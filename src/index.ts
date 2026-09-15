import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import employersRouter from "./routes/employers";
import candidatesRouter from "./routes/candidates";
import jobsRouter from "./routes/jobs";
import activitiesRouter from "./routes/activities";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.use("/api/admin/employers", employersRouter);
app.use("/api/admin/candidates", candidatesRouter);
app.use("/api/admin/jobs", jobsRouter);
app.use("/api/admin/activities", activitiesRouter);

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
