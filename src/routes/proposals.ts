import { Router, Request, Response, NextFunction } from "express";

const router = Router();

const wrap = (fn: (req: Request, res: Response) => Promise<Response | void>) =>
  (req: Request, res: Response, next: NextFunction) => Promise.resolve(fn(req, res)).catch(next);

function splitEmails(value: unknown) {
  return String(value || "")
    .split(/[;,]/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function cleanPdfText(value: string) {
  return String(value || "")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function wrapText(value: string, width = 88) {
  const source = String(value || "").replace(/\r/g, "").split("\n");
  const lines: string[] = [];

  for (const paragraph of source) {
    if (!paragraph.trim()) {
      lines.push("");
      continue;
    }

    const words = paragraph.trim().split(/\s+/);
    let current = "";

    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (next.length > width && current) {
        lines.push(current);
        current = word;
      } else {
        current = next;
      }
    }

    if (current) lines.push(current);
  }

  return lines;
}

function buildProposalPdf(input: {
  candidateName?: string;
  candidateRole?: string;
  to: string;
  subject: string;
  message: string;
}) {
  const lines = [
    "SolarNaukri Proposal",
    "",
    `Prepared for: ${input.candidateName || "Candidate"}`,
    input.candidateRole ? `Role: ${input.candidateRole}` : "",
    `Email: ${input.to}`,
    `Date: ${new Date().toLocaleDateString("en-IN")}`,
    "",
    `Subject: ${input.subject}`,
    "",
    ...wrapText(input.message),
  ].filter((line, index, array) => line !== "" || array[index - 1] !== "");

  const streamLines = [
    "BT",
    "/F1 20 Tf",
    "50 742 Td",
    `(${cleanPdfText(lines[0] || "SolarNaukri Proposal")}) Tj`,
    "/F1 11 Tf",
    "0 -28 Td",
  ];

  for (const line of lines.slice(1, 42)) {
    streamLines.push(`(${cleanPdfText(line)}) Tj`);
    streamLines.push("0 -17 Td");
  }

  streamLines.push("ET");
  const stream = streamLines.join("\n");

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}\nendstream`,
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [0];

  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(pdf, "utf8");
}

function htmlEscape(value: string) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

router.post("/send", wrap(async (req, res) => {
  const to = splitEmails(req.body?.to);
  const cc = splitEmails(req.body?.cc);
  const bcc = splitEmails(req.body?.bcc);
  const subject = String(req.body?.subject || "").trim();
  const message = String(req.body?.message || "").trim();
  const candidateName = String(req.body?.candidateName || "").trim();
  const candidateRole = String(req.body?.candidateRole || "").trim();
  const requestedAttachmentName = String(req.body?.attachmentName || "").trim();

  if (!to.length || !subject || !message) {
    return res.status(400).json({ error: "To, subject and message are required" });
  }

  const allRecipients = [...to, ...cc, ...bcc];
  const invalid = allRecipients.find((email) => !isEmail(email));
  if (invalid) {
    return res.status(400).json({ error: `Invalid email address: ${invalid}` });
  }

  const apiKey = String(process.env.RESEND_API_KEY || "").trim();
  if (!apiKey) {
    return res.status(503).json({
      error: "Email service is not configured. Add RESEND_API_KEY on the backend deployment.",
    });
  }

  const from = String(
    process.env.RESEND_FROM_EMAIL || "SolarNaukri <info@solarnaukri.com>",
  ).trim();

  const safeBaseName =
    requestedAttachmentName ||
    `SolarNaukri_Proposal_${(candidateName || "Candidate").replace(/[^a-z0-9]+/gi, "_")}.pdf`;
  const attachmentName = safeBaseName.toLowerCase().endsWith(".pdf")
    ? safeBaseName
    : `${safeBaseName}.pdf`;

  const pdf = buildProposalPdf({
    candidateName,
    candidateRole,
    to: to[0],
    subject,
    message,
  });

  const html = `
    <div style="font-family:Arial,sans-serif;color:#17324d;line-height:1.6">
      <p>${htmlEscape(message).replace(/\n/g, "<br/>")}</p>
      <p style="margin-top:24px;color:#5f7182;font-size:12px">
        Sent via SolarNaukri Admin Proposal Centre
      </p>
    </div>
  `;

  const resendResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to,
      ...(cc.length ? { cc } : {}),
      ...(bcc.length ? { bcc } : {}),
      subject,
      html,
      attachments: [
        {
          filename: attachmentName,
          content: pdf.toString("base64"),
        },
      ],
    }),
  });

  const payload = await resendResponse.json().catch(() => null);

  if (!resendResponse.ok) {
    const message =
      payload?.message ||
      payload?.error ||
      `Email provider returned ${resendResponse.status}`;
    return res.status(502).json({ error: String(message) });
  }

  return res.json({
    success: true,
    id: payload?.id || null,
    message: "Proposal sent successfully",
    attachment: attachmentName,
  });
}));

export default router;
