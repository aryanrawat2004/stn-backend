import { Router, Request, Response } from "express";

const router = Router();

let mockJobs = [
  {
    id: "JOB-101",
    role: "Solar Design Engineer",
    company: "GreenRay Enterprises",
    location: "Jaipur, Rajasthan",
    type: "Full Time",
    salary: "₹6 - 9 LPA",
    postedDate: "2026-09-06",
    applications: 34,
    status: "Active",
    featured: true,
  },
  {
    id: "JOB-102",
    role: "Project Manager — Solar EPC",
    company: "HelioGrid Renewables",
    location: "Hyderabad, Telangana",
    type: "Full Time",
    salary: "₹12 - 18 LPA",
    postedDate: "2026-09-05",
    applications: 28,
    status: "Active",
    featured: true,
  },
  {
    id: "JOB-103",
    role: "BESS Electrical Engineer",
    company: "Ampere Storage Labs",
    location: "Bengaluru, Karnataka",
    type: "Full Time",
    salary: "₹8 - 12 LPA",
    postedDate: "2026-09-07",
    applications: 21,
    status: "Pending",
  },
  {
    id: "JOB-104",
    role: "Solar O&M Site Engineer",
    company: "Orbital Solar Systems",
    location: "Ahmedabad, Gujarat",
    type: "Full Time",
    salary: "₹5 - 7.5 LPA",
    postedDate: "2026-09-04",
    applications: 17,
    status: "Active",
  },
];

// GET /api/admin/jobs
router.get("/", (req: Request, res: Response) => {
  res.json({ data: mockJobs });
});

// PATCH /api/admin/jobs/:id/status
router.patch("/:id/status", (req: Request, res: Response) => {
  const { id } = req.params;
  const { status } = req.body;
  const jobIndex = mockJobs.findIndex((job) => job.id === id);

  if (jobIndex === -1) {
    return res.status(404).json({ error: "Job not found" });
  }

  if (status) {
    mockJobs[jobIndex].status = status;
  }

  res.json({ data: mockJobs[jobIndex] });
});

export default router;
