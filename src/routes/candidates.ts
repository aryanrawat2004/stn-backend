import { Router, Request, Response } from "express";

const router = Router();

let mockCandidates = [
  {
    id: "CAN-201",
    name: "Priya Sharma",
    email: "priya.sharma@example.com",
    phone: "+91 98765 43210",
    role: "Solar Design Engineer",
    location: "Ahmedabad, Gujarat",
    experience: "6 years",
    verified: true,
    joinedDate: "2026-08-14",
    skills: ["PVsyst", "AutoCAD", "HelioScope"],
    profileCompletion: 96,
    resumeStrength: 91,
    talentPassportScore: 88,
    accountStatus: "Active",
    emailVerified: true,
    phoneVerified: true,
    lastLogin: "2026-09-10 10:42 AM",
    lastActive: "2026-09-10 11:31 AM",
    currentSessionStartedAt: "2026-09-10 10:42 AM",
    currentSessionDuration: "49 minutes",
    totalActiveTime: "18h 36m",
    deviceType: "Desktop",
    deviceName: "Windows PC",
    browser: "Microsoft Edge 152",
    operatingSystem: "Windows 11",
    ipAddress: "103.XX.XX.42",
    totalLogins: 27,
    applicationsCount: 12,
    savedJobsCount: 8,
    profileViews: 34,
    loginHistory: [
      {
        id: "LOGIN-1",
        loginTime: "10 Sep 2026, 10:42 AM",
        duration: "49 minutes",
        device: "Windows PC",
        browser: "Microsoft Edge 152",
        operatingSystem: "Windows 11",
        ipAddress: "103.XX.XX.42",
      },
      {
        id: "LOGIN-2",
        loginTime: "09 Sep 2026, 7:15 PM",
        logoutTime: "09 Sep 2026, 8:02 PM",
        duration: "47 minutes",
        device: "Android Phone",
        browser: "Chrome Mobile",
        operatingSystem: "Android 15",
        ipAddress: "49.XX.XX.18",
      },
    ],
  },
];

// GET /api/admin/candidates
router.get("/", (req: Request, res: Response) => {
  res.json({ data: mockCandidates });
});

// DELETE /api/admin/candidates/:id
router.delete("/:id", (req: Request, res: Response) => {
  const { id } = req.params;
  const initialLength = mockCandidates.length;
  mockCandidates = mockCandidates.filter((cand) => cand.id !== id);

  if (mockCandidates.length === initialLength) {
    return res.status(404).json({ error: "Candidate not found" });
  }

  res.json({ success: true });
});

export default router;
