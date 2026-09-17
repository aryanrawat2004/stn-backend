import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { supabase } from "../db";

const router = Router();

const uploadDirectory = path.join(
  process.cwd(),
  "uploads",
  "passport-verification",
);

if (!fs.existsSync(uploadDirectory)) {
  fs.mkdirSync(uploadDirectory, {
    recursive: true,
  });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDirectory);
  },

  filename: (_req, file, cb) => {
    const extension = path.extname(file.originalname);

    const uniqueName =
      `${Date.now()}-${crypto.randomUUID()}${extension}`;

    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,

  limits: {
    fileSize: 10 * 1024 * 1024,
  },

  fileFilter: (_req, file, cb) => {
    const allowedMimeTypes = [
      "application/pdf",
      "image/jpeg",
      "image/png",
    ];

    if (!allowedMimeTypes.includes(file.mimetype)) {
      return cb(
        new Error("Only PDF, JPG and PNG documents are allowed"),
      );
    }

    cb(null, true);
  },
});


/* =========================================================
   CREATE VERIFICATION
========================================================= */

router.post("/", async (req, res) => {
  try {
    if (!supabase) {
      return res.status(503).json({
        error: "Database is not configured",
      });
    }

    const db = supabase;

    const {
      candidateId,
      fullName,
      phone,
      currentRole,
      experience,
      location,
    } = req.body;

    const id = crypto.randomUUID();

    const { data, error } = await db
      .from("candidate_verifications")
      .insert({
        id,
        candidate_id: candidateId || null,
        status: "draft",
        payment_status: "pending",
        amount: 999,
        submitted_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select("*")
      .single();

    if (error) {
      console.error("Create verification Supabase error:", error);

      return res.status(500).json({
        error: "Could not create verification request",
        details: error.message,
      });
    }

    return res.status(201).json({
      message: "Verification request created",

      data: {
        ...data,
        fullName,
        phone,
        currentRole,
        experience,
        location,
      },
    });
  } catch (error) {
    console.error("Create verification error:", error);

    return res.status(500).json({
      error: "Could not create verification request",
    });
  }
});


/* =========================================================
   UPLOAD DOCUMENT
========================================================= */

router.post(
  "/:verificationId/documents",
  upload.single("document"),
  async (req, res) => {
    try {
      if (!supabase) {
        return res.status(503).json({
          error: "Database is not configured",
        });
      }

      const db = supabase;

      const { verificationId } = req.params;
      const documentType = req.body.documentType;

      if (!req.file) {
        return res.status(400).json({
          error: "Document file is required",
        });
      }

      if (!documentType) {
        fs.unlinkSync(req.file.path);

        return res.status(400).json({
          error: "Document type is required",
        });
      }

      const { data: verification, error: verificationError } =
        await db
          .from("candidate_verifications")
          .select("id")
          .eq("id", verificationId)
          .maybeSingle();

      if (verificationError) {
        fs.unlinkSync(req.file.path);

        return res.status(500).json({
          error: verificationError.message,
        });
      }

      if (!verification) {
        fs.unlinkSync(req.file.path);

        return res.status(404).json({
          error: "Verification request not found",
        });
      }

      const documentId = crypto.randomUUID();

      const fileUrl =
        `/uploads/passport-verification/${req.file.filename}`;

      const { data, error } = await db
        .from("candidate_verification_documents")
        .insert({
          id: documentId,
          verification_id: verificationId,
          document_type: documentType,
          file_url: fileUrl,
          status: "pending",
          created_at: new Date().toISOString(),
        })
        .select("*")
        .single();

      if (error) {
        console.error("Document DB insert error:", error);

        return res.status(500).json({
          error: "Could not save uploaded document",
          details: error.message,
        });
      }

      return res.status(201).json({
        message: "Document uploaded",
        data,
      });
    } catch (error) {
      console.error(
        "Upload verification document error:",
        error,
      );

      return res.status(500).json({
        error: "Could not upload verification document",
      });
    }
  },
);


/* =========================================================
   SUBMIT FOR REVIEW
========================================================= */

router.patch(
  "/:verificationId/submit",
  async (req, res) => {
    try {
      if (!supabase) {
        return res.status(503).json({
          error: "Database is not configured",
        });
      }

      const db = supabase;

      const { verificationId } = req.params;

      const requiredDocuments = [
        "resume",
        "government_id",
        "education",
      ];

      const { data: documents, error: documentsError } =
        await db
          .from("candidate_verification_documents")
          .select("document_type")
          .eq("verification_id", verificationId);

      if (documentsError) {
        return res.status(500).json({
          error: documentsError.message,
        });
      }

      const uploadedTypes =
        (documents || []).map(
          (row: { document_type: string }) =>
            row.document_type,
        );

      const missing = requiredDocuments.filter(
        (type) => !uploadedTypes.includes(type),
      );

      if (missing.length) {
        return res.status(400).json({
          error: "Required documents are missing",
          missing,
        });
      }

      const { data, error } = await db
        .from("candidate_verifications")
        .update({
          status: "under_review",
          submitted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", verificationId)
        .select("*")
        .maybeSingle();

      if (error) {
        return res.status(500).json({
          error: error.message,
        });
      }

      if (!data) {
        return res.status(404).json({
          error: "Verification not found",
        });
      }

      return res.json({
        message: "Verification submitted for review",
        data,
      });
    } catch (error) {
      console.error("Submit verification error:", error);

      return res.status(500).json({
        error: "Could not submit verification",
      });
    }
  },
);


/* =========================================================
   ADMIN LIST
   IMPORTANT: keep admin routes BEFORE /:verificationId
========================================================= */

router.get(
  "/admin/requests",
  async (_req, res) => {
    try {
      if (!supabase) {
        return res.status(503).json({
          error: "Database is not configured",
        });
      }

      const db = supabase;

      const { data: verifications, error } =
        await db
          .from("candidate_verifications")
          .select("*")
          .order("created_at", {
            ascending: false,
          });

      if (error) {
        return res.status(500).json({
          error: error.message,
        });
      }

      const { data: documents } = await db
        .from("candidate_verification_documents")
        .select("verification_id");

      const countMap = new Map<string, number>();

      (documents || []).forEach(
        (document: { verification_id: string }) => {
          const current =
            countMap.get(document.verification_id) || 0;

          countMap.set(
            document.verification_id,
            current + 1,
          );
        },
      );

      const result = (verifications || []).map(
        (verification: any) => ({
          ...verification,

          document_count:
            countMap.get(verification.id) || 0,
        }),
      );

      return res.json({
        data: result,
      });
    } catch (error) {
      console.error(error);

      return res.status(500).json({
        error: "Could not load verification requests",
      });
    }
  },
);


/* =========================================================
   ADMIN DETAIL
========================================================= */

router.get(
  "/admin/requests/:verificationId",
  async (req, res) => {
    try {
      if (!supabase) {
        return res.status(503).json({
          error: "Database is not configured",
        });
      }

      const db = supabase;

      const { verificationId } = req.params;

      const {
        data: verification,
        error: verificationError,
      } = await db
        .from("candidate_verifications")
        .select("*")
        .eq("id", verificationId)
        .maybeSingle();

      if (verificationError) {
        return res.status(500).json({
          error: verificationError.message,
        });
      }

      if (!verification) {
        return res.status(404).json({
          error: "Verification not found",
        });
      }

      const {
        data: documents,
        error: documentsError,
      } = await db
        .from("candidate_verification_documents")
        .select("*")
        .eq("verification_id", verificationId)
        .order("created_at", {
          ascending: true,
        });

      if (documentsError) {
        return res.status(500).json({
          error: documentsError.message,
        });
      }

      return res.json({
        data: {
          verification,
          documents: documents || [],
        },
      });
    } catch (error) {
      console.error(error);

      return res.status(500).json({
        error: "Could not load verification request",
      });
    }
  },
);


/* =========================================================
   ADMIN APPROVE
========================================================= */

router.patch(
  "/admin/requests/:verificationId/approve",
  async (req, res) => {
    try {
      if (!supabase) {
        return res.status(503).json({
          error: "Database is not configured",
        });
      }

      const db = supabase;

      const { verificationId } = req.params;

      const {
        data: verification,
        error: verificationError,
      } = await db
        .from("candidate_verifications")
        .select("*")
        .eq("id", verificationId)
        .maybeSingle();

      if (verificationError) {
        return res.status(500).json({
          error: verificationError.message,
        });
      }

      if (!verification) {
        return res.status(404).json({
          error: "Verification not found",
        });
      }

      const verifiedAt = new Date();

      const validUntil = new Date();

      validUntil.setMonth(
        validUntil.getMonth() + 3,
      );

      const {
        data: updatedVerification,
        error: updateError,
      } = await db
        .from("candidate_verifications")
        .update({
          status: "verified",

          verified_at:
            verifiedAt.toISOString(),

          valid_until:
            validUntil.toISOString(),

          updated_at:
            new Date().toISOString(),
        })
        .eq("id", verificationId)
        .select("*")
        .single();

      if (updateError) {
        return res.status(500).json({
          error: updateError.message,
        });
      }

      /*
        Candidate record update.

        Your existing main candidate table is:
        sn_candidates

        This assumes you have added these columns:
        is_verified
        verification_valid_until
        verification_priority
      */

      if (verification.candidate_id) {
        const {
          error: candidateUpdateError,
        } = await db
          .from("sn_candidates")
          .update({
            is_verified: true,

            verification_valid_until:
              validUntil.toISOString(),

            verification_priority: 1,
          })
          .eq(
            "id",
            verification.candidate_id,
          );

        if (candidateUpdateError) {
          console.error(
            "Candidate verification status update failed:",
            candidateUpdateError,
          );

          return res.status(500).json({
            error:
              "Verification was approved but candidate profile could not be updated",

            details:
              candidateUpdateError.message,
          });
        }
      }

      return res.json({
        message:
          "Candidate verified successfully",

        data: updatedVerification,
      });
    } catch (error) {
      console.error(
        "Approve verification error:",
        error,
      );

      return res.status(500).json({
        error:
          "Could not approve candidate",
      });
    }
  },
);


/* =========================================================
   ADMIN REJECT
========================================================= */

router.patch(
  "/admin/requests/:verificationId/reject",
  async (req, res) => {
    try {
      if (!supabase) {
        return res.status(503).json({
          error: "Database is not configured",
        });
      }

      const db = supabase;

      const { verificationId } = req.params;

      const { reason } = req.body;

      const { data, error } = await db
        .from("candidate_verifications")
        .update({
          status: "rejected",

          rejection_reason:
            reason ||
            "Documents could not be verified",

          updated_at:
            new Date().toISOString(),
        })
        .eq("id", verificationId)
        .select("*")
        .maybeSingle();

      if (error) {
        return res.status(500).json({
          error: error.message,
        });
      }

      if (!data) {
        return res.status(404).json({
          error: "Verification not found",
        });
      }

      return res.json({
        message: "Verification rejected",
        data,
      });
    } catch (error) {
      console.error(error);

      return res.status(500).json({
        error: "Could not reject verification",
      });
    }
  },
);


/* =========================================================
   GET SINGLE VERIFICATION
   Keep this AFTER admin routes.
========================================================= */

router.get(
  "/:verificationId",
  async (req, res) => {
    try {
      if (!supabase) {
        return res.status(503).json({
          error: "Database is not configured",
        });
      }

      const db = supabase;

      const { verificationId } = req.params;

      const {
        data: verification,
        error: verificationError,
      } = await db
        .from("candidate_verifications")
        .select("*")
        .eq("id", verificationId)
        .maybeSingle();

      if (verificationError) {
        return res.status(500).json({
          error: verificationError.message,
        });
      }

      if (!verification) {
        return res.status(404).json({
          error: "Verification not found",
        });
      }

      const {
        data: documents,
        error: documentsError,
      } = await db
        .from("candidate_verification_documents")
        .select("*")
        .eq("verification_id", verificationId)
        .order("created_at", {
          ascending: true,
        });

      if (documentsError) {
        return res.status(500).json({
          error: documentsError.message,
        });
      }

      return res.json({
        data: {
          verification,
          documents: documents || [],
        },
      });
    } catch (error) {
      console.error(error);

      return res.status(500).json({
        error: "Could not load verification",
      });
    }
  },
);

export default router;