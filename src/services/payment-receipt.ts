type ReceiptData = {
  receiptNo: string;
  customerName: string;
  customerEmail: string;
  planName: string;
  billingLabel: string;
  paymentId: string;
  orderId: string;
  paymentMethod: string;
  taxableAmount: number;
  gstRate: number;
  gstAmount: number;
  totalAmount: number;
  currency: string;
  paidAt: string;
  highlights: string[];
};

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function money(paise: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format((Number(paise) || 0) / 100);
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function pdfEscape(value: unknown) {
  return String(value ?? "").replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

export function createReceiptNumber(paymentId: string, paidAt = new Date().toISOString()) {
  const date = new Date(paidAt);
  const year = Number.isNaN(date.getTime()) ? new Date().getFullYear() : date.getFullYear();
  const suffix = paymentId.replace(/[^a-zA-Z0-9]/g, "").slice(-8).toUpperCase() || String(Date.now()).slice(-8);
  return `SN-${year}-${suffix}`;
}

export function buildPaymentReceiptHtml(data: ReceiptData) {
  const highlights = data.highlights.map((item) => `
    <tr><td style="padding:6px 0;color:#51687a;font-size:14px;"><span style="display:inline-block;width:20px;height:20px;line-height:20px;text-align:center;border-radius:50%;background:#ff8b18;color:white;font-weight:800;margin-right:8px;">✓</span>${escapeHtml(item)}</td></tr>
  `).join("");

  return `<!doctype html>
<html>
<body style="margin:0;background:#eef4f8;font-family:Arial,Helvetica,sans-serif;color:#0b3154;">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr><td align="center" style="padding:28px 12px;">
<table width="760" cellpadding="0" cellspacing="0" role="presentation" style="max-width:760px;width:100%;background:#ffffff;border-radius:22px;overflow:hidden;box-shadow:0 16px 50px rgba(7,59,102,.10);">
<tr><td style="padding:28px 34px 18px;text-align:center;">
  <img src="https://www.solarnaukri.com/images/solar-naukri-logo.png?v=20260918" alt="SolarNaukri" width="220" style="display:block;width:220px;max-width:80%;height:auto;margin:0 auto;" />
  <div style="margin-top:7px;font-size:16px;color:#50687d;">India's Renewable Energy Career Network</div>
</td></tr>
<tr><td style="padding:0 24px;">
  <div style="background:#effcf4;border-radius:18px;padding:26px;text-align:center;">
    <div style="width:58px;height:58px;border-radius:50%;margin:0 auto 12px;background:#17a65b;color:white;font-size:34px;line-height:58px;font-weight:900;">✓</div>
    <div style="font-size:34px;font-weight:900;color:#0b3154;">Payment Successful</div>
    <div style="margin-top:8px;font-size:17px;color:#577083;">Your payment has been received successfully.</div>
  </div>
</td></tr>
<tr><td style="padding:28px 28px 10px;">
  <div style="font-size:20px;font-weight:900;">Hi ${escapeHtml(data.customerName || "Customer")},</div>
  <div style="margin-top:12px;font-size:15px;line-height:1.7;color:#5e7181;">Thank you for choosing SolarNaukri! This receipt confirms that your payment has been completed successfully. You can now start using your plan to post job opportunities and connect with renewable-energy talent.</div>
</td></tr>
<tr><td style="padding:12px 28px 30px;">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr>
<td width="58%" valign="top" style="padding-right:10px;">
  <div style="border:1px solid #d9e5ed;border-radius:16px;padding:20px;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr><td style="font-size:20px;font-weight:900;padding-bottom:4px;">Payment Receipt</td><td align="right" style="font-size:12px;color:#6f8190;">Date<br><strong style="color:#0b3154;font-size:14px;">${formatDate(data.paidAt)}</strong></td></tr>
      <tr><td colspan="2" style="padding-bottom:16px;color:#6f8190;font-size:13px;">Receipt No: ${escapeHtml(data.receiptNo)}</td></tr>
      <tr><td colspan="2" style="border-top:1px solid #e4ebf0;padding-top:14px;"></td></tr>
      <tr><td style="padding:5px 0;color:#6c7d8b;">Customer</td><td style="font-weight:800;">${escapeHtml(data.customerName)}</td></tr>
      <tr><td style="padding:5px 0;color:#6c7d8b;">Email</td><td style="font-weight:800;">${escapeHtml(data.customerEmail)}</td></tr>
      <tr><td style="padding:5px 0;color:#6c7d8b;">Plan Purchased</td><td style="font-weight:800;">${escapeHtml(data.planName)}</td></tr>
      <tr><td style="padding:5px 0;color:#6c7d8b;">Payment Method</td><td style="font-weight:800;">${escapeHtml(data.paymentMethod)}</td></tr>
      <tr><td style="padding:5px 0;color:#6c7d8b;">Transaction ID</td><td style="font-size:12px;font-weight:700;">${escapeHtml(data.paymentId)}</td></tr>
      <tr><td style="padding:5px 0 14px;color:#6c7d8b;">Order ID</td><td style="font-size:12px;font-weight:700;">${escapeHtml(data.orderId)}</td></tr>
      <tr><td style="padding:10px 0 5px;border-top:1px solid #e4ebf0;color:#6c7d8b;">Amount Before GST</td><td style="padding-top:10px;font-weight:800;">${money(data.taxableAmount)}</td></tr>
      <tr><td style="padding:5px 0;color:#6c7d8b;">GST (${data.gstRate}%)</td><td style="font-weight:800;">${money(data.gstAmount)}</td></tr>
      <tr><td style="padding:14px 12px;background:#edf6fd;font-size:17px;font-weight:900;">Total Paid</td><td align="right" style="padding:14px 12px;background:#edf6fd;font-size:22px;font-weight:900;color:#07559b;">${money(data.totalAmount)}</td></tr>
      <tr><td style="padding-top:14px;color:#6c7d8b;">Status</td><td style="padding-top:14px;"><span style="display:inline-block;background:#e9f9ef;color:#14844b;padding:7px 14px;border-radius:20px;font-weight:900;">✓ Paid</span></td></tr>
    </table>
  </div>
</td>
<td width="42%" valign="top" style="padding-left:10px;">
  <div style="border:1px solid #d9e5ed;border-radius:16px;padding:20px;">
    <div style="font-size:20px;font-weight:900;">Order Summary</div>
    <div style="margin-top:4px;font-size:13px;color:#6f8190;">Your purchase details</div>
    <div style="margin-top:16px;padding:16px;border:1px solid #dce6ed;border-radius:13px;">
      <table width="100%"><tr><td><strong style="font-size:18px;">${escapeHtml(data.planName)}</strong><br><span style="font-size:13px;color:#6f8190;">${escapeHtml(data.billingLabel)}</span></td><td align="right"><strong style="font-size:20px;">${money(data.taxableAmount)}</strong><br><span style="font-size:12px;color:#6f8190;">before GST</span></td></tr></table>
    </div>
    <table width="100%" style="margin-top:12px;">${highlights}</table>
  </div>
  <div style="margin-top:14px;border:1px solid #d9e5ed;border-radius:16px;padding:20px;">
    <div style="font-size:19px;font-weight:900;">Need help?</div>
    <div style="margin-top:5px;color:#6f8190;font-size:13px;">Our team is here to assist you.</div>
    <div style="margin-top:15px;font-size:14px;font-weight:800;color:#07559b;">support@solarnaukri.com</div>
    <div style="margin-top:4px;font-size:12px;color:#6f8190;">For payment or technical support</div>
    <div style="margin-top:12px;font-size:14px;font-weight:800;color:#07559b;">info@solarnaukri.com</div>
    <div style="margin-top:4px;font-size:12px;color:#6f8190;">For general queries</div>
  </div>
</td>
</tr></table>
</td></tr>
<tr><td style="padding:0 28px 30px;">
  <div style="background:#edf6fd;border-radius:14px;padding:18px;text-align:center;font-size:13px;color:#4f6576;"><strong style="color:#0b3154;">This receipt confirms that your payment has been completed successfully.</strong><br>If you have any questions, feel free to contact our support team.</div>
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

export function buildPaymentReceiptPdf(data: ReceiptData) {
  const content: string[] = [];
  const text = (x: number, y: number, size: number, value: string, font = "F1") => {
    content.push(`BT /${font} ${size} Tf ${x} ${y} Td (${pdfEscape(value)}) Tj ET`);
  };
  const rect = (x: number, y: number, w: number, h: number, r: number, g: number, b: number) => {
    content.push(`${r} ${g} ${b} rg ${x} ${y} ${w} ${h} re f`);
  };

  rect(0, 0, 595, 842, 1, 1, 1);
  text(182, 790, 28, "SOLAR", "F2");
  text(285, 790, 28, "NAUKRI", "F2");
  text(193, 766, 12, "India's Renewable Energy Career Network");
  rect(40, 650, 515, 90, 0.94, 0.99, 0.96);
  text(172, 700, 26, "Payment Successful", "F2");
  text(150, 675, 12, "Your payment has been received successfully.");

  text(48, 620, 16, `Hi ${data.customerName || "Customer"},`, "F2");
  text(48, 595, 11, "Thank you for choosing SolarNaukri. This receipt confirms your successful payment.");

  text(48, 555, 17, "Payment Receipt", "F2");
  text(370, 555, 11, `Date: ${formatDate(data.paidAt)}`);
  text(48, 535, 10, `Receipt No: ${data.receiptNo}`);

  const rows: Array<[string,string]> = [
    ["Customer", data.customerName],
    ["Email", data.customerEmail],
    ["Plan Purchased", data.planName],
    ["Payment Method", data.paymentMethod],
    ["Transaction ID", data.paymentId],
    ["Order ID", data.orderId],
    ["Amount Before GST", money(data.taxableAmount)],
    [`GST (${data.gstRate}%)`, money(data.gstAmount)],
  ];
  let y = 505;
  for (const [label, value] of rows) {
    text(48, y, 10, label);
    text(190, y, 10, value, "F2");
    y -= 24;
  }

  rect(45, 270, 505, 48, 0.93, 0.97, 1);
  text(60, 287, 15, "Total Paid", "F2");
  text(390, 287, 20, money(data.totalAmount), "F2");
  text(48, 238, 11, "Status");
  text(190, 238, 12, "PAID", "F2");

  text(48, 195, 16, "Order Summary", "F2");
  text(48, 170, 12, `${data.planName} - ${data.billingLabel}`, "F2");
  text(390, 170, 15, money(data.taxableAmount), "F2");
  let hy = 145;
  for (const item of data.highlights.slice(0, 3)) {
    text(60, hy, 10, `- ${item}`);
    hy -= 18;
  }

  rect(40, 55, 515, 55, 0.93, 0.97, 1);
  text(68, 83, 11, "This receipt confirms that your payment has been completed successfully.", "F2");
  text(98, 66, 9, "Support: support@solarnaukri.com | info@solarnaukri.com");

  const stream = content.join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((obj, index) => {
    offsets[index + 1] = Buffer.byteLength(pdf, "utf8");
    pdf += `${index + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, "utf8");
}

export async function sendPaymentReceiptEmail(data: ReceiptData, pdf: Buffer) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.PAYMENT_EMAIL_FROM?.trim() || process.env.EMAIL_FROM?.trim();
  if (!apiKey || !from || !data.customerEmail) {
    console.warn("Payment receipt email skipped: RESEND_API_KEY / PAYMENT_EMAIL_FROM / customer email missing");
    return { sent: false, reason: "EMAIL_NOT_CONFIGURED" };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [data.customerEmail],
      subject: `Payment Successful - ${data.planName} | SolarNaukri`,
      html: buildPaymentReceiptHtml(data),
      attachments: [{
        filename: `SolarNaukri-Receipt-${data.receiptNo}.pdf`,
        content: pdf.toString("base64"),
      }],
    }),
  });

  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    console.error("Payment receipt email failed:", payload);
    return { sent: false, reason: "EMAIL_SEND_FAILED" };
  }
  return { sent: true, id: String(payload.id || "") };
}

export type { ReceiptData };
