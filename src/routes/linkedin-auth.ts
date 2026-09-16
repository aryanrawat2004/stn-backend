import { Router } from "express";
import crypto from "node:crypto";

const router = Router();

type PendingState = {
  role: string;
  createdAt: number;
};

const pendingStates = new Map<string, PendingState>();
const STATE_TTL_MS = 10 * 60 * 1000;

function getConfig() {
  const clientId = process.env.LINKEDIN_CLIENT_ID?.trim();
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET?.trim();
  const redirectUri = process.env.LINKEDIN_REDIRECT_URI?.trim();
  const frontendUrl = (process.env.FRONTEND_URL || "http://localhost:8080").replace(/\/$/, "");

  return { clientId, clientSecret, redirectUri, frontendUrl };
}

function cleanExpiredStates() {
  const now = Date.now();
  for (const [state, value] of pendingStates.entries()) {
    if (now - value.createdAt > STATE_TTL_MS) pendingStates.delete(state);
  }
}

router.get("/start", (req, res) => {
  const { clientId, redirectUri } = getConfig();

  if (!clientId || !redirectUri) {
    return res.status(500).json({
      error: "LinkedIn OAuth is not configured",
      required: ["LINKEDIN_CLIENT_ID", "LINKEDIN_REDIRECT_URI"],
    });
  }

  cleanExpiredStates();

  const role = typeof req.query.role === "string" ? req.query.role : "candidate";
  const state = crypto.randomBytes(24).toString("hex");
  pendingStates.set(state, { role, createdAt: Date.now() });

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    scope: "openid profile email",
  });

  return res.redirect(`https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`);
});

router.get("/callback", async (req, res) => {
  const { clientId, clientSecret, redirectUri, frontendUrl } = getConfig();

  if (!clientId || !clientSecret || !redirectUri) {
    return res.status(500).json({
      error: "LinkedIn OAuth is not configured",
      required: [
        "LINKEDIN_CLIENT_ID",
        "LINKEDIN_CLIENT_SECRET",
        "LINKEDIN_REDIRECT_URI",
      ],
    });
  }

  const oauthError = typeof req.query.error === "string" ? req.query.error : "";
  const oauthDescription =
    typeof req.query.error_description === "string" ? req.query.error_description : "";

  if (oauthError) {
    const target = new URL(`${frontendUrl}/login/candidate`);
    target.searchParams.set("linkedin_error", oauthDescription || oauthError);
    return res.redirect(target.toString());
  }

  const code = typeof req.query.code === "string" ? req.query.code : "";
  const state = typeof req.query.state === "string" ? req.query.state : "";

  if (!code || !state) {
    return res.status(400).json({
      error: "Missing LinkedIn authorization code or state",
      hint: "Do not open the callback URL directly. Start login from /api/auth/linkedin/start?role=candidate",
    });
  }

  cleanExpiredStates();
  const pending = pendingStates.get(state);

  if (!pending) {
    return res.status(400).json({
      error: "Invalid or expired LinkedIn OAuth state",
    });
  }

  pendingStates.delete(state);

  try {
    const tokenBody = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
    });

    const tokenResponse = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: tokenBody,
    });

    const tokenData = (await tokenResponse.json()) as {
      access_token?: string;
      error?: string;
      error_description?: string;
    };

    if (!tokenResponse.ok || !tokenData.access_token) {
      console.error("LinkedIn token exchange failed", tokenData);
      return res.status(502).json({
        error: "LinkedIn token exchange failed",
        details: tokenData.error_description || tokenData.error || "Unknown LinkedIn error",
      });
    }

    const userResponse = await fetch("https://api.linkedin.com/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    const user = (await userResponse.json()) as {
      sub?: string;
      name?: string;
      given_name?: string;
      family_name?: string;
      email?: string;
      picture?: string;
    };

    if (!userResponse.ok || !user.sub) {
      console.error("LinkedIn userinfo failed", user);
      return res.status(502).json({ error: "Unable to read LinkedIn profile" });
    }

    const target = new URL(`${frontendUrl}/login/${encodeURIComponent(pending.role)}`);
    target.searchParams.set("linkedin", "success");
    target.searchParams.set("role", pending.role);
    target.searchParams.set("sub", user.sub);
    if (user.name) target.searchParams.set("name", user.name);
    if (user.email) target.searchParams.set("email", user.email);
    if (user.picture) target.searchParams.set("picture", user.picture);

    return res.redirect(target.toString());
  } catch (error) {
    console.error("LinkedIn OAuth callback failed", error);
    return res.status(500).json({ error: "LinkedIn authentication failed" });
  }
});

export default router;
