# University Offers Directory Implementation Plan

> **For agentic workers:** Execute this plan task-by-task with independent review between the data/API, portal UI, and public-site portions. Do not deploy until fresh database and static-site backups are verified.

**Goal:** Let admins publish anonymous or identified university offers from the portal and expose only selected offer fields on `edvuno.top` with combined filters.

**Architecture:** Add a new tenant-scoped `AdmissionOffer` model separate from existing chatbot promotions. Return a public allowlisted projection through the existing proxied `/api/public/site-content` response, then render it on the existing static site's Offers page. Track the static site source in `edvuno-site/` so both halves of the integration are versioned together.

**Tech Stack:** Next.js 14 App Router, Prisma 5, SQLite, vanilla JavaScript/CSS static site, existing Nginx same-origin proxy.

**Spec:** `docs/superpowers/specs/2026-11-18-university-offers-directory-design.md`

## Global Constraints

- Store and display fees in RMB.
- Tuition period is semester or year; hostel period is month, semester, or year; stipend is monthly.
- University name and exact location are hidden by default.
- Hidden fields are omitted from public JSON and excluded from public filters.
- Only `OWNER` and `ADMIN` can manage offers, and every management query is organization-scoped.
- Keep promotional offers and their existing chatbot behavior unchanged.
- Keep the existing `items` property and behavior of `/api/public/site-content`.
- Never expose internal notes, actor IDs, or organization IDs in the public feed.
- Do not deploy until fresh production database and website-source backups are in `/Volumes/Extra/backup/`.

---

### Task 1: Track the current public-site source

**Files:**
- Create: `edvuno-site/index.html`
- Create: `edvuno-site/app.js`
- Create: `edvuno-site/cms.js`
- Create: `edvuno-site/agency.js`
- Create: `edvuno-site/styles.css`
- Create: `edvuno-site/agency.css`
- Create: `edvuno-site/assets/**`

- [x] Copy the deployed static site release from `/var/www/edvuno.top/current` into `edvuno-site/` without changing the VPS.
- [x] Confirm the copied files contain no server secrets or generated private data.
- [x] Record the current deployed release identifier: `20261102-cms`.

### Task 2: Add admission-offer schema and safe API

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `src/app/api/admission-offers/route.ts`
- Create: `src/app/api/admission-offers/[id]/route.ts`
- Modify: `src/app/api/public/site-content/route.ts`
- Create: `src/lib/admissionOffers.ts`

- [x] Add organization-scoped offer fields, lifecycle state, fee periods, age range, stipend range, and explicit public visibility switches.
- [x] Add owner/admin CRUD with strict validation, same-organization scope, the existing EDVUNO website publisher grant, and no client-supplied actor or tenant IDs.
- [x] Add a public serializer that returns only currently published offers from publisher-granted organizations and only allowlisted visible fields.
- [x] Add sanitized `admissionOffers` to the existing public site-content response without changing `items`.
- [ ] Rehearse the additive schema update on a fresh local copy of the database and preserve all existing row counts and student assignments.

### Task 3: Add the portal management section

**Files:**
- Create: `src/app/dashboard/admission-offers/page.tsx`
- Modify: portal navigation component and role-aware menu entries
- Modify: `src/lib/i18n/dictionaries/**` if dashboard language dictionaries apply

- [x] Add create/edit forms for internal university, public title/description, city, program/intake, age, tuition, hostel, stipend, visibility, status, and publication dates.
- [x] Label all amounts as RMB and show the selected period next to each field.
- [x] Default identity fields to hidden and warn when public text may identify the university.
- [x] Keep the current `/dashboard/offers` promotional-offer page unchanged.

### Task 4: Render the directory on `edvuno.top`

**Files:**
- Modify: `edvuno-site/cms.js`
- Modify: `edvuno-site/app.js` and/or `edvuno-site/agency.js` only where current Offers page bootstrapping requires it
- Modify: `edvuno-site/agency.css` and `edvuno-site/styles.css`

- [x] Render published offers on the existing Offers page with no university identity fields when hidden.
- [x] Implement combined city, program, age, tuition-range/period, hostel-range/period, and monthly-stipend filters.
- [x] Hide a filter dimension when no public offer exposes that value; do not infer hidden values.
- [x] Add responsive filter controls, reset behavior, result counts, no-results state, and readable RMB period labels.
- [x] Keep legacy CMS `OFFER` content visible only as editorial cards if present; do not mix it into structured admission filters.

### Task 5: Review, verify, and prepare rollout

- [x] Check tenant isolation, public allowlist serialization, and field visibility behavior by code inspection.
- [x] Run the production build and Prisma validation; do not add or run automated tests unless separately requested.
- [ ] Take a fresh production database, current uploads/storage, Nginx config, and `edvuno.top/current` backup to `/Volumes/Extra/backup/` immediately before rollout.
- [ ] Apply Prisma update while the portal is paused, deploy/restart portal, then publish static files to a new site release and switch `current`.
- [ ] Verify `portal.arnayem.top` and `edvuno.top`, retain the pre-deploy backups, and compare existing student/document/transaction counts and agent assignments.
