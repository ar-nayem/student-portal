import nodemailer from 'nodemailer'
import { prisma } from './prisma'

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER || 'nobiun@163.com',
    pass: process.env.EMAIL_PASS || '',
  },
})

const emailConfigured = !!process.env.EMAIL_PASS && process.env.EMAIL_PASS !== 'your_163_email_password_here'

// Always-on developer inbox — kept separate from the admin opt-in list below,
// since the developer should never be removable via the dashboard toggle.
const DEVELOPER_EMAIL = process.env.DEVELOPER_ALERT_EMAIL || '15329802848@163.com'

// organizationId scopes who hears about an event — a new student submission
// or status change at org B must never email org A's people. Pass null only
// for genuinely platform-level events with no specific org (falls back to
// the developer inbox alone).
async function getAlertRecipients(organizationId: string | null): Promise<string[]> {
  if (!organizationId) return [DEVELOPER_EMAIL]
  const recipients = new Set<string>()
  try {
    // A company can nominate its own alert inbox (info@, admissions@, a
    // shared team address) instead of whichever individual happens to hold
    // the OWNER login. When set it replaces the owner as the primary
    // recipient rather than adding to it — otherwise every alert would
    // duplicate to a personal address the company deliberately moved off.
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { alertEmail: true },
    })
    if (org?.alertEmail) {
      recipients.add(org.alertEmail)
    } else {
      const owner = await prisma.user.findFirst({
        where: { role: 'OWNER', organizationId },
        select: { email: true },
      })
      if (owner) recipients.add(owner.email)
    }
    const optedIn = await prisma.user.findMany({
      where: { receiveAlerts: true, isActive: true, organizationId },
      select: { email: true },
    })
    optedIn.forEach((u) => recipients.add(u.email))
  } catch (error) {
    console.error('Failed to load alert recipients:', error)
  }
  // Last resort only — an org with no alert address, no owner and nobody
  // opted in. Better the developer sees it than the alert vanishes.
  if (recipients.size === 0) recipients.add(DEVELOPER_EMAIL)
  return Array.from(recipients)
}

export async function sendNotification(subject: string, html: string, organizationId: string | null) {
  if (!emailConfigured) {
    // No real SMTP credentials set (e.g. local dev) — skip instead of failing login on every request.
    return
  }
  try {
    const to = await getAlertRecipients(organizationId)
    await transporter.sendMail({
      from: `"EDVUNO Portal" <${process.env.EMAIL_USER || 'nobiun@163.com'}>`,
      to,
      subject,
      html,
    })
  } catch (error) {
    console.error('Email send failed:', error)
  }
}

export interface SendResult {
  ok: boolean
  /** Why it failed, suitable for showing to the operator. */
  error?: string
  /** True when the address never left the building — malformed, or SMTP
   *  refused that specific recipient. Distinct from a transport failure. */
  invalid?: boolean
  /** True when no SMTP credentials are configured, so nothing was attempted. */
  skipped?: boolean
}

function looksLikeEmail(address: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address.trim())
}

// A readable plain-text fallback built from the HTML. Sending HTML with no
// text/plain part is one of the strongest spam signals there is, and some
// clients show this instead of the HTML.
export function htmlToText(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    // Keep link targets visible, since a text-only reader loses the anchor.
    .replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, '$2 ($1)')
    .replace(/<\/(p|div|tr|h[1-6]|li)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&middot;/g, '·')
    .replace(/&rarr;/g, '->')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n').map((l) => l.trim()).join('\n')
    .trim()
}

// Unlike sendNotification (fixed owner inbox), this sends to an arbitrary
// recipient — used for account-holder-facing mail like password resets.
//
// Returns a result rather than throwing: existing callers (password reset,
// trial welcome) ignore it and keep their previous fire-and-forget
// behaviour, while the campaign sender can report accurately instead of
// marking every address delivered. It previously swallowed every error,
// which is why an unroutable address still reported success.
export async function sendMail(
  to: string,
  subject: string,
  html: string,
  opts?: { headers?: Record<string, string>; replyTo?: string }
): Promise<SendResult> {
  // Address format is checked first: a malformed address is invalid whether
  // or not SMTP happens to be configured, and reporting it as a server
  // problem would send the operator looking in the wrong place.
  if (!looksLikeEmail(to)) return { ok: false, invalid: true, error: 'Not a valid email address' }
  if (!emailConfigured) return { ok: false, skipped: true, error: 'Email is not configured on this server' }

  try {
    const info = await transporter.sendMail({
      // All orgs currently send through this one shared mailbox (no
      // per-org SMTP yet), so the display name has to stay neutral rather
      // than naming any one tenant.
      from: `"EDVUNO Portal" <${process.env.EMAIL_USER || 'nobiun@163.com'}>`,
      to,
      subject,
      html,
      text: htmlToText(html),
      replyTo: opts?.replyTo,
      headers: opts?.headers,
    })

    // SMTP can accept the message but refuse an individual recipient, which
    // resolves rather than throwing — the case that made bad addresses look
    // delivered.
    const rejected = (info?.rejected || []) as string[]
    if (rejected.length > 0) {
      return { ok: false, invalid: true, error: `Mail server rejected ${rejected.join(', ')}` }
    }
    const accepted = (info?.accepted || []) as string[]
    if (accepted.length === 0) {
      return { ok: false, error: 'Mail server accepted no recipients' }
    }

    return { ok: true }
  } catch (error: any) {
    const message = String(error?.message || error)
    // 5xx replies are permanent: a bad mailbox, not a transient outage.
    const permanent = /\b5\d\d\b/.test(message) || /no such user|does not exist|invalid recipient|mailbox unavailable/i.test(message)
    console.error('Email send failed:', message)
    return { ok: false, invalid: permanent, error: message }
  }
}

export function passwordResetTemplate(name: string, code: string) {
  return `
    <h2>Reset your password</h2>
    <p>Hi ${name},</p>
    <p>Your password reset code is:</p>
    <p style="font-size: 32px; font-weight: bold; letter-spacing: 8px;">${code}</p>
    <p>Enter this code on the reset page to choose a new password. It expires in 15 minutes.</p>
    <p>If you didn't request this, you can safely ignore this email.</p>
  `
}

export function emailChangeVerificationTemplate(name: string, code: string) {
  return `
    <h2>Confirm your new email address</h2>
    <p>Hi ${name},</p>
    <p>Your verification code is:</p>
    <p style="font-size: 32px; font-weight: bold; letter-spacing: 8px;">${code}</p>
    <p>Enter this code on the portal to confirm this is your new login email. It expires in 15 minutes.</p>
    <p>If you didn't request this, you can safely ignore this email — your account email won't change.</p>
  `
}

export function taskAssignedTemplate(adminName: string, taskTitle: string, dueAt: Date, description: string | null, assignedByName: string) {
  return `
    <h2>New task assigned to you</h2>
    <p>Hi ${adminName},</p>
    <p><strong>${taskTitle}</strong></p>
    ${description ? `<p>${description}</p>` : ''}
    <p><strong>Due:</strong> ${dueAt.toLocaleString()}</p>
    <p><strong>Assigned by:</strong> ${assignedByName}</p>
    <p>Log in to the portal's Tasks page to mark it complete once done.</p>
  `
}

export function taskCompletedTemplate(adminName: string, taskTitle: string, completedAt: Date) {
  return `
    <h2>Task completed</h2>
    <p><strong>${adminName}</strong> marked the following task complete:</p>
    <p><strong>${taskTitle}</strong></p>
    <p><strong>Completed:</strong> ${completedAt.toLocaleString()}</p>
  `
}

export function taskOverdueTemplate(adminName: string, taskTitle: string, dueAt: Date) {
  return `
    <h2>Task not completed</h2>
    <p>The deadline passed and <strong>${adminName}</strong> has not marked this task complete:</p>
    <p><strong>${taskTitle}</strong></p>
    <p><strong>Was due:</strong> ${dueAt.toLocaleString()}</p>
  `
}

export function agentSignupTemplate(name: string, email: string) {
  return `
    <h2>New Agent Signup</h2>
    <p><strong>Name:</strong> ${name}</p>
    <p><strong>Email:</strong> ${email}</p>
    <p>This account is inactive until approved. Log in to the Agents page to activate it.</p>
  `
}

export function studentSubmissionTemplate(agentName: string, studentName: string) {
  return `
    <h2>New Student Submission</h2>
    <p><strong>Agent:</strong> ${agentName}</p>
    <p><strong>Student:</strong> ${studentName}</p>
    <p>Please log in to the admin dashboard to review this submission.</p>
  `
}

export function statusUpdateTemplate(studentName: string, status: string, adminName: string) {
  return `
    <h2>Student Status Updated</h2>
    <p><strong>Student:</strong> ${studentName}</p>
    <p><strong>Status:</strong> ${status}</p>
    <p><strong>Updated by:</strong> ${adminName}</p>
  `
}

// ---------------------------------------------------------------------------
// Account lifecycle mail (welcome / expiry reminder / expired). Sent to the
// organization's own alert address via sendNotification, never to a shared
// developer inbox.
// ---------------------------------------------------------------------------

const LIFECYCLE_WRAP = (inner: string) => `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.65;color:#1e293b;max-width:560px;">
    ${inner}
    <p style="margin:24px 0 0;font-size:13px;color:#64748b;">
      — EDVUNO Portal &middot;
      <a href="https://portal.edvuno.top" style="color:#166B55;text-decoration:none;">portal.edvuno.top</a>
    </p>
  </div>
`

const LIFECYCLE_BUTTON = (label: string, href: string) => `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;">
    <tr><td bgcolor="#166B55" style="border-radius:10px;">
      <a href="${href}" style="display:inline-block;padding:13px 26px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">${label}</a>
    </td></tr>
  </table>
`

export function orgWelcomeTemplate(orgName: string, expiresAt: Date | null, loginUrl: string) {
  const window = expiresAt
    ? `<p style="margin:0 0 16px;">Your access runs until <strong>${expiresAt.toDateString()}</strong>.</p>`
    : ''
  return LIFECYCLE_WRAP(`
    <h2 style="margin:0 0 14px;font-size:21px;color:#0f172a;">${orgName} is active</h2>
    <p style="margin:0 0 16px;">Your account is switched on and your team can sign in now.</p>
    ${window}
    <p style="margin:0 0 16px;">A good first step is to add your team from <strong>Manage Accounts</strong>,
    then set which documents students must upload under <strong>Doc Requirements</strong>.</p>
    ${LIFECYCLE_BUTTON('Sign in', loginUrl)}
    <p style="margin:0;">Reply to this email if you need a hand getting set up.</p>
  `)
}

export function expiryReminderTemplate(orgName: string, daysLeft: number, expiresAt: Date, isTrial: boolean) {
  const what = isTrial ? 'trial' : 'subscription'
  return LIFECYCLE_WRAP(`
    <h2 style="margin:0 0 14px;font-size:21px;color:#0f172a;">Your ${what} ends in ${daysLeft} ${daysLeft === 1 ? 'day' : 'days'}</h2>
    <p style="margin:0 0 16px;">Hi — <strong>${orgName}</strong>'s ${what} runs out on
    <strong>${expiresAt.toDateString()}</strong>.</p>
    <p style="margin:0 0 16px;">Nothing is deleted when it ends: your students, documents and records
    stay exactly where they are. You just won't be able to sign in until it's renewed.</p>
    <p style="margin:0 0 16px;">Reply to this email to continue and we'll sort it out.</p>
  `)
}

export function expiredTemplate(orgName: string, expiresAt: Date, isTrial: boolean) {
  const what = isTrial ? 'trial' : 'subscription'
  return LIFECYCLE_WRAP(`
    <h2 style="margin:0 0 14px;font-size:21px;color:#0f172a;">Your ${what} has ended</h2>
    <p style="margin:0 0 16px;"><strong>${orgName}</strong>'s ${what} ended on
    <strong>${expiresAt.toDateString()}</strong>, so sign-in is paused for now.</p>
    <p style="margin:0 0 16px;"><strong>Your data is safe.</strong> Every student, document and
    transaction is exactly as you left it, and comes straight back the moment you renew.</p>
    <p style="margin:0 0 16px;">Reply to this email to pick up where you left off.</p>
  `)
}
