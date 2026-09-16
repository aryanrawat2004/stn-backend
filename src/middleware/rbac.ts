import type { NextFunction, Request, Response } from "express";
import { AppRole, resolveAuthContext } from "./auth-context";

export type { AppRole } from "./auth-context";

export function requireRoles(...roles: AppRole[]) {
  const permitted = new Set(roles);

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = await resolveAuthContext(req);

      if (!auth?.role) {
        return res.status(401).json({
          error: "Authentication required",
        });
      }

      if (!permitted.has(auth.role)) {
        return res.status(403).json({
          error: "You do not have permission to perform this action",
          role: auth.role,
        });
      }

      res.locals.auth = auth;
      res.locals.authRole = auth.role;
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
