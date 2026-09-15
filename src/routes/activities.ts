import { Router, Request, Response } from "express";

const router = Router();

let mockActivities = [
  {
    id: "ACT-1",
    type: "employer",
    title: "New employer registered",
    description: "SunPeak Energy submitted company verification documents",
    time: "12 min ago",
  },
  {
    id: "ACT-2",
    type: "job",
    title: "Job posted awaiting approval",
    description: "BESS Electrical Engineer from Ampere Storage Labs",
    time: "28 min ago",
  },
  {
    id: "ACT-3",
    type: "candidate",
    title: "Candidate skill verified",
    description: "Priya Sharma uploaded PVsyst certification",
    time: "46 min ago",
  },
  {
    id: "ACT-4",
    type: "application",
    title: "High application volume",
    description: "Solar Design Engineer reached 34 total applicants",
    time: "2 hours ago",
  },
];

// GET /api/admin/activities
router.get("/", (req: Request, res: Response) => {
  res.json({ data: mockActivities });
});

export default router;
