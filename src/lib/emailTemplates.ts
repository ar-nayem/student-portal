// Ready-made campaign bodies. Everything here is written the way email
// clients need it — table layout, inline styles, no images — because Gmail
// and QQ Mail strip <style> blocks and Outlook ignores flex/grid. Editing
// these in the visual composer keeps the inline styles intact.
export interface EmailTemplate {
  id: string
  name: string
  description: string
  subject: string
  html: string
}

const BRAND = '#166B55'

// Buttons are padded anchors inside a bgcolor table cell — the portable
// pattern that still renders as a button in Outlook.
function button(label: string, href: string, bg = BRAND, color = '#ffffff') {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;"><tr><td bgcolor="${bg}" style="border-radius:10px;"><a href="${href}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;color:${color};text-decoration:none;border-radius:10px;">${label}</a></td></tr></table>`
}

const FEATURE_ROWS = [
  ['#166B55', 'University portals, checked automatically', 'Connect the portals you already use. Get an email the moment a status changes, instead of logging in to look.'],
  ['#65CDA5', 'Students upload their own documents', "Send one link. You decide what's required; you see at a glance what's still missing."],
  ['#0ea5e9', 'One record per applicant', 'Passport, education, work history, family, sponsors and every file — not eleven spreadsheet tabs.'],
  ['#059669', 'Money tracked per student', 'Income, expenses, printable receipts, and an export whenever your accountant asks.'],
  ['#d97706', 'Your team, properly separated', 'Agents see their own students. You see everything. Sensitive documents stay restricted.'],
]
  .map(
    ([colour, title, copy]) =>
      `<tr><td style="padding-bottom:16px;border-left:3px solid ${colour};padding-left:14px;"><div style="font-size:15px;font-weight:700;color:#0f172a;margin-bottom:3px;">${title}</div><div style="font-size:14px;line-height:1.55;color:#64748b;">${copy}</div></td></tr>`
  )
  .join('')

const LAUNCH = `<div style="background:#f1f5f9;padding:24px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;">
<tr><td style="background:${BRAND};padding:22px 32px;">
<a href="https://portal.edvuno.top" style="text-decoration:none;color:#ffffff;font-size:19px;font-weight:700;">EDVUNO Portal</a>
<div style="color:#c7d2fe;font-size:12px;letter-spacing:1.2px;text-transform:uppercase;margin-top:3px;">For study-abroad agencies</div>
</td></tr>
<tr><td style="padding:36px 32px 8px;">
<div style="display:inline-block;background:#eef2ff;color:#4338ca;font-size:12px;font-weight:700;padding:6px 12px;border-radius:99px;margin-bottom:18px;">7-DAY FREE TRIAL &middot; NO CARD REQUIRED</div>
<h1 style="margin:0 0 14px;font-size:29px;line-height:1.2;color:#0f172a;font-weight:700;">Run {{organization}}<br>from one place</h1>
<p style="margin:0 0 26px;font-size:16px;line-height:1.6;color:#475569;">Hi {{firstName}} — how many university portals did your team log into this week, just to check whether a student's status changed? EDVUNO Portal does that for you, along with documents, applications, finance and your team.</p>
</td></tr>
<tr><td style="padding:0 32px 30px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td bgcolor="${BRAND}" style="border-radius:10px;"><a href="https://portal.edvuno.top/signup" style="display:inline-block;padding:14px 26px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">Sign up free &rarr;</a></td>
<td style="width:12px;">&nbsp;</td>
<td bgcolor="#ffffff" style="border-radius:10px;border:1px solid #cbd5e1;"><a href="https://portal.edvuno.top" style="display:inline-block;padding:13px 24px;font-size:15px;font-weight:600;color:#334155;text-decoration:none;border-radius:10px;">See everything it does</a></td>
</tr></table>
</td></tr>
<tr><td style="padding:0 32px;"><div style="height:1px;background:#e2e8f0;"></div></td></tr>
<tr><td style="padding:28px 32px 4px;">
<div style="font-size:12px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:#64748b;margin-bottom:18px;">What you get</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${FEATURE_ROWS}</table>
</td></tr>
<tr><td style="padding:0 32px 34px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f8fafc;border-radius:12px;"><tr><td style="padding:26px 24px;text-align:center;">
<div style="font-size:17px;font-weight:700;color:#0f172a;margin-bottom:6px;">Try it with your real applicants</div>
<div style="font-size:14px;line-height:1.6;color:#64748b;margin-bottom:20px;">7 days, full access, no card. If it doesn't fit how you work, walk away — and take your data with you.</div>
${button('Create your free account', 'https://portal.edvuno.top/signup')}
<div style="font-size:13px;color:#94a3b8;margin-top:16px;">Prefer to look around first? <a href="https://portal.edvuno.top" style="color:${BRAND};">Visit the site</a></div>
</td></tr></table>
</td></tr>
<tr><td style="background:#0f172a;padding:24px 32px;">
<div style="font-size:14px;color:#e2e8f0;margin-bottom:6px;">Questions? Just reply to this email — it comes straight to me.</div>
<div style="font-size:13px;color:#94a3b8;">EDVUNO &middot; <a href="https://portal.edvuno.top" style="color:#65CDA5;text-decoration:none;">portal.edvuno.top</a></div>
</td></tr>
</table></div>`

const UPDATE = `<div style="background:#f1f5f9;padding:24px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;">
<tr><td style="background:${BRAND};padding:20px 32px;">
<a href="https://portal.edvuno.top" style="text-decoration:none;color:#ffffff;font-size:18px;font-weight:700;">EDVUNO Portal</a>
</td></tr>
<tr><td style="padding:32px 32px 10px;">
<div style="display:inline-block;background:#ecfdf5;color:#047857;font-size:12px;font-weight:700;padding:6px 12px;border-radius:99px;margin-bottom:16px;">NEW</div>
<h1 style="margin:0 0 14px;font-size:25px;line-height:1.25;color:#0f172a;font-weight:700;">What's new this month</h1>
<p style="margin:0 0 18px;font-size:15px;line-height:1.65;color:#475569;">Hi {{firstName}}, a few things landed in {{organization}}'s portal that should save you time.</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
<tr><td style="padding-bottom:14px;border-left:3px solid ${BRAND};padding-left:14px;"><div style="font-size:15px;font-weight:700;color:#0f172a;margin-bottom:3px;">First feature</div><div style="font-size:14px;line-height:1.55;color:#64748b;">Say what changed and why it matters in one sentence.</div></td></tr>
<tr><td style="padding-bottom:14px;border-left:3px solid #059669;padding-left:14px;"><div style="font-size:15px;font-weight:700;color:#0f172a;margin-bottom:3px;">Second feature</div><div style="font-size:14px;line-height:1.55;color:#64748b;">Keep each one short — people skim these.</div></td></tr>
</table>
</td></tr>
<tr><td style="padding:14px 32px 34px;text-align:center;">${button('Open your portal', 'https://portal.edvuno.top/login')}</td></tr>
<tr><td style="background:#0f172a;padding:20px 32px;">
<div style="font-size:13px;color:#94a3b8;">EDVUNO &middot; <a href="https://portal.edvuno.top" style="color:#65CDA5;text-decoration:none;">portal.edvuno.top</a></div>
</td></tr>
</table></div>`

const PLAIN = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.65;color:#1e293b;max-width:560px;">
<p style="margin:0 0 16px;">Hi {{firstName}},</p>
<p style="margin:0 0 16px;">Write your message here. A plain note like this often gets a better reply rate than a designed one — it reads like a person wrote it.</p>
<p style="margin:0 0 16px;">Just reply if you'd like me to walk you through it.</p>
<p style="margin:0;">— EDVUNO<br><a href="https://portal.edvuno.top" style="color:${BRAND};text-decoration:none;">portal.edvuno.top</a></p>
</div>`

export const EMAIL_TEMPLATES: EmailTemplate[] = [
  {
    id: 'launch',
    name: 'Product launch',
    description: 'Full designed pitch with features and trial call-to-action',
    subject: '{{firstName}}, a question about {{organization}}',
    html: LAUNCH,
  },
  {
    id: 'update',
    name: 'Feature update',
    description: 'Short "what\'s new" note for existing customers',
    subject: "What's new in EDVUNO Portal",
    html: UPDATE,
  },
  {
    id: 'plain',
    name: 'Plain personal note',
    description: 'Looks hand-written — usually the best reply rate',
    subject: 'Quick question, {{firstName}}',
    html: PLAIN,
  },
]
