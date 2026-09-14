# Student Portal

Multi-tenant SaaS for study-abroad agencies — each org (owner, admins, agents)
manages its own applicants, documents, and university communication behind
its own login, on shared infrastructure.

Live at [portal.arnayem.top](https://portal.arnayem.top).

## What it does

- **Applications** — student intake, self-serve public application links,
  per-org document and field requirements
- **Documents** — official document management (admission letters, JW/DQ
  visa forms, pre-admission letters), OCR-assisted upload via Tesseract.js
- **University portals** — per-account visibility grants, owner-controlled
- **Campaigns** — platform-level marketing campaigns to org signups, with
  HMAC-signed one-click unsubscribe
- **Billing & access** — timed trials, self-serve signup, per-org package
  tiers that gate ~25 granular features, suspension and expiry handling
- **Analytics** — visitor and per-org usage dashboards
- **Chatbot** — Gemini-powered widget on the public marketing pages
- **SUPER_DEVELOPER console** — cross-org platform operator view with
  impersonation, kept strictly separate from the per-org OWNER role

## Stack

Next.js 14 (App Router) · NextAuth (JWT sessions) · Prisma 5 + SQLite ·
Tailwind CSS · Google Gemini API · Tesseract.js (OCR) · Nodemailer

## Getting started

```bash
npm install
cp .env.example .env.local   # NEXTAUTH_SECRET, SMTP, Gemini API key
npx prisma db push
npm run dev
```

`NEXTAUTH_SECRET` is required — the app refuses to start without it rather
than falling back to a default.
