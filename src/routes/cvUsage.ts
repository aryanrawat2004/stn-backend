import { Router } from "express";

const router = Router();

export type CvAccessMode = "single" | "excel_bulk";

export function calculateCvAccessUnits(mode: CvAccessMode, cvCount: number) {
  const safeCount = Math.max(0, Math.floor(cvCount));
  const unitsPerCv = mode === "excel_bulk" ? 2 : 1;

  return {
    mode,
    cvCount: safeCount,
    unitsPerCv,
    totalAccessUnits: safeCount * unitsPerCv,
  };
}

router.get("/rules", (_req, res) => {
  res.json({
    data: {
      single: {
        unitsPerCv: 1,
        description: "A single CV view or download counts as 1 CV access.",
      },
      excel_bulk: {
        unitsPerCv: 2,
        description: "Each CV included in a multiple-CV Excel download/export counts as 2 CV accesses.",
      },
    },
  });
});

router.post("/calculate", (req, res) => {
  const mode = req.body?.mode as CvAccessMode;
  const cvCount = Number(req.body?.cvCount);

  if (mode !== "single" && mode !== "excel_bulk") {
    return res.status(400).json({
      error: "mode must be either 'single' or 'excel_bulk'",
    });
  }

  if (!Number.isFinite(cvCount) || cvCount < 1) {
    return res.status(400).json({
      error: "cvCount must be a positive number",
    });
  }

  return res.json({ data: calculateCvAccessUnits(mode, cvCount) });
});

export default router;
