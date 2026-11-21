// Shapes and rules for creating WhatsApp message templates (Admin → WhatsApp → Templates).
// Shared by the builder (client) and the server action, so both check the same rules.
// Meta's limits: https://developers.facebook.com/docs/whatsapp/business-management-api/message-templates

export type TemplateCategory = "MARKETING" | "UTILITY" | "AUTHENTICATION";
export type MediaFormat = "IMAGE" | "VIDEO" | "DOCUMENT";

/** Static buttons only: broadcasts don't fill button variables (dynamic links, coupon codes). */
export type TemplateButton =
  | { type: "QUICK_REPLY"; text: string }
  | { type: "URL"; text: string; url: string }
  | { type: "PHONE_NUMBER"; text: string; phone: string };

export type TemplateDraft = {
  name: string;
  /** e.g. en, en_US, hi, kn */
  language: string;
  category: TemplateCategory;
  header:
    | { format: "NONE" }
    | { format: "TEXT"; text: string; example: string }
    /** `handle` comes from uploadTemplateSample(); Meta needs a sample file to review. */
    | { format: MediaFormat; handle: string; fileName?: string };
  body: string;
  /** Sample value for each {{n}} in the body, in order. */
  bodyExamples: string[];
  footer: string;
  buttons: TemplateButton[];
  /** AUTHENTICATION only: Meta writes the text itself. */
  auth?: { securityRecommendation: boolean; expiryMinutes: number | null; buttonText: string };
};

export const LANGUAGES: { value: string; label: string }[] = [
  { value: "en", label: "English" },
  { value: "en_US", label: "English (US)" },
  { value: "en_GB", label: "English (UK)" },
  { value: "hi", label: "Hindi" },
  { value: "kn", label: "Kannada" },
  { value: "ta", label: "Tamil" },
  { value: "te", label: "Telugu" },
  { value: "ml", label: "Malayalam" },
  { value: "mr", label: "Marathi" },
  { value: "gu", label: "Gujarati" },
  { value: "bn", label: "Bengali" },
  { value: "pa", label: "Punjabi" },
  { value: "ur", label: "Urdu" },
];

export const LIMITS = { name: 512, headerText: 60, body: 1024, footer: 60, buttonText: 25, buttons: 10, urlButtons: 2, phoneButtons: 1, url: 2000 } as const;

/** The {{n}} numbers used in a text, in order of appearance. */
export function variablesIn(text: string): number[] {
  return [...text.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) => Number(m[1]));
}

/** Problems Meta would reject the template for, in plain words. Empty when it's fine. */
export function templateProblems(d: TemplateDraft): string[] {
  const p: string[] = [];
  if (!/^[a-z0-9_]+$/.test(d.name)) p.push("Name: only lowercase letters, numbers and _ (e.g. new_listing_alert).");
  if (d.name.length > LIMITS.name) p.push("Name is too long.");
  if (!/^[a-z]{2,3}(_[A-Z]{2})?$/.test(d.language)) p.push("Choose a language.");

  if (d.category === "AUTHENTICATION") {
    const e = d.auth?.expiryMinutes;
    if (e != null && (e < 1 || e > 90)) p.push("Code expiry must be between 1 and 90 minutes.");
    if (d.auth?.buttonText && d.auth.buttonText.length > LIMITS.buttonText) p.push(`Button text: at most ${LIMITS.buttonText} characters.`);
    return p;
  }

  if (d.header.format === "TEXT") {
    const vars = variablesIn(d.header.text);
    if (!d.header.text.trim()) p.push("Header text is empty. Choose 'None' for no header.");
    if (d.header.text.length > LIMITS.headerText) p.push(`Header: at most ${LIMITS.headerText} characters.`);
    if (vars.length > 1 || vars.some((v) => v !== 1)) p.push("Header can have only one variable, {{1}}.");
    if (vars.length && !d.header.example.trim()) p.push("Give a sample value for the header's {{1}}.");
  } else if (d.header.format !== "NONE" && !d.header.handle) {
    p.push(`Upload a sample ${d.header.format.toLowerCase()} for the header.`);
  }

  const body = d.body.trim();
  if (!body) p.push("Body text is required.");
  if (d.body.length > LIMITS.body) p.push(`Body: at most ${LIMITS.body} characters.`);
  const vars = variablesIn(d.body);
  const unique = [...new Set(vars)].sort((a, b) => a - b);
  if (unique.some((v, i) => v !== i + 1)) p.push("Body variables must be numbered in order: {{1}}, {{2}}, {{3}}…");
  if (/^\{\{\s*\d+\s*\}\}/.test(body) || /\{\{\s*\d+\s*\}\}[.!?]?$/.test(body)) p.push("Body can't start or end with a variable. Add some words before / after it.");
  if (/\{\{\s*\d+\s*\}\}\s*\{\{\s*\d+\s*\}\}/.test(body)) p.push("Two variables can't be next to each other.");
  unique.forEach((v) => {
    if (!d.bodyExamples[v - 1]?.trim()) p.push(`Give a sample value for {{${v}}}.`);
  });
  if (unique.length && body.replace(/\{\{\s*\d+\s*\}\}/g, "").trim().split(/\s+/).length < unique.length * 2 + 1) {
    p.push("Too many variables for this much text. Meta rejects templates that are mostly variables.");
  }
  if (/\n{3,}/.test(d.body)) p.push("Body can't have more than one empty line in a row.");

  if (d.footer.length > LIMITS.footer) p.push(`Footer: at most ${LIMITS.footer} characters.`);
  if (variablesIn(d.footer).length) p.push("Footer can't have variables.");

  if (d.buttons.length > LIMITS.buttons) p.push(`At most ${LIMITS.buttons} buttons.`);
  if (d.buttons.filter((b) => b.type === "URL").length > LIMITS.urlButtons) p.push(`At most ${LIMITS.urlButtons} website buttons.`);
  if (d.buttons.filter((b) => b.type === "PHONE_NUMBER").length > LIMITS.phoneButtons) p.push("At most one call button.");
  d.buttons.forEach((b, i) => {
    const n = `Button ${i + 1}`;
    if (!b.text.trim()) p.push(`${n}: text is required.`);
    if (b.text.length > LIMITS.buttonText) p.push(`${n}: at most ${LIMITS.buttonText} characters.`);
    if (b.type === "URL" && !/^https?:\/\/[^\s{}]+$/.test(b.url)) p.push(`${n}: a full link like https://brixora.in/properties (no variables).`);
    if (b.type === "PHONE_NUMBER" && !/^\+?\d{10,15}$/.test(b.phone.replace(/[\s-]/g, ""))) p.push(`${n}: phone number with country code, e.g. +91 98450 12345.`);
  });
  // Meta: quick replies must be grouped together, not mixed between other buttons.
  const kinds = d.buttons.map((b) => (b.type === "QUICK_REPLY" ? "q" : "c")).join("");
  if (/q+c+q+|c+q+c+/.test(kinds)) p.push("Keep quick-reply buttons together (all before or all after the other buttons).");
  return p;
}

/** The Graph API `components` for a draft. */
export function toMetaComponents(d: TemplateDraft): unknown[] {
  if (d.category === "AUTHENTICATION") {
    const out: unknown[] = [{ type: "BODY", add_security_recommendation: d.auth?.securityRecommendation ?? true }];
    if (d.auth?.expiryMinutes) out.push({ type: "FOOTER", code_expiration_minutes: d.auth.expiryMinutes });
    out.push({ type: "BUTTONS", buttons: [{ type: "OTP", otp_type: "COPY_CODE", text: d.auth?.buttonText?.trim() || "Copy code" }] });
    return out;
  }
  const out: unknown[] = [];
  if (d.header.format === "TEXT") {
    out.push({
      type: "HEADER",
      format: "TEXT",
      text: d.header.text.trim(),
      ...(variablesIn(d.header.text).length ? { example: { header_text: [d.header.example.trim()] } } : {}),
    });
  } else if (d.header.format !== "NONE") {
    out.push({ type: "HEADER", format: d.header.format, example: { header_handle: [d.header.handle] } });
  }
  const count = new Set(variablesIn(d.body)).size;
  out.push({
    type: "BODY",
    text: d.body.trim(),
    ...(count ? { example: { body_text: [d.bodyExamples.slice(0, count).map((s) => s.trim())] } } : {}),
  });
  if (d.footer.trim()) out.push({ type: "FOOTER", text: d.footer.trim() });
  if (d.buttons.length) {
    out.push({
      type: "BUTTONS",
      buttons: d.buttons.map((b) =>
        b.type === "QUICK_REPLY"
          ? { type: "QUICK_REPLY", text: b.text.trim() }
          : b.type === "URL"
            ? { type: "URL", text: b.text.trim(), url: b.url.trim() }
            : { type: "PHONE_NUMBER", text: b.text.trim(), phone_number: `+${b.phone.replace(/\D/g, "")}` },
      ),
    });
  }
  return out;
}

/**
 * A ready, Meta-approvable template for each website message (TEMPLATES in lib/whatsapp),
 * keyed by its key. The body's {{n}} follow that message's `params` in order, with the
 * `sample` values as examples. Used by the builder's "?for=<key>" (Settings → WhatsApp
 * templates → Create in Meta). Utility links stay in the body: button links can't be filled.
 */
export const SUGGESTED_TEMPLATES: Record<string, Omit<TemplateDraft, "language">> = {
  otp_login: {
    name: "otp_login",
    category: "AUTHENTICATION",
    header: { format: "NONE" },
    body: "",
    bodyExamples: [],
    footer: "",
    buttons: [],
    auth: { securityRecommendation: true, expiryMinutes: 5, buttonText: "Copy code" },
  },
  welcome: {
    name: "brixora_welcome",
    category: "MARKETING",
    header: { format: "TEXT", text: "Welcome to Brixora", example: "" },
    body:
      "Hi there, welcome to Brixora! 🏡 We're glad to have you with us.\n\n" +
      "With Brixora you can:\n" +
      "• Browse verified property listings\n" +
      "• Post your own property for sale or rent\n" +
      "• Get replies to your enquiries right here on WhatsApp\n\n" +
      "Your login code follows in the next message.",
    bodyExamples: [],
    footer: "Reply STOP to opt out",
    buttons: [{ type: "URL", text: "Visit Brixora", url: "https://brixora.in" }],
  },
  submission_received: {
    name: "submission_received",
    category: "UTILITY",
    header: { format: "NONE" },
    body: "Hi {{1}}, thank you for posting your property with Brixora. Your reference number is {{2}}.\n\nOur team will review the listing and let you know here as soon as it's live.",
    bodyExamples: ["Ravi", "BRX-2026-0042"],
    footer: "Brixora",
    buttons: [],
  },
  listing_approved: {
    name: "listing_approved",
    category: "UTILITY",
    header: { format: "NONE" },
    body: "Good news! Your property {{1}} has been approved and is now live on Brixora.\n\nView your listing here: {{2}}\n\nWe'll message you here as soon as buyers start enquiring.",
    bodyExamples: ["BRX-2026-0042", "https://brixora.in/properties/BRX-2026-0042"],
    footer: "Brixora",
    buttons: [],
  },
  listing_rejected: {
    name: "listing_rejected",
    category: "UTILITY",
    header: { format: "NONE" },
    body: "We reviewed your property {{1}} and couldn't approve it yet.\n\nReason: {{2}}\n\nPlease update the listing and submit it again, or reply to this message if you need any help.",
    bodyExamples: ["BRX-2026-0042", "Photos are not clear"],
    footer: "Brixora",
    buttons: [],
  },
  change_received: {
    name: "change_received",
    category: "UTILITY",
    header: { format: "NONE" },
    body: "We've received your change request for property {{1}}: {{2}}.\n\nOur team will review it and update you here shortly.",
    bodyExamples: ["BRX-2026-0042", "Price change"],
    footer: "Brixora",
    buttons: [],
  },
  change_approved: {
    name: "change_approved",
    category: "UTILITY",
    header: { format: "NONE" },
    body: "Your change request for property {{1}} has been approved: {{2}}.\n\nThe update is now live on your Brixora listing.",
    bodyExamples: ["BRX-2026-0042", "Price change"],
    footer: "Brixora",
    buttons: [],
  },
  change_rejected: {
    name: "change_rejected",
    category: "UTILITY",
    header: { format: "NONE" },
    body: "We couldn't approve your change request for property {{1}} ({{2}}).\n\nReason: {{3}}\n\nYour listing stays as it was. Reply to this message if you have any questions.",
    bodyExamples: ["BRX-2026-0042", "Price change", "Price is outside the market range"],
    footer: "Brixora",
    buttons: [],
  },
  sold_confirmed: {
    name: "sold_confirmed",
    category: "UTILITY",
    header: { format: "NONE" },
    body: "Congratulations! Your property {{1}} has been marked as sold and removed from the Brixora listings.\n\nThank you for choosing Brixora, and all the best for what's next.",
    bodyExamples: ["BRX-2026-0042"],
    footer: "Brixora",
    buttons: [],
  },
  enquiry_forward: {
    name: "enquiry_forward",
    category: "UTILITY",
    header: { format: "NONE" },
    body: "New enquiry for property {{1}}.\n\nName: {{2}}\nPhone: {{3}}\nMessage: {{4}}\n\nOpen the enquiry: {{5}}\n\nPlease reply to the customer as soon as you can.",
    bodyExamples: ["BRX-2026-0042", "Anita", "+91 98450 12345", "Is this still available?", "https://brixora.in/properties/BRX-2026-0042"],
    footer: "Brixora",
    buttons: [],
  },
  enquiry_reply: {
    name: "enquiry_reply",
    category: "UTILITY",
    header: { format: "NONE" },
    body: "Hi {{1}}, the Brixora team has replied to your enquiry about property {{2}}.\n\nRead the reply here: {{3}}\n\nYou can continue the conversation from your Brixora account.",
    bodyExamples: ["Anita", "BRX-2026-0042", "https://brixora.in/account/enquiries"],
    footer: "Brixora",
    buttons: [],
  },
  site_visit_scheduled: {
    name: "site_visit_scheduled",
    category: "UTILITY",
    header: { format: "NONE" },
    body: "Your site visit for property {{1}} is confirmed for {{2}}.\n\nOur team will share the location and contact details before the visit. Reply here if you need to reschedule.",
    bodyExamples: ["BRX-2026-0042", "12 Nov 2026, 11:00 AM"],
    footer: "Brixora",
    buttons: [],
  },
  staff_invite: {
    name: "staff_invite",
    category: "UTILITY",
    header: { format: "NONE" },
    body: "Hi {{1}}, you've been invited to join the Brixora team.\n\nSet your password and sign in here: {{2}}\n\nThis link is just for you, so please don't share it.",
    bodyExamples: ["Priya", "https://brixora.in/admin/forgot-password"],
    footer: "Brixora",
    buttons: [],
  },
};
