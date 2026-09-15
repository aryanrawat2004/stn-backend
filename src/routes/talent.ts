import { Router } from "express";
import { loadSharePointTalent, sharePointTalentConfig } from "../services/sharepoint-talent";

const router = Router();

router.get("/status", (_req, res) => {
  res.json({ data: sharePointTalentConfig });
});

router.get("/sharepoint", async (req, res, next) => {
  try {
    const search = String(req.query.search || "").trim().toLowerCase();
    const folder = String(req.query.folder || "").trim().toLowerCase();

    const records = await loadSharePointTalent();
    const filtered = records.filter((item) => {
      const matchesSearch =
        !search ||
        item.name.toLowerCase().includes(search) ||
        item.role.toLowerCase().includes(search) ||
        item.folderName.toLowerCase().includes(search) ||
        item.skills.some((skill) => skill.toLowerCase().includes(search));
      const matchesFolder = !folder || item.folderName.toLowerCase() === folder;
      return matchesSearch && matchesFolder;
    });

    const folders = Array.from(new Set(records.map((item) => item.folderName))).sort();
    res.json({
      data: filtered,
      meta: {
        total: filtered.length,
        allTotal: records.length,
        folders,
        source: "sharepoint",
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
