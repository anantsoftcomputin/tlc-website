import { emailTemplate, type EmailTemplateData } from "./catalog.js";
export type EmailBrand = {
  siteUrl?: string;
  assetBaseUrl?: string;
  supportEmail?: string;
  phone?: string;
  postalAddress?: string;
  year?: number;
  preview?: boolean;
};
export type RenderedEmail = {
  templateId: string;
  version: string;
  subject: string;
  preheader: string;
  html: string;
  text: string;
  headers: Record<string, string>;
};
export const EMAIL_DESIGN_VERSION = "tlc-email-2026-10-v1";
export const emailBrandDefaults = {
  supportEmail: "info@tlcholidays.in",
  phone: "+91 89488 88873",
  postalAddress:
    "11/26, 1-B, Ground Floor, Karmin Apartments, Suter Ganj, Kanpur, Uttar Pradesh, India",
};
export function escapeEmailHtml(value: unknown): string {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ]!,
  );
}
export function safeEmailUrl(value: string, preview = false): string {
  const url = new URL(value);
  if (
    url.username ||
    url.password ||
    !(
      url.protocol === "https:" ||
      (preview &&
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(url.hostname))
    )
  )
    throw new Error("Email links must use HTTPS without embedded credentials.");
  return url.href;
}
function paragraphs(value: string) {
  return value
    .split(/\n\s*\n/)
    .filter(Boolean)
    .map(
      (part) =>
        `<p style="margin:0 0 18px;font:16px/1.75 Arial,Helvetica,sans-serif;color:#55494b;overflow-wrap:anywhere">${escapeEmailHtml(part).replace(/\n/g, "<br>")}</p>`,
    )
    .join("");
}
const interpolate = (value: string, data: EmailTemplateData) =>
  value.replace(/\{\{(\w+)\}\}/g, (_, key: keyof EmailTemplateData) =>
    String(
      data[key] ||
        (key === "firstName"
          ? "traveller"
          : key === "destination"
            ? "your next destination"
            : ""),
    ),
  );
export function renderEmail(
  templateId: string,
  input: EmailTemplateData = {},
  brand: EmailBrand = {},
): RenderedEmail {
  const template = emailTemplate(templateId);
  const preview = brand.preview === true;
  const data = { ...input };
  for (const [key, value] of Object.entries(data)) {
    if (
      typeof value === "string" &&
      value.length > (key === "message" ? 20000 : 2000)
    )
      throw new Error(`Email field too long: ${key}`);
  }
  if (
    (data.details?.length || 0) > 12 ||
    (data.recommendations?.length || 0) > 3
  )
    throw new Error("Too many email detail rows or recommendations.");
  for (const key of template.required || [])
    if (typeof data[key] !== "string" || !String(data[key]).trim())
      throw new Error(`${template.id} requires ${key}`);
  const site = brand.siteUrl
    ? new URL(safeEmailUrl(brand.siteUrl, preview)).origin
    : undefined;
  const assets = brand.assetBaseUrl
    ? safeEmailUrl(brand.assetBaseUrl, preview).replace(/\/$/, "")
    : site;
  const supportEmail = brand.supportEmail || emailBrandDefaults.supportEmail;
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(supportEmail))
    throw new Error("Invalid email support address.");
  const phone = brand.phone || emailBrandDefaults.phone;
  const postalAddress = brand.postalAddress || emailBrandDefaults.postalAddress;
  const marketing = template.category === "Marketing";
  const subject = interpolate(data.subject || template.subject, data)
    .replace(/[\r\n]+/g, " ")
    .trim()
    .slice(0, 200);
  const preheader = interpolate(template.preheader, data);
  const heading = data.heading || interpolate(template.heading, data);
  const intro = interpolate(template.intro, data);
  const actionUrl = data.actionUrl
    ? safeEmailUrl(data.actionUrl, preview)
    : site && template.path
      ? `${site}${template.path}`
      : undefined;
  const actionLabel = data.actionLabel || template.action;
  const unsubscribeUrl = data.unsubscribeUrl
    ? safeEmailUrl(data.unsubscribeUrl, preview)
    : undefined;
  const preferencesUrl = site ? `${site}/client/preferences` : undefined;
  const year = brand.year || new Date().getUTCFullYear();
  const E = escapeEmailHtml;
  const details: { label: string; value: string }[] = [];
  if (data.reference)
    details.push({ label: "Reference", value: data.reference });
  if (data.destination)
    details.push({ label: "Destination", value: data.destination });
  if (data.tripDates)
    details.push({ label: "Travel dates", value: data.tripDates });
  if (data.travellers)
    details.push({ label: "Travellers", value: data.travellers });
  if (data.dueDate) details.push({ label: "Due date", value: data.dueDate });
  if (data.validUntil)
    details.push({ label: "Quote valid until", value: data.validUntil });
  details.push(...(data.details || []));
  const amountLabel =
    template.id === "payment-received"
      ? "AMOUNT RECEIVED"
      : template.id.startsWith("refund-")
        ? "REFUND AMOUNT"
        : template.id.startsWith("payment-")
          ? "PAYMENT AMOUNT"
          : template.id === "invoice-ready"
            ? "INVOICE TOTAL"
            : "QUOTED TOTAL";
  const amountBlock = data.amount
    ? `<tr><td style="padding:26px 28px 18px"><p style="margin:0 0 10px;font:11px Arial,Helvetica,sans-serif;letter-spacing:2px;color:#77666a">${amountLabel}</p><p style="margin:0;font:38px/1.2 Georgia,'Times New Roman',serif;color:#2a0b0d">${E(data.amount)}</p></td></tr>`
    : "";
  const detailBlock =
    details.length || data.amount
      ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#fff9f5;border:1px solid #eadada;border-radius:12px;margin:8px 0 28px">${amountBlock}<tr><td style="padding:12px 28px 20px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">${details.map((item) => `<tr><td valign="top" style="width:38%;padding:10px 14px 10px 0;font:13px/1.6 Arial,Helvetica,sans-serif;color:#7d6c6e;border-bottom:1px solid #eadada">${E(item.label)}</td><td valign="top" style="padding:10px 0;font:14px/1.6 Arial,Helvetica,sans-serif;color:#241619;border-bottom:1px solid #eadada;word-break:break-word">${E(item.value)}</td></tr>`).join("")}</table></td></tr></table>`
      : "";
  const messageBlock = data.message
    ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 24px"><tr><td style="border-left:3px solid #c91b28;padding:8px 0 0 22px">${paragraphs(data.message)}</td></tr></table>`
    : "";
  const cards = (data.recommendations || [])
    .map((card, i) => {
      const url = safeEmailUrl(card.url, preview);
      const image = card.image ? safeEmailUrl(card.image, preview) : undefined;
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;border:1px solid #eadada;border-radius:12px;overflow:hidden">${image ? `<tr><td><a href="${E(url)}"><img src="${E(image)}" width="536" alt="${E(card.title)}" style="display:block;width:100%;max-width:536px;height:auto;border:0"></a></td></tr>` : ""}<tr><td style="padding:24px"><p style="margin:0 0 12px;font:11px Arial,Helvetica,sans-serif;letter-spacing:2px;color:#a31319">${E(card.label || `THE COLLECTION / 0${i + 1}`)}</p><h2 style="margin:0 0 12px;font:27px/1.2 Georgia,'Times New Roman',serif;color:#2a0b0d">${E(card.title)}</h2>${paragraphs(card.description)}<a href="${E(url)}" style="font:bold 13px Arial,Helvetica,sans-serif;color:#a31319;text-decoration:underline">Explore this idea &rarr;</a></td></tr></table>`;
    })
    .join("");
  const button = actionUrl
    ? `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:8px 0 28px"><tr><td bgcolor="#b01824" style="border-radius:6px;background:#b01824;mso-padding-alt:17px 26px"><a href="${E(actionUrl)}" style="display:inline-block;padding:17px 26px;border:1px solid #b01824;border-radius:6px;color:#ffffff;font:bold 14px/1.4 Arial,Helvetica,sans-serif;text-decoration:none;text-align:center;mso-padding-alt:0">${E(actionLabel)} &nbsp;&rarr;</a></td></tr></table>`
    : `<p style="font:14px/1.7 Arial,Helvetica,sans-serif;color:#55494b">Sign in to your TLC account, or reply to your consultant for the next steps.</p>`;
  const imageUrl = data.heroImage
    ? safeEmailUrl(data.heroImage, preview)
    : template.image && assets
      ? `${assets}/images/${template.image}`
      : undefined;
  const hero =
    imageUrl && ["journey", "editorial"].includes(template.layout)
      ? `<tr><td><img src="${E(imageUrl)}" width="640" alt="${E(data.heroAlt || "A little travel inspiration from TLC Holidays")}" style="display:block;border:0;width:100%;max-width:640px;height:auto"></td></tr>`
      : "";
  const logo = assets
    ? `<img src="${E(`${assets}/images/logo.png`)}" width="142" height="44" alt="TLC — Travel Living Comfort" style="display:block;border:0;width:142px;height:44px;font:24px Georgia,serif;color:#a31319">`
    : `<span style="font:bold 32px Georgia,serif;color:#a31319">TLC</span><br><span style="font:9px Arial,sans-serif;letter-spacing:2px;color:#7d6c6e">TRAVEL LIVING COMFORT</span>`;
  const note = template.note
    ? `<p style="font:12px/1.8 Arial,Helvetica,sans-serif;color:#7d6c6e;margin:24px 0 0">${E(template.note)}</p>`
    : "";
  const security =
    template.layout === "security"
      ? `<p style="margin:0 0 20px;font:12px Arial,Helvetica,sans-serif;letter-spacing:2px;color:#a31319">PERSONAL &amp; SECURE</p>`
      : "";
  const footerLinks = marketing
    ? `${preferencesUrl ? `<a href="${E(preferencesUrl)}" style="color:#6d5659;text-decoration:underline">Email preferences</a> &nbsp;&middot;&nbsp; ` : ""}<a href="${E(unsubscribeUrl!)}" style="color:#6d5659;text-decoration:underline">Unsubscribe</a>`
    : `${site ? `<a href="${E(`${site}/client/messages`)}" style="color:#6d5659;text-decoration:underline">Contact your TLC team</a>` : `<a href="mailto:${E(supportEmail)}" style="color:#6d5659;text-decoration:underline">Contact TLC</a>`}`;
  const html = `<!doctype html><html lang="en" xmlns="http://www.w3.org/1999/xhtml"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${E(subject)}</title><style>body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}table,td{mso-table-lspace:0;mso-table-rspace:0}img{-ms-interpolation-mode:bicubic}body{margin:0!important;padding:0!important;width:100%!important}a[x-apple-data-detectors]{color:inherit!important;text-decoration:none!important}@media screen and (max-width:600px){.outer-pad{padding:12px 8px!important}.email-pad{padding-left:24px!important;padding-right:24px!important}.email-title{font-size:34px!important;line-height:1.14!important}.brand-note{font-size:9px!important;letter-spacing:1px!important}.email-top{padding:24px!important}}</style><!--[if mso]><style>body,table,td{font-family:Arial,Helvetica,sans-serif!important}table{border-collapse:collapse}</style><![endif]--></head><body style="margin:0;padding:0;background:#f5efeb;color:#241619"><div style="display:none!important;font-size:1px;color:#f5efeb;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all">${E(preheader)}${"&#847; &zwnj; &nbsp;".repeat(12)}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#f5efeb"><tr><td align="center" class="outer-pad" style="padding:36px 16px"><!--[if mso]><table role="presentation" width="640" align="center"><tr><td><![endif]--><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:640px;background:#ffffff;border:1px solid #eadada"><tr><td style="height:4px;background:#a31319;font-size:0;line-height:0">&nbsp;</td></tr><tr><td class="email-top" style="padding:28px 44px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td width="150">${site ? `<a href="${E(site)}" style="text-decoration:none">${logo}</a>` : logo}</td><td align="right" class="brand-note" style="font:10px/1.8 Arial,Helvetica,sans-serif;color:#7d6c6e;letter-spacing:2px">THOUGHTFULLY PLANNED.<br>PERSONALLY SUPPORTED.</td></tr></table></td></tr>${hero}<tr><td class="email-pad" style="padding:40px 48px 14px"><p style="margin:0 0 18px;font:bold 10px/1.6 Arial,Helvetica,sans-serif;letter-spacing:2.2px;color:#a31319">${E(template.eyebrow)}</p><h1 class="email-title" style="margin:0 0 25px;font:43px/1.12 Georgia,'Times New Roman',serif;font-weight:normal;letter-spacing:-1px;color:#2a0b0d">${E(heading).replace(/\n/g, "<br>")}</h1>${security}${paragraphs(`Hello ${data.firstName || "there"},`)}${paragraphs(intro)}${messageBlock}${detailBlock}${cards}${button}<p style="font:15px/1.7 Arial,Helvetica,sans-serif;color:#55494b;margin:0">With care,<br><strong style="color:#2a0b0d">${E(data.consultantName || "Your TLC team")}</strong></p>${note}</td></tr><tr><td class="email-pad" style="padding:26px 48px 32px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td style="border-top:1px solid #eadada;padding-top:22px;font:13px/1.8 Arial,Helvetica,sans-serif;color:#6d5659">A question, a change, a new idea?<br><a href="mailto:${E(supportEmail)}" style="color:#a31319;text-decoration:underline">${E(supportEmail)}</a> &nbsp;&middot;&nbsp; <a href="tel:${E(phone.replace(/[^+\d]/g, ""))}" style="color:#a31319;text-decoration:none">${E(phone)}</a></td></tr></table></td></tr></table><!--[if mso]></td></tr></table><![endif]--><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:640px;width:100%"><tr><td align="center" style="padding:26px 24px;font:11px/1.9 Arial,Helvetica,sans-serif;color:#7d6c6e"><strong style="font:17px Georgia,'Times New Roman',serif;color:#4a1619">Travel Living Comfort</strong><br>© ${year} TLC Holidays<br>${E(postalAddress)}<br><br>${marketing ? "You are receiving travel inspiration because you opted in to TLC email offers." : "This is a service message about your TLC account, enquiry or travel arrangements."}<br>${footerLinks}</td></tr></table></td></tr></table></body></html>`;
  const text = [
    "TLC HOLIDAYS · TRAVEL LIVING COMFORT",
    template.eyebrow,
    heading.replace(/\n/g, " "),
    `Hello ${data.firstName || "there"},`,
    intro,
    data.message,
    data.amount && `${amountLabel}: ${data.amount}`,
    ...details.map((item) => `${item.label}: ${item.value}`),
    ...(data.recommendations || []).map(
      (card) => `${card.title}\n${card.description}\n${card.url}`,
    ),
    actionUrl
      ? `${actionLabel}: ${actionUrl}`
      : "Sign in to your TLC account, or reply to your consultant for the next steps.",
    `With care,\n${data.consultantName || "Your TLC team"}`,
    template.note,
    `Contact: ${supportEmail} · ${phone}`,
    `TLC Holidays · ${postalAddress}`,
    marketing
      ? `You opted in to TLC email offers.\nUnsubscribe: ${unsubscribeUrl}${preferencesUrl ? `\nEmail preferences: ${preferencesUrl}` : ""}`
      : "This is a service message about your TLC account, enquiry or travel arrangements.",
  ]
    .filter(Boolean)
    .join("\n\n");
  if (new TextEncoder().encode(html).length > 95000)
    throw new Error("Email HTML is too large. Shorten the content.");
  const headers: Record<string, string> = {};
  if (marketing && unsubscribeUrl) {
    headers["List-Unsubscribe"] =
      `<${unsubscribeUrl.replace("/unsubscribe?", "/api/unsubscribe?")}>`;
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }
  return {
    templateId,
    version: EMAIL_DESIGN_VERSION,
    subject,
    preheader,
    html,
    text,
    headers,
  };
}
/** Provider-neutral payload for Firebase Trigger Email or an SMTP worker. Does not write or send. */
export function firebaseEmailDocument(to: string, email: RenderedEmail) {
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(to))
    throw new Error("A valid recipient email is required.");
  return {
    to: [to],
    message: {
      subject: email.subject,
      html: email.html,
      text: email.text,
      ...(Object.keys(email.headers).length ? { headers: email.headers } : {}),
    },
  };
}
