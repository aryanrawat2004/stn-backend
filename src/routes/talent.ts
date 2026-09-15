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

function scoreRecord(item: SharePointTalentItem, search: string) {
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

router.get("/status", (_req, res) => {
  res.json({ data: sharePointTalentConfig });
});

router.get("/folders", async (req, res, next) => {
  try {
    const force = String(req.query.refresh || "") === "1";
    const folders = await listSharePointTalentFolders(force);
    res.json({ data: folders, meta: { total: folders.length, source: "sharepoint" } });
  } catch (error) {
    next(error);
  }
});

router.get("/sharepoint", async (req, res, next) => {
  try {
    const search = normalise(req.query.search);
    const folder = String(req.query.folder || "").trim();
    const experience = (normalise(req.query.experience) || "all") as ExperienceFilter;
    const workType = (normalise(req.query.workType) || "all") as WorkTypeFilter;
    const location = normalise(req.query.location) || "all";
    const sort = (normalise(req.query.sort) || "match") as SortMode;
    const limit = Math.max(0, Math.min(1000, Number(req.query.limit || 0) || 0));
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

        return {
          item,
          score: scoreRecord(item, search),
          bucket: experienceBucket(item),
          inferredWorkType: inferWorkType(item),
          haystack,
        };
      })
      .filter(({ item, bucket, inferredWorkType, haystack }) => {
        const terms = search.split(/\s+/).filter(Boolean);
        const matchesSearch = !terms.length || terms.every((term) => haystack.includes(term));
        const matchesExperience = experience === "all" || bucket === experience;
        const matchesWorkType = workType === "all" || inferredWorkType === workType;
        const matchesLocation = location === "all" || normalise(item.location) === location;
        return matchesSearch && matchesExperience && matchesWorkType && matchesLocation;
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
    const data = selected.map(({ item, score, inferredWorkType, bucket }) => ({
      ...item,
      matchScore: score,
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
        filters: { search, experience, workType, location, sort, limit },
        source: "sharepoint",
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
