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

const tenantId = process.env.MS_TENANT_ID?.trim();
const clientId = process.env.MS_CLIENT_ID?.trim();
const clientSecret = process.env.MS_CLIENT_SECRET?.trim();
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

async function getToken() {
  if (!tenantId || !clientId || !clientSecret) {
    throw new Error("Microsoft Graph credentials are not configured");
  }

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
    },
  );

  const payload = (await response.json()) as { access_token?: string; error_description?: string };
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description || "Could not authenticate with Microsoft Graph");
  }

  return payload.access_token;
}

async function graphJson<T>(token: string, url: string): Promise<T> {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
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
    `https://graph.microsoft.com/v1.0/sites/${encodeURIComponent(siteId)}/drives`,
  );
  const drive = result.value?.find((item) => item.name.toLowerCase() === driveName.toLowerCase());
  if (!drive) throw new Error(`SharePoint document library '${driveName}' was not found`);
  return drive.id;
}

async function listAll(token: string, url: string) {
  const items: GraphDriveItem[] = [];
  let next: string | undefined = url;
  while (next) {
    const page = await graphJson<GraphListResponse>(token, next);
    items.push(...(page.value || []));
    next = page["@odata.nextLink"];
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
    `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(driveId)}/root:/${encodedPath}:/children?$select=id,name,webUrl,folder,file,parentReference`,
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

  for (const entry of entries) {
    if (entry.folder) {
      result.push(
        ...(await collectFolderFiles(
          token,
          driveId,
          `${folderPath}/${entry.name}`,
          folderName,
        )),
      );
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

  return result;
}

export async function loadSharePointTalent() {
  const token = await getToken();
  const siteId = await getSiteId(token);
  const driveId = await getDriveId(token, siteId);
  const folders = await listChildren(token, driveId, rootFolder);

  const result: SharePointTalentItem[] = [];
  for (const folder of folders.filter((item) => item.folder)) {
    result.push(
      ...(await collectFolderFiles(
        token,
        driveId,
        `${rootFolder}/${folder.name}`,
        folder.name,
      )),
    );
  }

  return result;
}
