import dotenv from "dotenv";
dotenv.config();

export interface AiCandidate {
  candidate_id: string;
  name: string;
  skills: string[];
  years_experience: number;
  current_role: string;
  location: string;
  resume_text?: string;
  cv_path?: string;
  source_file_url?: string;
  email?: string;
  phone?: string;
  source?: string;
  sharepoint_site?: string;
  sharepoint_folder?: string;
  best_score?: number;
}

const SOLAR_KEYWORDS = [
  "solar",
  "pv",
  "photovoltaic",
  "epc",
  "bess",
  "battery energy storage",
  "pvsyst",
  "autocad",
  "helioscope",
  "rooftop",
  "ground mount",
  "inverter",
  "scada",
  "o&m",
  "operations and maintenance",
  "substation",
  "renewable",
  "clean energy",
  "green energy",
  "solar technician",
  "solar engineer",
  "solar project",
  "solar sales",
  "solar design",
];

export function getResumeScreenerConfig() {
  const url = (process.env.RESUME_SCREENER_URL || "https://resumescreener-h4h9.onrender.com").replace(/\/$/, "");
  const apiKey = (process.env.RESUME_SCREENER_API_KEY || "talentmatch_microservice_api_key_12345").trim();

  return {
    url,
    apiKey,
    enabled: Boolean(url),
  };
}

export function isSolarCandidate(candidate: {
  name?: string;
  role?: string;
  domain?: string;
  skills?: string[];
  resume_text?: string;
  fileName?: string;
  folderName?: string;
  sharepoint_folder?: string;
  source?: string;
}): boolean {
  // If the resume is from the dedicated Solar folder, it's explicitly solar
  const folder = (candidate.folderName || candidate.sharepoint_folder || "").toLowerCase();
  if (folder.includes("solar")) return true;

  // Candidates registered via the Solar portal are solar by intent
  if (candidate.source === "solarnaukri" || candidate.domain?.toLowerCase() === "solar") return true;

  const haystack = [
    candidate.name || "",
    candidate.role || "",
    candidate.fileName || "",
    candidate.resume_text || "",
    ...(candidate.skills || []),
  ]
    .join(" ")
    .toLowerCase();

  return SOLAR_KEYWORDS.some((kw) => haystack.includes(kw));
}

const AI_CACHE_TTL_MS = 5 * 60 * 1000;
const aiCandidateCache = new Map<string, { data: { candidates: AiCandidate[]; total: number }; expiresAt: number }>();

// Background warm-up ping so Render wakes up immediately upon backend start
setTimeout(() => {
  const config = getResumeScreenerConfig();
  if (config.enabled) {
    fetch(`${config.url}/health`, { signal: AbortSignal.timeout(5_000) })
      .then(() => console.log("[ResumeScreener] Background wake-up ping succeeded"))
      .catch(() => undefined);
  }
}, 1000);

export async function fetchAiCandidates(options: {
  searchTerm?: string;
  minExp?: number;
  maxExp?: number;
  limit?: number;
  offset?: number;
}): Promise<{ candidates: AiCandidate[]; total: number }> {
  const config = getResumeScreenerConfig();
  if (!config.enabled) {
    return { candidates: [], total: 0 };
  }

  const cacheKey = JSON.stringify(options);
  const cached = aiCandidateCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const params = new URLSearchParams();
  if (options.limit) params.set("limit", String(options.limit));
  if (options.offset) params.set("offset", String(options.offset));
  if (options.minExp !== undefined && options.minExp !== null) params.set("min_exp", String(options.minExp));
  if (options.maxExp !== undefined && options.maxExp !== null) params.set("max_exp", String(options.maxExp));
  if (options.searchTerm) params.set("searchTerm", options.searchTerm);

  try {
    const response = await fetch(`${config.url}/api/v1/candidates?${params.toString()}`, {
      headers: {
        "X-API-Key": config.apiKey,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(30_000), // 30s to allow Render cold start
    });

    if (!response.ok) {
      console.warn(`[ResumeScreener] /api/v1/candidates returned HTTP ${response.status}`);
      return cached?.data || { candidates: [], total: 0 };
    }

    const json = (await response.json()) as { candidates?: AiCandidate[]; total?: number };
    const rawList = Array.isArray(json.candidates) ? json.candidates : [];

    // Enforce Solar specificity: only return candidates with solar relevance
    const solarOnly = rawList.filter((c) =>
      isSolarCandidate({
        name: c.name,
        role: c.current_role,
        skills: c.skills,
        resume_text: c.resume_text,
        sharepoint_folder: c.sharepoint_folder,
      }),
    );

    const result = {
      candidates: solarOnly,
      total: solarOnly.length,
    };

    aiCandidateCache.set(cacheKey, {
      data: result,
      expiresAt: Date.now() + AI_CACHE_TTL_MS,
    });

    return result;
  } catch (error: any) {
    if (cached) {
      return cached.data;
    }
    console.warn("[ResumeScreener] Notice: AI microservice cold-start or busy, using local Solar talent pool.");
    return { candidates: [], total: 0 };
  }
}

export async function indexCandidateIntoAi(candidate: {
  id: string;
  name: string;
  resume_text: string;
  skills?: string[];
  years_experience?: number;
  location?: string;
  cv_path?: string;
}): Promise<boolean> {
  const config = getResumeScreenerConfig();
  if (!config.enabled) return false;

  try {
    const response = await fetch(`${config.url}/api/v1/index-candidate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": config.apiKey,
      },
      body: JSON.stringify({
        id: candidate.id,
        name: candidate.name,
        resume_text: candidate.resume_text,
        skills: candidate.skills || [],
        years_experience: candidate.years_experience || 0,
        location: candidate.location || "India",
        cv_path: candidate.cv_path || "",
      }),
      signal: AbortSignal.timeout(8_000),
    });

    if (response.ok) {
      console.log(`[ResumeScreener] Successfully auto-indexed candidate ${candidate.name} (${candidate.id}) into AI`);
      return true;
    }
  } catch (err: any) {
    console.warn(`[ResumeScreener] Background indexing skipped for candidate ${candidate.id}:`, err.message);
  }

  return false;
}

export function getAiCandidatePdfUrl(candidateId: string): string {
  const config = getResumeScreenerConfig();
  return `${config.url}/api/v1/candidate-pdf/${encodeURIComponent(candidateId)}`;
}
