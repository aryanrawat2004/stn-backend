import type { NextFunction, Request, Response } from "express";
import { supabase } from "../db";

export type AppRole = "candidate" | "recruiter" | "ambassador" | "admin";

const allowedRoles = new Set<AppRole>([
  "candidate",
  "recruiter",
  "ambassador",
  "admin",
]);

function normalizeRole(value: unknown): AppRole | null {
  if (typeof value !== "string") return null;
  const role = value.trim().toLowerCase() as AppRole;
  return allowedRoles.has(role) ? role : null;
}

async function resolveRole(req: Request): Promise<AppRole | null> {
  const authorization = req.header("authorization");

  if (authorization?.toLowerCase().startsWith("bearer ")) {
    const token = authorization.slice(7).trim();

    if (token && supabase) {
      const { data, error } = await supabase.auth.getUser(token);

      if (!error && data.user) {
        return normalizeRole(
          data.user.app_metadata?.role ?? data.user.user_metadata?.role,
        );
      }
    }

    return null;
  }

  // The current SolarNaukri frontend still uses local demo sessions.
  // Keep this development-only compatibility path so local role flows can
  // be tested while production remains Bearer-token only.
  if (process.env.NODE_ENV !== "production") {
    const authenticated = req.header("x-solarnaukri-authenticated") === "true";
    const role = normalizeRole(req.header("x-solarnaukri-role"));
    if (authenticated && role) return role;
  }

  return null;
}

export function requireRoles(...roles: AppRole[]) {
  const permitted = new Set(roles);

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const role = await resolveRole(req);

      if (!role) {
        return res.status(401).json({
          error: "Authentication required",
        });
      }

      if (!permitted.has(role)) {
        return res.status(403).json({
          error: "You do not have permission to perform this action",
          role,
        });
      }

      res.locals.authRole = role;
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function requireWriteRoles(...roles: AppRole[]) {
  const guard = requireRoles(...roles);

  return (req: Request, res: Response, next: NextFunction) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method.toUpperCase())) {
      next();
      return;
    }

    void guard(req, res, next);
  };
}
