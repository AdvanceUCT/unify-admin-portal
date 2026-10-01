/** Shared Wallet Signature presentation. This module is pure and never sends email. */
export type EmailBlock =
  | { kind: "paragraph"; text: string }
  | { kind: "code"; value: string; expiry: string }
  | { kind: "action"; label: string; url: string; fallback?: string }
  | { kind: "notice"; text: string; label?: string; tone?: "neutral" | "attention" }
  | { kind: "metadata"; entries: readonly { label: string; value: string }[] };

export type EmailMessage = {
  subject: string;
  preview: string;
  category: string;
  heading: string;
  blocks: readonly EmailBlock[];
  footer: string;
};

export type RenderedEmail = { subject: string; html: string; text: string };

function escape(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function lines(value: string) { return escape(value).replace(/\r?\n/g, "<br />"); }

/** Absolute email dates must not depend on the server's deployment timezone. */
export function emailDate(value: Date | string) {
  return `${new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Johannesburg", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value))} SAST`;
}

function blockHtml(block: EmailBlock): string {
  switch (block.kind) {
    case "paragraph": return `<p style="margin:0 0 20px;line-height:26px;overflow-wrap:anywhere;word-break:break-word;">${lines(block.text)}</p>`;
    case "code": return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 24px;"><tr><td class="email-soft" align="center" bgcolor="#E1EEE7" style="padding:22px 12px 14px;border:1px solid #C0D4C6;border-radius:10px;"><p class="email-code" style="margin:0;font-family:Consolas,'Courier New',monospace;font-size:38px;line-height:48px;font-weight:bold;letter-spacing:5px;color:#123B31;">${escape(block.value)}</p><p class="email-muted" style="margin:10px 0 0;font-size:14px;line-height:22px;color:#53615B;">${lines(block.expiry)}</p></td></tr></table>`;
    case "action": return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 24px;"><tr><td bgcolor="#2F6E5A" align="center" style="border-radius:9px;mso-padding-alt:14px 20px;"><a class="email-button" href="${escape(block.url)}" style="display:block;padding:14px 20px;border-radius:9px;background-color:#2F6E5A;color:#FFFFFF;text-decoration:none;font-size:16px;font-weight:bold;line-height:22px;text-align:center;">${escape(block.label)}</a></td></tr></table><p class="email-muted" style="margin:0 0 8px;font-size:13px;line-height:21px;color:#53615B;">${lines(block.fallback ?? "If the button does not work, copy and open this link:")}</p><p style="margin:0 0 24px;font-size:13px;line-height:21px;overflow-wrap:anywhere;word-break:break-all;"><a class="email-link" href="${escape(block.url)}" style="color:#2F6E5A;text-decoration:underline;word-break:break-all;">${escape(block.url)}</a></p>`;
    case "notice": return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;"><tr><td class="${block.tone === "attention" ? "email-attention" : "email-soft"}" bgcolor="${block.tone === "attention" ? "#F8F0DF" : "#EEF5F0"}" style="padding:14px 16px;border-radius:6px;font-size:14px;line-height:23px;overflow-wrap:anywhere;word-break:break-word;">${block.label ? `<strong>${escape(block.label)}</strong><br />` : ""}${lines(block.text)}</td></tr></table>`;
    case "metadata": return `<table class="email-soft" role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#EEF5F0" style="margin:0 0 24px;border-radius:6px;font-size:14px;line-height:23px;">${block.entries.map(entry => `<tr><td valign="top" width="34%" style="padding:10px 12px;overflow-wrap:anywhere;word-break:break-word;"><strong>${escape(entry.label)}</strong></td><td valign="top" style="padding:10px 12px;overflow-wrap:anywhere;word-break:break-word;">${lines(entry.value)}</td></tr>`).join("")}</table>`;
  }
}

function blockText(block: EmailBlock): string {
  switch (block.kind) {
    case "paragraph": return block.text;
    case "code": return `${block.value}\n${block.expiry}`;
    case "action": return `${block.label}: ${block.url}\n${block.fallback ?? "If the button does not work, copy and open this link."}`;
    case "notice": return `${block.label ? `${block.label}: ` : ""}${block.text}`;
    case "metadata": return block.entries.map(entry => `${entry.label}: ${entry.value}`).join("\n");
  }
}

export function renderEmail(message: EmailMessage): RenderedEmail {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><meta name="color-scheme" content="light dark" /><meta name="supported-color-schemes" content="light dark" /><title>${escape(message.subject)}</title><style>body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}table{border-collapse:separate;mso-table-lspace:0pt;mso-table-rspace:0pt;}@media only screen and (max-width:600px){.email-outer{padding:12px 6px!important;}.email-padding{padding-left:22px!important;padding-right:22px!important;}.email-heading{font-size:28px!important;line-height:34px!important;}}@media(prefers-color-scheme:dark){.email-background{background-color:#0D1210!important;}.email-surface{background-color:#151C19!important;color:#F1F5F3!important;}.email-soft{background-color:#203B30!important;color:#F1F5F3!important;}.email-attention{background-color:#44351F!important;color:#F1F5F3!important;}.email-muted{color:#AAB6B0!important;}.email-code,.email-link{color:#A8D9C2!important;}.email-footer{border-color:#33403A!important;}}[data-ogsc] .email-surface{background-color:#151C19!important;color:#F1F5F3!important;}[data-ogsc] .email-soft{background-color:#203B30!important;color:#F1F5F3!important;}[data-ogsc] .email-attention{background-color:#44351F!important;color:#F1F5F3!important;}[data-ogsc] .email-muted{color:#AAB6B0!important;}[data-ogsc] .email-code,[data-ogsc] .email-link{color:#A8D9C2!important;}</style></head><body class="email-background" style="margin:0;padding:0;background-color:#F4F7F5;font-family:Arial,Helvetica,sans-serif;"><div style="display:none!important;visibility:hidden;opacity:0;height:0;width:0;max-height:0;max-width:0;overflow:hidden;mso-hide:all;">${escape(message.preview)}</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td class="email-outer" align="center" style="padding:32px 12px;"><!--[if mso]><table role="presentation" width="560" cellpadding="0" cellspacing="0"><tr><td><![endif]--><table class="email-surface" role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#FFFFFF" style="max-width:560px;background-color:#FFFFFF;color:#14201B;font-size:16px;line-height:26px;"><tr><td class="email-padding" bgcolor="#123B31" style="padding:30px 32px 12px;color:#FFFFFF;"><p style="margin:0;font-size:24px;line-height:30px;font-weight:bold;letter-spacing:3px;color:#FFFFFF;">UNIFY</p></td></tr><tr><td class="email-padding" bgcolor="#123B31" style="padding:14px 32px 30px;color:#FFFFFF;"><p style="margin:0 0 12px;font-size:11px;line-height:18px;font-weight:bold;letter-spacing:1.5px;color:#B9D9C8;">${escape(message.category)}</p><h1 class="email-heading" style="margin:0;font-size:30px;line-height:36px;font-weight:bold;letter-spacing:-0.5px;color:#FFFFFF;">${escape(message.heading)}</h1></td></tr><tr><td class="email-padding" style="padding:28px 32px 8px;">${message.blocks.map(blockHtml).join("")}</td></tr><tr><td class="email-padding email-footer email-muted" style="padding:20px 32px 24px;border-top:1px solid #D6DFDA;font-size:12px;line-height:20px;color:#53615B;"><strong>UNIFY</strong><br />${escape(message.footer)}</td></tr></table><!--[if mso]></td></tr></table><![endif]--></td></tr></table></body></html>`;
  return { subject: message.subject, html, text: ["UNIFY", message.heading, ...message.blocks.map(blockText), message.footer].join("\n\n") };
}
