export type Entity = Record<string, any> & { id: string };

export const store = {
  jobs: [
    { id: "JOB-101", role: "Solar Design Engineer", company: "GreenRay Enterprises", location: "Jaipur, Rajasthan", type: "Full Time", salary: "₹6 - 9 LPA", postedDate: "2026-09-06", applications: 34, status: "Active", featured: true },
    { id: "JOB-102", role: "Project Manager — Solar EPC", company: "HelioGrid Renewables", location: "Hyderabad, Telangana", type: "Full Time", salary: "₹12 - 18 LPA", postedDate: "2026-09-05", applications: 28, status: "Active", featured: true },
    { id: "JOB-103", role: "BESS Electrical Engineer", company: "Ampere Storage Labs", location: "Bengaluru, Karnataka", type: "Full Time", salary: "₹8 - 12 LPA", postedDate: "2026-09-07", applications: 21, status: "Pending", featured: false },
  ] as Entity[],
  candidates: [
    { id: "CAN-201", name: "Priya Sharma", email: "priya.sharma@example.com", phone: "+91 98765 43210", role: "Solar Design Engineer", location: "Ahmedabad, Gujarat", experience: "6 years", verified: true, joinedDate: "2026-08-14", skills: ["PVsyst", "AutoCAD", "HelioScope"], profileCompletion: 96, resumeStrength: 91, talentPassportScore: 88, accountStatus: "Active", emailVerified: true, phoneVerified: true, lastLogin: "2026-09-10 10:42 AM", lastActive: "2026-09-10 11:31 AM", currentSessionStartedAt: "2026-09-10 10:42 AM", currentSessionDuration: "49 minutes", totalActiveTime: "18h 36m", deviceType: "Desktop", deviceName: "Windows PC", browser: "Microsoft Edge 152", operatingSystem: "Windows 11", ipAddress: "103.XX.XX.42", totalLogins: 27, applicationsCount: 12, savedJobsCount: 8, profileViews: 34, loginHistory: [] },
  ] as Entity[],
  employers: [
    { id: "EMP-301", companyName: "GreenRay Enterprises", contactPerson: "Rajesh Kumar", email: "rajesh@greenray.in", location: "Jaipur, Rajasthan", jobsPosted: 12, verified: true, joinedDate: "2026-06-10", status: "Approved" },
    { id: "EMP-302", companyName: "HelioGrid Renewables", contactPerson: "Sonal Gupta", email: "hr@heliogrid.com", location: "Hyderabad, Telangana", jobsPosted: 8, verified: true, joinedDate: "2026-07-01", status: "Approved" },
    { id: "EMP-303", companyName: "Ampere Storage Labs", contactPerson: "Vikram Shah", email: "careers@amperestorage.com", location: "Bengaluru, Karnataka", jobsPosted: 4, verified: false, joinedDate: "2026-09-01", status: "Pending Verification" },
  ] as Entity[],
  companies: [
    { id: "COM-001", companyName: "GreenRay Enterprises", industry: "Solar EPC", location: "Jaipur, Rajasthan", website: "https://greenray.in", contactPerson: "Rajesh Kumar", email: "rajesh@greenray.in", phone: "+91 98765 43210", jobsPosted: 12, verified: true, status: "Active", joinedDate: "2026-06-10" },
    { id: "COM-002", companyName: "HelioGrid Renewables", industry: "Renewable Energy", location: "Hyderabad, Telangana", website: "https://heliogrid.com", contactPerson: "Sonal Gupta", email: "hr@heliogrid.com", phone: "+91 98111 22334", jobsPosted: 8, verified: true, status: "Active", joinedDate: "2026-07-01" },
  ] as Entity[],
  categories: [
    { id: "CAT-001", name: "Rooftop Solar", slug: "rooftop-solar", description: "Residential and commercial rooftop solar opportunities.", jobsCount: 26, status: "Active" },
    { id: "CAT-002", name: "Utility Scale Solar", slug: "utility-scale-solar", description: "Large-scale solar plant and project opportunities.", jobsCount: 34, status: "Active" },
    { id: "CAT-003", name: "Manufacturing", slug: "manufacturing", description: "Solar module, cell and equipment manufacturing jobs.", jobsCount: 18, status: "Active" },
  ] as Entity[],
  ambassadors: [
    { id: "AMB-401", name: "Riya Sharma", email: "riya@example.com", phone: "+91 98765 11111", college: "JECRC University", city: "Jaipur", course: "B.Tech", year: "3rd Year", referralCount: 26, joinedCandidates: 18, status: "Active", joinedDate: "2026-08-20" },
    { id: "AMB-402", name: "Karan Mehta", email: "karan@example.com", phone: "+91 98222 33333", college: "Manipal University Jaipur", city: "Jaipur", course: "MBA", year: "2nd Year", referralCount: 14, joinedCandidates: 9, status: "Active", joinedDate: "2026-08-27" },
  ] as Entity[],
  activities: [
    { id: "ACT-1", type: "employer", title: "New employer registered", description: "SunPeak Energy submitted company verification documents", time: "12 min ago" },
    { id: "ACT-2", type: "job", title: "Job posted awaiting approval", description: "BESS Electrical Engineer from Ampere Storage Labs", time: "28 min ago" },
    { id: "ACT-3", type: "candidate", title: "Candidate skill verified", description: "Priya Sharma uploaded PVsyst certification", time: "46 min ago" },
  ] as Entity[],
  applications: [
    { id: "APP-001", jobId: "JOB-101", candidateId: "CAN-201", status: "Applied", appliedAt: "2026-09-10T10:00:00.000Z", updatedAt: "2026-09-10T10:00:00.000Z", notes: "" },
  ] as Entity[],
};

export function nextId(prefix: string, items: Entity[]) {
  const max = items.reduce((m, item) => Math.max(m, Number(item.id.replace(/\D/g, "")) || 0), 0);
  return `${prefix}-${String(max + 1).padStart(3, "0")}`;
}
