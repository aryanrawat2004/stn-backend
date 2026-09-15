"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const router = (0, express_1.Router)();
// Temporarily use mock data matching INITIAL_ADMIN_EMPLOYERS from frontend
let mockEmployers = [
    {
        id: "EMP-301",
        companyName: "GreenRay Enterprises",
        contactPerson: "Rajesh Kumar",
        email: "rajesh@greenray.in",
        location: "Jaipur, Rajasthan",
        jobsPosted: 12,
        verified: true,
        joinedDate: "2026-06-10",
        status: "Approved",
    },
    {
        id: "EMP-302",
        companyName: "HelioGrid Renewables",
        contactPerson: "Sonal Gupta",
        email: "hr@heliogrid.com",
        location: "Hyderabad, Telangana",
        jobsPosted: 8,
        verified: true,
        joinedDate: "2026-07-01",
        status: "Approved",
    },
    {
        id: "EMP-303",
        companyName: "Ampere Storage Labs",
        contactPerson: "Vikram Shah",
        email: "careers@amperestorage.com",
        location: "Bengaluru, Karnataka",
        jobsPosted: 4,
        verified: false,
        joinedDate: "2026-09-01",
        status: "Pending Verification",
    },
    {
        id: "EMP-304",
        companyName: "SunPeak Energy",
        contactPerson: "Meera Nair",
        email: "contact@sunpeak.in",
        location: "Kochi, Kerala",
        jobsPosted: 1,
        verified: false,
        joinedDate: "2026-09-07",
        status: "Pending Verification",
    },
];
// GET /api/admin/employers
router.get("/", (req, res) => {
    res.json({ data: mockEmployers });
});
// PATCH /api/admin/employers/:id/verify
router.patch("/:id/verify", (req, res) => {
    const { id } = req.params;
    const employerIndex = mockEmployers.findIndex((emp) => emp.id === id);
    if (employerIndex === -1) {
        return res.status(404).json({ error: "Employer not found" });
    }
    const employer = mockEmployers[employerIndex];
    const isApproved = employer.status === "Approved";
    mockEmployers[employerIndex] = {
        ...employer,
        verified: !isApproved,
        status: !isApproved ? "Approved" : "Pending Verification",
    };
    res.json({ data: mockEmployers[employerIndex] });
});
exports.default = router;
//# sourceMappingURL=employers.js.map