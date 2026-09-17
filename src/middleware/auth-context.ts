import type { Request } from "express";
import { supabase } from "../db";

export type AppRole = "candidate" | "Employer" | "ambassador" | "admin";

export type AuthContext = {
  provider: "supabase" | "firebase" | "development";
  uid: string | null;
  email: string | null;
  role: AppRole | null;
  name: string | null;
};

const allowedRoles = new Set<AppRole>([
  "candidate",
  "Employer",
  "ambassador",
  "admin",
]);

export function normalizeRole(value: unknown): AppRole | null {
  if (typeof value !== "string") return null;
  const role = value.trim().toLowerCase() as AppRole;
  return allowedRoles.has(role) ? role : null;
}

async function resolveSupabaseToken(token: string): Promise<AuthContext | null> {
  if (!supabase) return null;

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;

  const role = normalizeRole(
    data.user.app_metadata?.role ?? data.user.user_metadata?.role,
  );

  return {
    provider: "supabase",
    uid: data.user.id,
    email: data.user.email ?? null,
    role,
    name:
      (typeof data.user.user_metadata?.full_name === "string" && data.user.user_metadata.full_name) ||
      (typeof data.user.user_metadata?.name === "string" && data.user.user_metadata.name) ||
      null,
  };
}

async function resolveFirebaseToken(token: string): Promise<AuthContext | null> {
  const apiKey = process.env.FIREBASE_WEB_API_KEY?.trim();
  if (!apiKey) return null;

  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: token }),
    },
  );

  if (!response.ok) return null;

  const payload = (await response.json()) as {
    users?: Array<{
      localId?: string;
      email?: string;
      displayName?: string;
      customAttributes?: string;
    }>;
  };

  const user = payload.users?.[0];
  if (!user) return null;

  let role: AppRole | null = null;
  if (user.customAttributes) {
    try {
      const claims = JSON.parse(user.customAttributes) as Record<string, unknown>;
      role = normalizeRole(claims.role);
    } catch {
      role = null;
    }
  }

  return {
    provider: "firebase",
    uid: user.localId ?? null,
    email: user.email?.toLowerCase() ?? null,
    role,
    name: user.displayName ?? null,
  };
}

export async function resolveAuthContext(req: Request): Promise<AuthContext | null> {
  const authorization = req.header("authorization");

  if (authorization?.toLowerCase().startsWith("bearer ")) {
    const token = authorization.slice(7).trim();
    if (!token) return null;

    const supabaseUser = await resolveSupabaseToken(token);
    if (supabaseUser) return supabaseUser;

    const firebaseUser = await resolveFirebaseToken(token);
    if (firebaseUser) {
      const requestedRole = normalizeRole(req.header("x-solarnaukri-role"));
      return {
        ...firebaseUser,
        role: firebaseUser.role ?? requestedRole,
      };
    }

    return null;
  }

  if (process.env.NODE_ENV !== "production") {
    const authenticated = req.header("x-solarnaukri-authenticated") === "true";
    const role = normalizeRole(req.header("x-solarnaukri-role"));
    const email = req.header("x-solarnaukri-email")?.trim().toLowerCase() || null;

    if (authenticated && role) {
      return {
        provider: "development",
        uid: null,
        email,
        role,
        name: null,
      };
    }
  }

  return null;
}
