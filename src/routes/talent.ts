import { Router } from "express";
import { supabase } from "../db";
import {
  listSharePointTalentFolders,
  loadSharePointTalent,
  loadSharePointTalentFolder,
  sharePointTalentConfig,
  type SharePointTalentItem,
} from "../services/sharepoint-talent";
import {
  fetchAiCandidates,
  getAiCandidatePdfUrl,
  isSolarCandidate,
  getResumeScreenerConfig,
} from "../services/resume-screener";

const router = Router();

type ExperienceFilter = "all" | "fresher" | "1-3" | "3-5" | "5-8" | "8+";
type WorkTypeFilter = "all" | "on-site" | "hybrid" | "remote";
type SortMode = "match" | "experience" | "name";

export type UnifiedTalentItem = SharePointTalentItem & {
  resume_text?: string;
  sourceType?: "solarnaukri" | "sharepoint" | "resume_ai";
  verified?: boolean;
  talentPassportScore?: number;
  noticePeriod?: string;
  expectedSalary?: string;
  immediateJoiner?: boolean;
};

function normalise(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

async function resolveCandidateResumeUrl(row: any): Promise<string> {
  const path = String(row.resumePath || row.resumeUrl || "").trim();
  if (!path) return "";
  if (path.startsWith("http://") || path.startsWith("https://")) return path;

  if (!supabase) return "";

  const storagePath = path.startsWith("storage://candidate-resumes/")
    ? path.slice("storage://candidate-resumes/".length)
    : path;

  try {
    const { data, error } = await supabase.storage
      .from("candidate-resumes")
      .createSignedUrl(storagePath, 60 * 60);

    if (error) {
      console.warn("Could not sign candidate resume URL:", error.message);
      return "";
    }
    return data.signedUrl;
  } catch (err: any) {
    console.warn("Signed URL exception:", err.message);
    return "";
  }
}

async function loadSolarNaukriCandidates(): Promise<UnifiedTalentItem[]> {
  if (!supabase) return [];

  try {
    const { data, error } = await supabase
      .from("sn_candidates")
      .select("*")
      .order("createdAt", { ascending: false });

    if (error) {
      console.warn("Failed to load SolarNaukri candidate records:", error.message);
      return [];
    }

    const rows = (data || []).filter((row: any) => String(row.accountStatus || "Active").toLowerCase() !== "suspended");

    return Promise.all(
      rows.map(async (row: any) => ({
        id: `sn-${row.id}`,
        name: String(row.name || "Solar Candidate"),
        role: String(row.role || "Solar Candidate"),
        domain: "Solar",
        location: String(row.location || "India"),
        experience: String(row.experience || "Not specified"),
        skills: Array.isArray(row.skills) ? row.skills.map(String) : [],
        resumeUrl: await resolveCandidateResumeUrl(row),
        fileName: String(row.resumeName || `${row.name || "Candidate"}_CV.pdf`),
        folderName: "Solar Portal Signups",
        source: "sharepoint" as const,
        resume_text: `${row.role || ""} ${row.about || ""} ${(row.skills || []).join(" ")}`,
        sourceType: "solarnaukri" as const,
        verified: Boolean(row.is_verified || row.verified),
        talentPassportScore: Number(row.talentPassportScore || (row.is_verified ? 100 : 0)),
        noticePeriod: String(row.noticePeriod || row.resumeData?.noticePeriod || ""),
        expectedSalary: String(row.expectedSalary || row.resumeData?.expectedSalary || ""),
        immediateJoiner: /immediate|0\s*day|join\s*now/i.test(String(row.noticePeriod || row.resumeData?.noticePeriod || "")),
      })),
    );
  } catch (err: any) {
    console.warn("Exception loading SolarNaukri candidates:", err.message);
    return [];
  }
}

async function loadAiResumes(searchTerm?: string, experience?: ExperienceFilter): Promise<UnifiedTalentItem[]> {
  try {
    let minExp: number | undefined;
    let maxExp: number | undefined;

    if (experience === "fresher") {
      minExp = 0;
      maxExp = 1;
    } else if (experience === "1-3") {
      minExp = 1;
      maxExp = 3;
    } else if (experience === "3-5") {
      minExp = 3;
      maxExp = 5;
    } else if (experience === "5-8") {
      minExp = 5;
      maxExp = 8;
    } else if (experience === "8+") {
      minExp = 8;
    }

    const { candidates } = await fetchAiCandidates({
      searchTerm: searchTerm || undefined,
      minExp,
      maxExp,
      limit: 100,
    });

    return candidates.map((c) => ({
      id: `ai-${c.candidate_id}`,
      name: c.name || "Solar Candidate",
      role: c.current_role && c.current_role !== "Candidate Profile" ? c.current_role : "Solar Candidate",
      domain: "Solar",
      location: c.location && c.location !== "N/A" ? c.location : "India",
      experience: c.years_experience ? `${c.years_experience} years` : "Not specified",
      skills: Array.isArray(c.skills) && c.skills.length ? c.skills : ["Solar"],
      resumeUrl: getAiCandidatePdfUrl(c.candidate_id),
      fileName: `${(c.name || "Candidate").replace(/[^a-zA-Z0-9_-]/g, "_")}_CV.pdf`,
      folderName: "Solar",
      source: "sharepoint" as const,
      resume_text: c.resume_text,
      sourceType: "resume_ai" as const,
    }));
  } catch (err: any) {
    console.warn("Exception loading AI resumes:", err.message);
    return [];
  }
}

function extractYears(value?: string | null) {
  const text = normalise(value);
  if (!text || text === "not specified") return null;
  if (/fresher|freshers|entry level|entry-level|0\s*(?:year|yr)/i.test(text)) return 0;

  const range = text.match(/(\d+(?:\.\d+)?)\s*(?:-|to)\s*(\d+(?:\.\d+)?)/i);
  if (range) return Number(range[1]);

  const single = text.match(/(\d+(?:\.\d+)?)\s*\+?\s*(?:years?|yrs?)/i);
  if (single) return Number(single[1]);

  return null;
}

function inferExperience(item: UnifiedTalentItem) {
  const explicit = extractYears(item.experience);
  if (explicit !== null) return explicit;
  return extractYears(`${item.name} ${item.fileName}`);
}

function experienceBucket(item: UnifiedTalentItem): ExperienceFilter | "unknown" {
  const years = inferExperience(item);
  if (years === null) return "unknown";
  if (years < 1) return "fresher";
  if (years < 3) return "1-3";
  if (years < 5) return "3-5";
  if (years < 8) return "5-8";
  return "8+";
}

function inferWorkType(item: UnifiedTalentItem): Exclude<WorkTypeFilter, "all"> | "unknown" {
  const text = [
    item.name,
    item.role,
    item.domain,
    item.location,
    item.fileName,
    item.folderName,
    item.resume_text || "",
    ...item.skills,
  ]
    .join(" ")
    .toLowerCase();

  if (/\bremote\b|work from home|wfh/.test(text)) return "remote";
  if (/\bhybrid\b/.test(text)) return "hybrid";
  if (/on[- ]?site|onsite|site based|site-based/.test(text)) return "on-site";
  return "unknown";
}

function tokenize(value: string) {
  const stop = new Set([
    "solar",
    "and",
    "the",
    "for",
    "with",
    "engineer",
    "executive",
    "manager",
    "candidate",
    "cv",
    "resume",
    "senior",
    "junior",
  ]);

  return normalise(value)
    .split(/[^a-z0-9+#.-]+/)
    .map((term) => term.trim())
    .filter((term) => term.length > 1 && !stop.has(term));
}

function scoreSearch(item: UnifiedTalentItem, search: string) {
  if (!search) return 0;
  const terms = search.split(/\s+/).filter(Boolean);
  let score = 0;

  for (const term of terms) {
    if (normalise(item.name).includes(term)) score += 6;
    if (normalise(item.role).includes(term)) score += 5;
    if (item.skills.some((skill) => normalise(skill).includes(term))) score += 5;
    if (normalise(item.experience).includes(term)) score += 4;
    if (normalise(item.location).includes(term)) score += 4;
    if (normalise(item.fileName).includes(term)) score += 3;
    if (normalise(item.resume_text).includes(term)) score += 5;
    if (normalise(item.folderName).includes(term)) score += 2;
  }

  return score;
}

function roleMatchScore(item: UnifiedTalentItem, jobRole: string) {
  if (!jobRole) return { score: 0, reasons: [] as string[] };

  const role = normalise(jobRole);
  const terms = tokenize(jobRole);
  const roleText = normalise(item.role);
  const nameText = normalise(item.name);
  const fileText = normalise(item.fileName);
  const folderText = normalise(item.folderName);
  const resumeText = normalise(item.resume_text);
  const skillText = item.skills.map(normalise).join(" ");
  const haystack = [roleText, nameText, fileText, folderText, skillText, resumeText, normalise(item.domain)].join(" ");

  let score = 0;
  const reasons: string[] = [];

  if (role && (roleText.includes(role) || fileText.includes(role) || nameText.includes(role) || resumeText.includes(role))) {
    score += 45;
    reasons.push("Exact or near-exact role wording found");
  }

  const matchedTerms = terms.filter((term) => haystack.includes(term));
  if (terms.length) {
    const coverage = matchedTerms.length / terms.length;
    score += Math.round(coverage * 35);
    if (matchedTerms.length) reasons.push(`${matchedTerms.length}/${terms.length} role keywords matched`);
  }

  const solarSignals = [
    "solar",
    "pv",
    "epc",
    "bess",
    "scada",
    "rooftop",
    "electrical",
    "sales",
    "operation",
    "technician",
    "design",
    "pvsyst",
    "autocad",
  ];
  const roleSignals = solarSignals.filter((term) => role.includes(term));
  const matchingSignals = roleSignals.filter((term) => haystack.includes(term));
  if (roleSignals.length) {
    score += Math.round((matchingSignals.length / roleSignals.length) * 20);
    if (matchingSignals.length) reasons.push(`Solar domain signals: ${matchingSignals.join(", ")}`);
  }

  return { score: Math.min(100, score), reasons };
}

function skillsMatchScore(item: UnifiedTalentItem, requestedSkills: string) {
  if (!requestedSkills.trim()) return { score: 0, matchedSkills: [] as string[], reasons: [] as string[] };

  const parsed = requestedSkills
    .split(/[,;\n/]+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 1);

  if (!parsed.length) return { score: 0, matchedSkills: [] as string[], reasons: [] as string[] };

  const haystack = [
    item.role,
    item.name,
    item.fileName,
    item.resume_text || "",
    ...item.skills,
  ]
    .join(" ")
    .toLowerCase();

  const matched = parsed.filter((skill) => haystack.includes(skill));

  if (!matched.length) return { score: 0, matchedSkills: [] as string[], reasons: [] as string[] };

  const ratio = matched.length / parsed.length;
  const score = Math.round(ratio * 25);
  const reasons = [`Skills & tools matched (${matched.length}/${parsed.length}): ${matched.slice(0, 4).join(", ")}`];

  return { score, matchedSkills: matched, reasons };
}

function experienceFitScore(item: UnifiedTalentItem, requested: ExperienceFilter) {
  if (requested === "all") return { score: 0, reason: "" };
  const bucket = experienceBucket(item);
  if (bucket === requested) return { score: 15, reason: "Experience range matches" };
  if (bucket === "unknown") return { score: 0, reason: "" };
  return { score: 2, reason: "" };
}

function workTypeFitScore(item: UnifiedTalentItem, requested: WorkTypeFilter) {
  if (requested === "all") return { score: 0, reason: "" };
  const inferred = inferWorkType(item);
  if (inferred === requested) return { score: 8, reason: "Work preference matches" };
  return { score: 0, reason: "" };
}

function locationFitScore(item: UnifiedTalentItem, requested: string) {
  if (!requested || requested === "all") return { score: 0, reason: "" };
  const candidateLocation = normalise(item.location);
  if (candidateLocation === requested || candidateLocation.includes(requested) || requested.includes(candidateLocation)) {
    return { score: 12, reason: "Location matches" };
  }
  return { score: 0, reason: "" };
}

router.get("/status", (_req, res) => {
  const screener = getResumeScreenerConfig();
  res.json({
    data: {
      ...sharePointTalentConfig,
      resumeScreener: {
        configured: screener.enabled,
        url: screener.url,
      },
    },
  });
});

router.get("/folders", async (req, res) => {
  try {
    const verifiedOnly = String(req.query.verified || "") === "1";
    const noticePeriod = normalise(req.query.noticePeriod) || "all";
    const expectedSalary = normalise(req.query.expectedSalary) || "all";
    const immediateJoinerOnly = String(req.query.immediateJoiner || "") === "1";
    const force = String(req.query.refresh || "") === "1";
    const folders = await listSharePointTalentFolders(force);
    res.json({ data: folders, meta: { total: folders.length, source: "sharepoint" } });
  } catch (error: any) {
    console.error("Failed to load SharePoint folders:", error);
    res.status(502).json({
      error: error?.message || "Failed to load SharePoint folders",
      details: error?.message,
      data: [],
      meta: { total: 0, source: "sharepoint" },
    });
  }
});

router.get("/pdf/:candidateId", async (req, res) => {
  try {
    const { candidateId } = req.params;
    const cleanId = candidateId.replace(/^ai-/, "");
    const aiUrl = getAiCandidatePdfUrl(cleanId);
    const config = getResumeScreenerConfig();

    const pdfRes = await fetch(aiUrl, {
      headers: {
        "X-API-Key": config.apiKey,
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (!pdfRes.ok) {
      return res.status(pdfRes.status).json({ error: "Failed to fetch candidate PDF" });
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="candidate-${cleanId}.pdf"`);
    const arrayBuffer = await pdfRes.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));
  } catch (err: any) {
    res.status(502).json({ error: "Could not stream candidate PDF", details: err.message });
  }
});

router.get("/sharepoint", async (req, res) => {
  try {
    const search = normalise(req.query.search);
    const jobRole = String(req.query.jobRole || "").trim();
    const skills = String(req.query.skills || "").trim();
    const folder = String(req.query.folder || "").trim();
    const experience = (normalise(req.query.experience) || "all") as ExperienceFilter;
    const workType = (normalise(req.query.workType) || "all") as WorkTypeFilter;
    const location = normalise(req.query.location) || "all";
    const sort = (normalise(req.query.sort) || "match") as SortMode;
    const top = String(req.query.top || "") === "1";
    const requestedLimit = Number(req.query.limit || 0) || 0;
    const limit = top ? 10 : Math.max(0, Math.min(1000, requestedLimit));
    const force = String(req.query.refresh || "") === "1";

    // 1. SharePoint resumes (Solar folder)
    const sharePointRecords = folder
      ? await loadSharePointTalentFolder(folder, force)
      : await loadSharePointTalent(force);

    // 2. SolarNaukri registered candidates (entered on this site)
    const solarNaukriRecords = await loadSolarNaukriCandidates();

    // 3. AI Resume Screener candidates (filtered strictly for Solar domain)
    const aiRecords = await loadAiResumes(search || jobRole || skills, experience);

    // Unified candidate pool with SolarNaukri signups prioritized
    const seenNames = new Set<string>();
    const rawUnified: UnifiedTalentItem[] = [];

    for (const item of [...solarNaukriRecords, ...sharePointRecords, ...aiRecords]) {
      const key = normalise(item.name);
      if (key && seenNames.has(key)) continue;
      if (key) seenNames.add(key);
      rawUnified.push(item);
    }

    // STRICT SOLAR DOMAIN REQUIREMENT: Only keep resumes with verified solar relevance
    const records = rawUnified.filter((item) =>
      isSolarCandidate({
        name: item.name,
        role: item.role,
        domain: item.domain,
        skills: item.skills,
        resume_text: item.resume_text,
        fileName: item.fileName,
        folderName: item.folderName,
        source: item.sourceType === "solarnaukri" ? "solarnaukri" : undefined,
      }),
    );

    const ranked = records
      .map((item) => {
        const haystack = [
          item.name,
          item.role,
          item.domain,
          item.location,
          item.experience,
          item.fileName,
          item.folderName,
          item.resume_text || "",
          ...item.skills,
        ]
          .join(" ")
          .toLowerCase();

        const roleMatch = roleMatchScore(item, jobRole);
        const skillsFit = skillsMatchScore(item, skills);
        const expFit = experienceFitScore(item, experience);
        const workFit = workTypeFitScore(item, workType);
        const locationFit = locationFitScore(item, location);
        const keywordScore = scoreSearch(item, search);
        const reasons = [
          ...roleMatch.reasons,
          ...skillsFit.reasons,
          expFit.reason,
          workFit.reason,
          locationFit.reason,
        ].filter(Boolean);

        const hasCriteria = Boolean(jobRole || skills);
        const weightedScore = Math.min(
          100,
          roleMatch.score + skillsFit.score + expFit.score + workFit.score + locationFit.score + Math.min(10, keywordScore),
        );

        const verifiedBoost = item.verified ? 6 : 0;
        const sourceBoost = item.sourceType === "solarnaukri" ? 2 : 0;
        const finalScore = Math.min(100, (hasCriteria ? weightedScore : keywordScore) + verifiedBoost + sourceBoost);

        return {
          item,
          score: finalScore,
          matchPercent: hasCriteria ? finalScore : Math.min(100, finalScore * 5),
          matchBreakdown: {
            role: Math.min(100, Math.round((roleMatch.score / 100) * 100)),
            skills: skills ? Math.min(100, Math.round((skillsFit.score / 25) * 100)) : 0,
            experience: experience === "all" ? 0 : Math.min(100, Math.round((expFit.score / 15) * 100)),
            workMode: workType === "all" ? 0 : Math.min(100, Math.round((workFit.score / 8) * 100)),
            location: location === "all" ? 0 : Math.min(100, Math.round((locationFit.score / 12) * 100)),
            verifiedTalent: item.verified ? 100 : 0,
          },
          reasons: item.verified ? ["Talent Passport verified", ...reasons] : reasons,
          bucket: experienceBucket(item),
          inferredWorkType: inferWorkType(item),
          haystack,
        };
      })
      .filter(({ bucket, inferredWorkType, haystack, score }) => {
        const terms = search.split(/\s+/).filter(Boolean);
        const matchesSearch = !terms.length || terms.every((term) => haystack.includes(term));
        const matchesExperience = experience === "all" || bucket === experience;
        const matchesWorkType = workType === "all" || inferredWorkType === workType;
        const matchesLocation = location === "all" || haystack.includes(location);
        const matchesRole = (!jobRole && !skills) || score > 0;
        const matchesVerified = !verifiedOnly || Boolean(item.verified);
        const matchesNotice = noticePeriod === "all" || normalise(item.noticePeriod).includes(noticePeriod);
        const matchesSalary = expectedSalary === "all" || normalise(item.expectedSalary).includes(expectedSalary);
        const matchesImmediate = !immediateJoinerOnly || Boolean(item.immediateJoiner);
        return matchesSearch && matchesExperience && matchesWorkType && matchesLocation && matchesRole && matchesVerified && matchesNotice && matchesSalary && matchesImmediate;
      });

    ranked.sort((a, b) => {
      if (sort === "name") return a.item.name.localeCompare(b.item.name);
      if (sort === "experience") {
        return (inferExperience(b.item) ?? -1) - (inferExperience(a.item) ?? -1) ||
          a.item.name.localeCompare(b.item.name);
      }
      if (Boolean(a.item.verified) !== Boolean(b.item.verified)) return a.item.verified ? -1 : 1;
      return b.score - a.score || a.item.name.localeCompare(b.item.name);
    });

    const total = ranked.length;
    const selected = limit ? ranked.slice(0, limit) : ranked;
    const data = selected.map(({ item, score, matchPercent, matchBreakdown, reasons, inferredWorkType, bucket }) => ({
      ...item,
      matchScore: score,
      matchPercent,
      matchBreakdown,
      matchReasons: reasons,
      inferredWorkType,
      experienceBucket: bucket,
    }));

    const folders = Array.from(new Set(records.map((item) => item.folderName))).sort();
    const locations = Array.from(new Set(records.map((item) => item.location).filter(Boolean))).sort();

    res.json({
      data,
      meta: {
        total,
        allTotal: records.length,
        folders,
        locations,
        selectedFolder: folder || null,
        filters: { search, jobRole, skills, experience, workType, location, verifiedOnly, noticePeriod, expectedSalary, immediateJoinerOnly, sort, limit, top },
        source: "resume_screener+sharepoint+solarnaukri",
      },
    });
  } catch (error: any) {
    console.error("Failed to load talent records:", error);
    res.status(502).json({
      error: error?.message || "Failed to load talent records",
      details: error?.message,
      data: [],
      meta: { total: 0, allTotal: 0, folders: [], locations: [], source: "resume_screener+sharepoint+solarnaukri" },
    });
  }
});

export default router;
