# University Offers Directory Design

## Goal

Let portal administrators maintain university admission offers in RMB and publish a privacy-filtered directory on `edvuno.top` where visitors can combine filters to find suitable offers.

## Existing system

- The portal already has `/dashboard/offers` and `/api/offers`, which manage promotional offers for the portal chatbot. This workflow remains separate.
- `edvuno.top` is a static site served from `/var/www/edvuno.top/current`; its source is not currently tracked in the portal repository.
- The static site's Offers page already loads published content from `/api/public/site-content`. Nginx proxies that exact path to the portal, so the directory feed can extend the existing response without a new cross-origin endpoint or Nginx route.

## Data and portal workflow

Add an organization-scoped `AdmissionOffer` record with private university name and exact location; public title and description; city; program and optional intake; optional minimum/maximum age; tuition minimum/maximum in RMB and a period of semester or year; hostel minimum/maximum in RMB and a period of month, semester, or year; and optional monthly stipend minimum/maximum in RMB. Records have draft, published, and archived states, plus optional start/end dates. Admin/owner users can create, edit, publish, archive, or delete offers for their own organization.

Each offer has field visibility controls. University name and exact location default to hidden. City, program, age, tuition, hostel, and stipend default to visible but can also be hidden. Public title and description are curated separately from private internal fields. Hidden data is omitted from the public API response, and hidden fields are not used by public filters. Since the directory appears on EDVUNO's central website, offer management also requires the existing EDVUNO website publisher grant; offers stay scoped to the editor's active organization.

## Public website

Track the current static website files under `edvuno-site/` in this repository. Keep its existing Offers navigation and replace the current generic offer-directory behavior with published admission offers. Show public title, description, and enabled fields only. Visitors can combine city, program, age, tuition amount plus period, hostel amount plus period, and stipend filters; active filters intersect. Use RMB and display each fee period clearly. Empty, loading, and no-match states are included. The rest of the site's existing CMS content and routes continue to work.

The portal's existing `/api/public/site-content` response keeps its current `items` property and adds a sanitized `admissionOffers` property. Only published offers inside their publication window are included. No internal university name, exact location, internal notes, actor IDs, or tenant IDs are serialized unless the corresponding public visibility switch explicitly permits the university name or exact location.

## Privacy and tenant rules

- Every management read and write is organization-scoped and restricted to `OWNER`/`ADMIN` users.
- The public feed returns only offers marked published and currently within their optional date window from organizations whose active OWNER/ADMIN accounts have the EDVUNO website publisher grant.
- Public serialization is an allowlist. It never returns internal notes or tenant/actor identifiers.
- Hiding a value also removes the corresponding filter dimension for that offer; a query cannot reveal a hidden value through matches.
- Free-text public title/description are separate from internal university name and notes. The portal warns admins not to place identifying details in public text when they want an anonymous listing.
- City-level filtering is public by default; exact campus/address remains private by default.

## Release

Implementation and public-site source are committed to the existing public `student-portal` GitHub repository. Live rollout requires a fresh database and website-files backup to `/Volumes/Extra/backup/`, Prisma schema update, portal build/restart, then publishing the static `edvuno-site/` files to a new release directory and switching the `current` symlink. Verify existing counts, student assignments, public filters, hidden-field omission, and both domains after rollout.
