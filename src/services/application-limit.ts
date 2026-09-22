import { supabase } from "../db";

export const STANDARD_WEEKLY_APPLICATION_LIMIT = 4;
const WINDOW_DAYS = 7;

function asDate(value: unknown) {
  const date = new Date(String(value || ""));
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function hasActiveTalentPassport(candidate: Record<string, any>) {
  const now = new Date();

  if (candidate?.is_verified === true) {
    const validUntil = asDate(candidate?.verification_valid_until);
    if (validUntil && validUntil.getTime() > now.getTime()) return true;
  }

  if (!supabase || !candidate?.id) return false;

  const { data, error } = await supabase
    .from("candidate_verifications")
    .select("id,valid_until,status")
    .eq("candidate_id", String(candidate.id))
    .eq("status", "verified")
    .gt("valid_until", now.toISOString())
    .limit(1);

  if (error) {
    console.warn("Could not check Talent Passport application access:", error.message);
    return false;
  }

  return Boolean(data?.length);
}

export async function getCandidateApplicationAccess(candidate: Record<string, any>) {
  const unlimited = await hasActiveTalentPassport(candidate);

  if (unlimited) {
    return {
      unlimited: true,
      weeklyLimit: null as number | null,
      usedThisWeek: 0,
      remainingThisWeek: null as number | null,
      windowDays: WINDOW_DAYS,
      windowStartedAt: null as string | null,
    };
  }

  if (!supabase) {
    throw new Error("Database is not configured");
  }

  const windowStart = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { count, error } = await supabase
    .from("sn_applications")
    .select("id", { count: "exact", head: true })
    .eq("candidateId", String(candidate.id))
    .gte("appliedAt", windowStart);

  if (error) throw error;

  const usedThisWeek = Number(count || 0);
  return {
    unlimited: false,
    weeklyLimit: STANDARD_WEEKLY_APPLICATION_LIMIT,
    usedThisWeek,
    remainingThisWeek: Math.max(0, STANDARD_WEEKLY_APPLICATION_LIMIT - usedThisWeek),
    windowDays: WINDOW_DAYS,
    windowStartedAt: windowStart,
  };
}

export async function enforceCandidateApplicationLimit(candidate: Record<string, any>) {
  const access = await getCandidateApplicationAccess(candidate);
  return {
    ...access,
    allowed: access.unlimited || Number(access.remainingThisWeek || 0) > 0,
  };
}
