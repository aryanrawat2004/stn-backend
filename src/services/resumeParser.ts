type ResumeExperience = {
  role: string;
  company: string;
  duration: string;
  location: string;
  description: string;
};

type ResumeEducation = {
  degree: string;
  institution: string;
  year: string;
};

type ResumeProject = {
  title: string;
  type: string;
  capacity: string;
  role: string;
  location: string;
  skills: string[];
};

type ResumeCertification = {
  title: string;
  issuer: string;
};

export type ParsedResumeData = {
  role: string;
  location: string;
  yearsExperience: number | null;
  about: string;
  skills: string[];
  experience: ResumeExperience[];
  education: ResumeEducation[];
  projects: ResumeProject[];
  certifications: ResumeCertification[];
  preferredRole: string;
  preferredLocations: string[];
  noticePeriod: string;
  currentSalary: string;
  expectedSalary: string;
  parserVersion: string;
};

const SKILLS = [
  "PVsyst", "AutoCAD", "HelioScope", "SketchUp", "SCADA", "BESS", "Solar EPC",
  "PV Design", "String Sizing", "Cable Sizing", "SLD", "Single Line Diagram", "ETAP",
  "PVcase", "Aurora Solar", "Site Survey", "Commissioning", "O&M", "Operations & Maintenance",
  "Preventive Maintenance", "Electrical Design", "Project Management", "MS Project", "Primavera",
  "Excel", "MS Excel", "Power BI", "Python", "SQL", "GIS", "QGIS", "ArcGIS", "Procurement",
  "Quality Control", "QA/QC", "HSE", "Safety", "Inverter", "Solar Module", "Rooftop Solar",
  "Utility Scale", "Grid Integration", "Energy Storage", "EV Charging", "AutoCAD Electrical",
  "Revit", "MATLAB", "SAP", "CRM", "Business Development", "Technical Sales"
];

const ROLES = [
  "Solar Design Engineer", "Solar Electrical Engineer", "Solar Civil Engineer", "Solar Mechanical Engineer",
  "Solar Project Engineer", "Solar Project Manager", "Solar Site Engineer", "Solar Installation Engineer",
  "Solar Commissioning Engineer", "Solar O&M Engineer", "Solar O&M Manager", "Solar Maintenance Engineer",
  "Solar Technician", "Solar Field Technician", "PV Design Engineer", "PV System Engineer", "PV Layout Engineer",
  "Solar Structural Engineer", "SCADA Engineer", "BESS Engineer", "Energy Storage Engineer", "Solar EPC Engineer",
  "Solar Sales Engineer", "Solar Sales Executive", "Business Development Manager", "Renewable Energy Engineer",
  "Renewable Energy Consultant", "Project Engineer", "Project Manager", "Electrical Engineer", "Design Engineer",
  "Quality Engineer", "QA/QC Engineer", "HSE Engineer", "Procurement Engineer", "Operations Engineer"
];

const CITIES = [
  "Jaipur", "Jodhpur", "Udaipur", "Bikaner", "Kota", "Ajmer", "Delhi", "New Delhi", "Gurugram", "Gurgaon",
  "Noida", "Greater Noida", "Ahmedabad", "Surat", "Vadodara", "Rajkot", "Mumbai", "Pune", "Nagpur", "Nashik",
  "Bengaluru", "Bangalore", "Hyderabad", "Chennai", "Kolkata", "Indore", "Bhopal", "Lucknow", "Kanpur",
  "Chandigarh", "Mohali", "Dehradun", "Patna", "Raipur", "Bhubaneswar", "Ranchi", "Kochi", "Coimbatore"
];

function normalizeText(text: string) {
  return text.replace(/\r/g, "\n").replace(/[\t ]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function linesOf(text: string) {
  return normalizeText(text)
    .split("\n")
    .map((line) => line.replace(/^[-•▪●◆►]+\s*/, "").trim())
    .filter(Boolean);
}

function unique<T>(values: T[]) {
  return Array.from(new Set(values));
}

function findSkills(text: string) {
  const lower = text.toLowerCase();
  const known = SKILLS.filter((skill) => lower.includes(skill.toLowerCase()));

  const lines = linesOf(text);
  const start = lines.findIndex((line) => /^(technical\s+skills|skills|core\s+skills|key\s+skills|tools|technologies)$/i.test(line));
  const sectionSkills: string[] = [];
  if (start >= 0) {
    for (const line of lines.slice(start + 1, start + 8)) {
      if (/^(experience|work experience|education|projects?|certifications?|summary|profile|achievements?|languages?)$/i.test(line)) break;
      const parts = line
        .split(/[,|;/•]+/)
        .map((part) => part.trim())
        .filter((part) => part.length >= 2 && part.length <= 40 && !/^(and|or)$/i.test(part));
      sectionSkills.push(...parts);
    }
  }

  return unique([...known, ...sectionSkills])
    .filter((skill) => !/@|https?:|linkedin|github/i.test(skill))
    .slice(0, 30);
}

function findRole(text: string) {
  const lower = text.toLowerCase();
  return ROLES.find((role) => lower.includes(role.toLowerCase())) || "Solar Candidate";
}

function findLocation(text: string) {
  const lower = text.toLowerCase();
  const city = CITIES.find((value) => lower.includes(value.toLowerCase()));
  return city || "India";
}

function findYearsExperience(text: string): number | null {
  const explicit = Array.from(text.matchAll(/(\d+(?:\.\d+)?)\s*\+?\s*(?:years?|yrs?)(?:\s+of)?\s+(?:experience|exp)?/gi))
    .map((match) => Number(match[1]))
    .filter((value) => Number.isFinite(value) && value >= 0 && value <= 60);
  if (explicit.length) return Math.max(...explicit);

  const ranges = Array.from(text.matchAll(/\b(20\d{2}|19\d{2})\s*(?:-|–|—|to)\s*(present|current|20\d{2}|19\d{2})\b/gi));
  if (!ranges.length) return null;
  const currentYear = new Date().getFullYear();
  let total = 0;
  for (const match of ranges.slice(0, 8)) {
    const start = Number(match[1]);
    const end = /present|current/i.test(match[2]) ? currentYear : Number(match[2]);
    if (start >= 1980 && end >= start && end - start <= 25) total += end - start;
  }
  return total > 0 ? Math.min(total, 60) : null;
}

function findAbout(lines: string[], name: string, email: string, phone: string) {
  const sectionIndex = lines.findIndex((line) => /^(professional\s+summary|summary|profile|career\s+objective|objective|about)$/i.test(line));
  const candidates = sectionIndex >= 0 ? lines.slice(sectionIndex + 1, sectionIndex + 5) : lines.slice(0, 14);
  const cleaned = candidates.filter((line) => {
    const lower = line.toLowerCase();
    if (line === name || line.includes(email) || line.includes(phone)) return false;
    if (/linkedin|github|@|\+91|www\.|http/i.test(line)) return false;
    if (ROLES.some((role) => lower === role.toLowerCase())) return false;
    if (line.length < 35) return false;
    return true;
  });
  return cleaned.slice(0, 2).join(" ").slice(0, 700);
}

function findExperience(lines: string[]): ResumeExperience[] {
  const result: ResumeExperience[] = [];
  const dateRegex = /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)?\s*\d{4}\s*(?:-|–|—|to)\s*(?:present|current|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)?\s*\d{4})\b/i;
  for (let i = 0; i < lines.length && result.length < 6; i++) {
    if (!dateRegex.test(lines[i])) continue;
    const before = lines.slice(Math.max(0, i - 3), i);
    const after = lines.slice(i + 1, i + 4);
    const role = [...before].reverse().find((line) => ROLES.some((r) => line.toLowerCase().includes(r.toLowerCase()))) || before[before.length - 1] || "";
    const company = [...before].reverse().find((line) => line !== role && line.length > 2 && line.length < 100) || "";
    const description = after.filter((line) => line.length > 25 && !dateRegex.test(line)).join(" ").slice(0, 500);
    if (role || company) {
      result.push({ role, company, duration: lines[i], location: findLocation([...before, ...after].join(" ")), description });
    }
  }
  if (!result.length) {
    const start = lines.findIndex((line) => /^(experience|work experience|professional experience|employment history)$/i.test(line));
    if (start >= 0) {
      const section = lines.slice(start + 1, start + 16);
      for (let i = 0; i < section.length && result.length < 4; i++) {
        const line = section[i];
        if (/^(education|projects?|skills|certifications?|achievements?)$/i.test(line)) break;
        const roleMatch = ROLES.find((role) => line.toLowerCase().includes(role.toLowerCase()));
        if (!roleMatch) continue;
        const company = section[i + 1] && !/^(education|projects?|skills|certifications?)$/i.test(section[i + 1]) ? section[i + 1] : "";
        const duration = section.slice(i, i + 4).find((value) => /\b(20\d{2}|19\d{2})\b/.test(value)) || "";
        const description = section.slice(i + 2, i + 6).filter((value) => value.length > 25).join(" ").slice(0, 500);
        result.push({ role: roleMatch, company, duration, location: findLocation(section.slice(i, i + 5).join(" ")), description });
      }
    }
  }
  return result;
}

function findEducation(lines: string[]): ResumeEducation[] {
  const degreeRegex = /(bachelor|master|b\.?(?:tech|e|sc|ca|com|ba)|m\.?(?:tech|e|sc|ca|ba|com)|mba|diploma|ph\.?d|12th|10th|higher secondary)/i;
  const results: ResumeEducation[] = [];
  for (let i = 0; i < lines.length && results.length < 6; i++) {
    if (!degreeRegex.test(lines[i])) continue;
    const nearby = lines.slice(Math.max(0, i - 2), i + 4);
    const institution = nearby.find((line) => line !== lines[i] && /(university|college|school|institute|academy|polytechnic)/i.test(line)) || "";
    const year = nearby.join(" ").match(/\b(19|20)\d{2}\b/)?.[0] || "";
    results.push({ degree: lines[i], institution, year });
  }
  return results;
}

function findProjects(lines: string[], skills: string[]): ResumeProject[] {
  const results: ResumeProject[] = [];
  for (let i = 0; i < lines.length && results.length < 6; i++) {
    const line = lines[i];
    if (!/(project|solar plant|rooftop|utility scale|mw\b|kw\b)/i.test(line)) continue;
    const capacity = line.match(/\b\d+(?:\.\d+)?\s*(?:MW|kW|GW|MWp|kWp)\b/i)?.[0] || "";
    if (!/project|solar|mw\b|kw\b/i.test(line)) continue;
    const context = lines.slice(i, i + 4).join(" ");
    const projectSkills = skills.filter((skill) => context.toLowerCase().includes(skill.toLowerCase())).slice(0, 6);
    results.push({
      title: line.slice(0, 160),
      type: /rooftop/i.test(context) ? "Rooftop" : /utility/i.test(context) ? "Utility Scale" : "Solar Project",
      capacity,
      role: findRole(context),
      location: findLocation(context),
      skills: projectSkills,
    });
  }
  return unique(results.map((item) => JSON.stringify(item))).map((item) => JSON.parse(item)).slice(0, 6);
}

function findCertifications(lines: string[]): ResumeCertification[] {
  const start = lines.findIndex((line) => /^(certifications?|courses?|licenses?)(?:\s*&\s*certifications?)?$/i.test(line));
  if (start < 0) return [];
  const results: ResumeCertification[] = [];
  for (const line of lines.slice(start + 1, start + 10)) {
    if (/^(experience|education|projects?|skills|achievements?|languages?)$/i.test(line)) break;
    if (line.length < 4 || line.length > 180) continue;
    const [title, issuer = ""] = line.split(/\s+[|–—-]\s+/);
    results.push({ title: title.trim(), issuer: issuer.trim() });
  }
  return results.slice(0, 8);
}

function findNoticePeriod(text: string) {
  const match = text.match(/(?:notice\s*period|joining)\s*[:\-]?\s*([^\n]{2,40})/i);
  if (match) return match[1].trim();
  if (/immediate\s+joiner|immediately\s+available/i.test(text)) return "Immediate Joiner";
  return "";
}

function findSalary(text: string, kind: "current" | "expected") {
  const pattern = kind === "current" ? /current\s+(?:ctc|salary)\s*[:\-]?\s*([^\n]{2,40})/i : /expected\s+(?:ctc|salary)\s*[:\-]?\s*([^\n]{2,40})/i;
  return text.match(pattern)?.[1]?.trim() || "";
}

export async function extractResumeText(file: Express.Multer.File): Promise<string> {
  const name = file.originalname.toLowerCase();
  if (file.mimetype === "application/pdf" || name.endsWith(".pdf")) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pdfParse = require("pdf-parse");
    const parsed = await pdfParse(file.buffer);
    return normalizeText(String(parsed?.text || ""));
  }
  if (file.mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || name.endsWith(".docx")) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mammoth = require("mammoth");
    const parsed = await mammoth.extractRawText({ buffer: file.buffer });
    return normalizeText(String(parsed?.value || ""));
  }
  // Legacy .doc files are accepted for storage, but reliable extraction requires conversion.
  return "";
}

export function parseResumeText(text: string, fallback: { name: string; email: string; phone: string }): ParsedResumeData {
  const normalized = normalizeText(text);
  const lines = linesOf(normalized);
  const skills = findSkills(normalized);
  const role = findRole(normalized);
  const location = findLocation(normalized);
  const yearsExperience = findYearsExperience(normalized);
  return {
    role,
    location,
    yearsExperience,
    about: findAbout(lines, fallback.name, fallback.email, fallback.phone),
    skills,
    experience: findExperience(lines),
    education: findEducation(lines),
    projects: findProjects(lines, skills),
    certifications: findCertifications(lines),
    preferredRole: role === "Solar Candidate" ? "" : role,
    preferredLocations: location === "India" ? [] : [location],
    noticePeriod: findNoticePeriod(normalized),
    currentSalary: findSalary(normalized, "current"),
    expectedSalary: findSalary(normalized, "expected"),
    parserVersion: "resume-parser-v2",
  };
}

export function calculateProfileScores(data: ParsedResumeData, hasResume: boolean) {
  let profile = hasResume ? 30 : 15;
  if (data.role && data.role !== "Solar Candidate") profile += 10;
  if (data.location && data.location !== "India") profile += 8;
  if (data.about) profile += 8;
  if (data.skills.length) profile += Math.min(12, data.skills.length);
  if (data.experience.length || data.yearsExperience !== null) profile += 10;
  if (data.education.length) profile += 10;
  if (data.projects.length) profile += 6;
  if (data.certifications.length) profile += 6;

  let resumeStrength = hasResume ? 25 : 0;
  if (data.about) resumeStrength += 15;
  if (data.skills.length >= 3) resumeStrength += 20;
  if (data.experience.length || data.yearsExperience !== null) resumeStrength += 20;
  if (data.education.length) resumeStrength += 10;
  if (data.projects.length) resumeStrength += 5;
  if (data.certifications.length) resumeStrength += 5;

  return { profileCompletion: Math.min(100, profile), resumeStrength: Math.min(100, resumeStrength) };
}
