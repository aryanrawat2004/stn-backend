type GraphDriveItem = {
  id: string;
  name: string;
  webUrl?: string;
  folder?: { childCount?: number };
  file?: { mimeType?: string };
  parentReference?: { path?: string };
};

type GraphListResponse = {
  value?: GraphDriveItem[];
  "@odata.nextLink"?: string;
};

export type SharePointTalentItem = {
  id: string;
  name: string;
  role: string;
  domain: string;
  location: string;
  experience: string;
  skills: string[];
  resumeUrl: string;
  fileName: string;
  folderName: string;
  source: "sharepoint";
};

export type SharePointTalentFolder = {
  id: string;
  name: string;
  childCount: number;
};

const tenantId = (process.env.SHAREPOINT_TENANT_ID || process.env.MS_TENANT_ID)?.trim();
const clientId = (process.env.SHAREPOINT_CLIENT_ID || process.env.MS_CLIENT_ID)?.trim();
const clientSecret = (process.env.SHAREPOINT_CLIENT_SECRET || process.env.MS_CLIENT_SECRET)?.trim();
const siteHost = (process.env.SHAREPOINT_HOST || "mabicons.sharepoint.com").trim();
const sitePath = (process.env.SHAREPOINT_SITE_PATH || "/sites/Mabicons/recruitment").trim();
const driveName = (process.env.SHAREPOINT_DRIVE_NAME || "Documents").trim();
const rootFolder = (process.env.SHAREPOINT_TALENT_FOLDER || "CV Database/Master CV/position wise").trim();

export const sharePointTalentConfig = {
  configured: Boolean(tenantId && clientId && clientSecret),
  siteHost,
  sitePath,
  driveName,
  rootFolder,
};

const CACHE_TTL_MS = 5 * 60 * 1000;
let tokenCache: { token: string; expiresAt: number } | null = null;
let metadataCache: { siteId: string; driveId: string; expiresAt: number } | null = null;
let foldersCache: { folders: SharePointTalentFolder[]; expiresAt: number } | null = null;
const folderRecordsCache = new Map<string, { records: SharePointTalentItem[]; expiresAt: number }>();

function withTimeout(signalMs = 20_000) {
  return AbortSignal.timeout(signalMs);
}

async function getToken() {
  if (!tenantId || !clientId || !clientSecret) {
    throw new Error("Microsoft Graph credentials are not configured");
  }

  if (tokenCache && tokenCache.expiresAt > Date.now()) return tokenCache.token;

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });

  const response = await fetch(
    `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: withTimeout(),
    },
  );

  const payload = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
    error_description?: string;
  };

  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description || "Could not authenticate with Microsoft Graph");
  }

  tokenCache = {
    token: payload.access_token,
    expiresAt: Date.now() + Math.max(60, (payload.expires_in || 3600) - 120) * 1000,
  };

  return payload.access_token;
}

async function graphJson<T>(token: string, url: string): Promise<T> {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: withTimeout(),
  });

  const payload = await response.json();
  if (!response.ok) {
    const message = payload?.error?.message || `Microsoft Graph request failed (${response.status})`;
    throw new Error(message);
  }
  return payload as T;
}

async function getSiteId(token: string) {
  const result = await graphJson<{ id: string }>(
    token,
    `https://graph.microsoft.com/v1.0/sites/${siteHost}:${sitePath}`,
  );
  return result.id;
}

async function getDriveId(token: string, siteId: string) {
  const result = await graphJson<{ value?: Array<{ id: string; name: string }> }>(
    token,
    `https://graph.microsoft.com/v1.0/sites/${encodeURIComponent(siteId)}/drives?$select=id,name`,
  );

  const drive = result.value?.find((item) => item.name.toLowerCase() === driveName.toLowerCase());
  if (!drive) {
    const available = (result.value || []).map((item) => item.name).join(", ");
    throw new Error(
      `SharePoint document library '${driveName}' was not found${available ? `. Available libraries: ${available}` : ""}`,
    );
  }
  return drive.id;
}

async function getMetadata(token: string) {
  if (metadataCache && metadataCache.expiresAt > Date.now()) return metadataCache;

  const siteId = await getSiteId(token);
  const driveId = await getDriveId(token, siteId);
  metadataCache = { siteId, driveId, expiresAt: Date.now() + CACHE_TTL_MS };
  return metadataCache;
}

async function listAll(token: string, url: string): Promise<GraphDriveItem[]> {
  const items: GraphDriveItem[] = [];
  let nextUrl: string | undefined = url;

  while (nextUrl) {
    const responsePage: GraphListResponse = await graphJson<GraphListResponse>(token, nextUrl);
    items.push(...(responsePage.value || []));
    nextUrl = responsePage["@odata.nextLink"];
  }

  return items;
}

async function listChildren(token: string, driveId: string, path: string) {
  const encodedPath = path
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");

  return listAll(
    token,
    `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(driveId)}/root:/${encodedPath}:/children?$select=id,name,webUrl,folder,file,parentReference&$top=200`,
  );
}

function cleanName(fileName: string) {
  return fileName
    .replace(/\.(pdf|docx?|rtf)$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function inferSkills(folder: string) {
  const lower = folder.toLowerCase();
  const skills = new Set<string>();
  if (lower.includes("solar")) skills.add("Solar");
  if (lower.includes("electrical")) skills.add("Electrical");
  if (lower.includes("sales")) skills.add("Sales");
  if (lower.includes("operation")) skills.add("Operations");
  if (lower.includes("technician")) skills.add("Technician");
  if (lower.includes("site engineer")) skills.add("Site Engineering");
  if (lower.includes("construction")) skills.add("Construction");
  if (lower.includes("supply chain")) skills.add("Supply Chain");
  if (lower.includes("procurement")) skills.add("Procurement");
  if (lower.includes("warehouse")) skills.add("Warehouse");
  return Array.from(skills);
}

async function collectFolderFiles(
  token: string,
  driveId: string,
  folderPath: string,
  folderName: string,
): Promise<SharePointTalentItem[]> {
  const entries = await listChildren(token, driveId, folderPath);
  const result: SharePointTalentItem[] = [];

  const nestedFolders: GraphDriveItem[] = [];

  for (const entry of entries) {
    if (entry.folder) {
      nestedFolders.push(entry);
      continue;
    }

    if (!entry.file || !/\.(pdf|docx?|rtf)$/i.test(entry.name)) continue;

    result.push({
      id: entry.id,
      name: cleanName(entry.name),
      role: folderName.replace(/\s+CVs?$/i, "").trim(),
      domain: folderName,
      location: "India",
      experience: "Not specified",
      skills: inferSkills(folderName),
      resumeUrl: entry.webUrl || "",
      fileName: entry.name,
      folderName,
      source: "sharepoint",
    });
  }

  // Recurse only inside the selected position folder. A small concurrency batch
  // keeps nested CV folders responsive without scanning the entire CV database.
  const batchSize = 4;
  for (let i = 0; i < nestedFolders.length; i += batchSize) {
    const batch = nestedFolders.slice(i, i + batchSize);
    const nestedResults = await Promise.all(
      batch.map((entry) =>
        collectFolderFiles(token, driveId, `${folderPath}/${entry.name}`, folderName),
      ),
    );
    for (const nested of nestedResults) result.push(...nested);
  }

  return result;
}

export async function listSharePointTalentFolders(force = false): Promise<SharePointTalentFolder[]> {
  if (!force && foldersCache && foldersCache.expiresAt > Date.now()) return foldersCache.folders;

  const token = await getToken();
  const { driveId } = await getMetadata(token);
  const entries = await listChildren(token, driveId, rootFolder);

  const folders = entries
    .filter((item) => item.folder)
    .map((item) => ({
      id: item.id,
      name: item.name,
      childCount: item.folder?.childCount || 0,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  foldersCache = { folders, expiresAt: Date.now() + CACHE_TTL_MS };
  return folders;
}

export async function loadSharePointTalentFolder(
  folderName: string,
  force = false,
): Promise<SharePointTalentItem[]> {
  const cacheKey = folderName.toLowerCase();
  const cached = folderRecordsCache.get(cacheKey);
  if (!force && cached && cached.expiresAt > Date.now()) return cached.records;

  const folders = await listSharePointTalentFolders(force);
  const folder = folders.find((item) => item.name.toLowerCase() === cacheKey);
  if (!folder) throw new Error(`SharePoint talent folder '${folderName}' was not found`);

  const token = await getToken();
  const { driveId } = await getMetadata(token);
  const records = await collectFolderFiles(token, driveId, `${rootFolder}/${folder.name}`, folder.name);

  folderRecordsCache.set(cacheKey, {
    records,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });

  return records;
}

export async function loadSharePointTalent(force = false) {
  const folders = await listSharePointTalentFolders(force);
  const all: SharePointTalentItem[] = [];

  // Kept for API compatibility, but callers should prefer folder-specific loading.
  // Load sequentially to avoid hammering Microsoft Graph on large libraries.
  for (const folder of folders) {
    all.push(...(await loadSharePointTalentFolder(folder.name, force)));
  }

  return all;
}
