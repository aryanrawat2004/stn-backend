import { Router } from "express";
import {
  listSharePointTalentFolders,
  loadSharePointTalent,
  loadSharePointTalentFolder,
  sharePointTalentConfig,
  type SharePointTalentItem,
} from "../services/sharepoint-talent";

const router = Router();

type ExperienceFilter = "all" | "fresher" | "1-3" | "3-5" | "5-8" | "8+";
type WorkTypeFilter = "all" | "on-site" | "hybrid" | "remote";
type SortMode = "match" | "experience" | "name";

function normalise(value: unknown) {
  return String(value || "").trim().toLowerCase();
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

function inferExperience(item: SharePointTalentItem) {
  const explicit = extractYears(item.experience);
  if (explicit !== null) return explicit;
  return extractYears(`${item.name} ${item.fileName}`);
}

function experienceBucket(item: SharePointTalentItem): ExperienceFilter | "unknown" {
  const years = inferExperience(item);
  if (years === null) return "unknown";
  if (years < 1) return "fresher";
  if (years < 3) return "1-3";
  if (years < 5) return "3-5";
  if (years < 8) return "5-8";
  return "8+";
}

function inferWorkType(item: SharePointTalentItem): Exclude<WorkTypeFilter, "all"> | "unknown" {
  const text = [
    item.name,
    item.role,
    item.domain,
    item.location,
    item.fileName,
    item.folderName,
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

function scoreSearch(item: SharePointTalentItem, search: string) {
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
    if (normalise(item.folderName).includes(term)) score += 2;
  }

  return score;
}

function roleMatchScore(item: SharePointTalentItem, jobRole: string) {
  if (!jobRole) return { score: 0, reasons: [] as string[] };

  const role = normalise(jobRole);
  const terms = tokenize(jobRole);
  const roleText = normalise(item.role);
  const nameText = normalise(item.name);
  const fileText = normalise(item.fileName);
  const folderText = normalise(item.folderName);
  const skillText = item.skills.map(normalise).join(" ");
  const haystack = [roleText, nameText, fileText, folderText, skillText, normalise(item.domain)].join(" ");

  let score = 0;
  const reasons: string[] = [];

  if (role && (roleText.includes(role) || fileText.includes(role) || nameText.includes(role))) {
    score += 45;
    reasons.push("Exact or near-exact role wording found");
  }

  const matchedTerms = terms.filter((term) => haystack.includes(term));
  if (terms.length) {
    const coverage = matchedTerms.length / terms.length;
    score += Math.round(coverage * 35);
    if (matchedTerms.length) reasons.push(`${matchedTerms.length}/${terms.length} role keywords matched`);
  }

  const solarSignals = ["solar", "pv", "epc", "bess", "scada", "rooftop", "electrical", "sales", "operation", "technician", "design"];
  const roleSignals = solarSignals.filter((term) => role.includes(term));
  const matchingSignals = roleSignals.filter((term) => haystack.includes(term));
  if (roleSignals.length) {
    score += Math.round((matchingSignals.length / roleSignals.length) * 20);
    if (matchingSignals.length) reasons.push(`Solar domain signals: ${matchingSignals.join(", ")}`);
  }

  return { score: Math.min(100, score), reasons };
}

function experienceFitScore(item: SharePointTalentItem, requested: ExperienceFilter) {
  if (requested === "all") return { score: 0, reason: "" };
  const bucket = experienceBucket(item);
  if (bucket === requested) return { score: 15, reason: "Experience range matches" };
  if (bucket === "unknown") return { score: 0, reason: "" };
  return { score: 2, reason: "" };
}

function workTypeFitScore(item: SharePointTalentItem, requested: WorkTypeFilter) {
  if (requested === "all") return { score: 0, reason: "" };
  const inferred = inferWorkType(item);
  if (inferred === requested) return { score: 8, reason: "Work preference matches" };
  return { score: 0, reason: "" };
}

function locationFitScore(item: SharePointTalentItem, requested: string) {
  if (!requested || requested === "all") return { score: 0, reason: "" };
  const candidateLocation = normalise(item.location);
  if (candidateLocation === requested || candidateLocation.includes(requested) || requested.includes(candidateLocation)) {
    return { score: 12, reason: "Location matches" };
  }
  return { score: 0, reason: "" };
}

router.get("/status", (_req, res) => {
  res.json({ data: sharePointTalentConfig });
});

router.get("/folders", async (req, res) => {
  try {
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

router.get("/sharepoint", async (req, res, next) => {
  try {
    const search = normalise(req.query.search);
    const jobRole = String(req.query.jobRole || "").trim();
    const folder = String(req.query.folder || "").trim();
    const experience = (normalise(req.query.experience) || "all") as ExperienceFilter;
    const workType = (normalise(req.query.workType) || "all") as WorkTypeFilter;
    const location = normalise(req.query.location) || "all";
    const sort = (normalise(req.query.sort) || "match") as SortMode;
    const top = String(req.query.top || "") === "1";
    const requestedLimit = Number(req.query.limit || 0) || 0;
    const limit = top ? 10 : Math.max(0, Math.min(1000, requestedLimit));
    const force = String(req.query.refresh || "") === "1";

    const records = folder
      ? await loadSharePointTalentFolder(folder, force)
      : await loadSharePointTalent(force);

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
          ...item.skills,
        ]
          .join(" ")
          .toLowerCase();

        const roleMatch = roleMatchScore(item, jobRole);
        const expFit = experienceFitScore(item, experience);
        const workFit = workTypeFitScore(item, workType);
        const locationFit = locationFitScore(item, location);
        const keywordScore = scoreSearch(item, search);
        const reasons = [
          ...roleMatch.reasons,
          expFit.reason,
          workFit.reason,
          locationFit.reason,
        ].filter(Boolean);

        const weightedScore = Math.min(
          100,
          roleMatch.score + expFit.score + workFit.score + locationFit.score + Math.min(10, keywordScore),
        );

        return {
          item,
          score: jobRole ? weightedScore : keywordScore,
          matchPercent: jobRole ? weightedScore : Math.min(100, keywordScore * 5),
          reasons,
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
        const matchesRole = !jobRole || score > 0;
        return matchesSearch && matchesExperience && matchesWorkType && matchesLocation && matchesRole;
      });

    ranked.sort((a, b) => {
      if (sort === "name") return a.item.name.localeCompare(b.item.name);
      if (sort === "experience") {
        return (inferExperience(b.item) ?? -1) - (inferExperience(a.item) ?? -1) ||
          a.item.name.localeCompare(b.item.name);
      }
      return b.score - a.score || a.item.name.localeCompare(b.item.name);
    });

    const total = ranked.length;
    const selected = limit ? ranked.slice(0, limit) : ranked;
    const data = selected.map(({ item, score, matchPercent, reasons, inferredWorkType, bucket }) => ({
      ...item,
      matchScore: score,
      matchPercent,
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
        filters: { search, jobRole, experience, workType, location, sort, limit, top },
        source: "sharepoint",
      },
    });
  } catch (error: any) {
    console.error("Failed to load SharePoint talent:", error);
    res.status(502).json({
      error: error?.message || "Failed to load SharePoint talent records",
      details: error?.message,
      data: [],
      meta: { total: 0, allTotal: 0, folders: [], locations: [], source: "sharepoint" },
    });
  }
});

export default router;
