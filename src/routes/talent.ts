import { Router } from "express";
import {
  listSharePointTalentFolders,
  loadSharePointTalent,
  loadSharePointTalentFolder,
  sharePointTalentConfig,
} from "../services/sharepoint-talent";

const router = Router();

router.get("/status", (_req, res) => {
  res.json({ data: sharePointTalentConfig });
});

router.get("/folders", async (req, res, next) => {
  try {
    const force = String(req.query.refresh || "") === "1";
    const folders = await listSharePointTalentFolders(force);
    res.json({
      data: folders,
      meta: {
        total: folders.length,
        source: "sharepoint",
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get("/sharepoint", async (req, res, next) => {
  try {
    const search = String(req.query.search || "").trim().toLowerCase();
    const folder = String(req.query.folder || "").trim();
    const force = String(req.query.refresh || "") === "1";

    // Folder-specific loading is much faster for large CV libraries because it
    // avoids recursively scanning every position folder on every page load.
    const records = folder
      ? await loadSharePointTalentFolder(folder, force)
      : await loadSharePointTalent(force);

    const filtered = records.filter((item) => {
      const matchesSearch =
        !search ||
        item.name.toLowerCase().includes(search) ||
        item.role.toLowerCase().includes(search) ||
        item.folderName.toLowerCase().includes(search) ||
        item.skills.some((skill) => skill.toLowerCase().includes(search));
      return matchesSearch;
    });

    const folders = Array.from(new Set(records.map((item) => item.folderName))).sort();
    res.json({
      data: filtered,
      meta: {
        total: filtered.length,
        allTotal: records.length,
        folders,
        selectedFolder: folder || null,
        source: "sharepoint",
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
