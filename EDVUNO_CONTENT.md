# EDVUNO publishing

The existing multi-organization Student Portal remains intact. A platform owner can open `/dashboard/platform/site-content` on `portal.edvuno.top` to draft and publish EDVUNO website content. Organization-owned portal offers and universities are never used by the public EDVUNO feed.

Content types: OFFER, UNIVERSITY, SCHOLARSHIP, ARTICLE, SERVICE, FAQ, PAGE. A PAGE slug of `home`, `study`, `about`, or `contact` updates that page's short introductory text. University profile links use the UNIVERSITY slug. Use the optional province, city, subject, and level fields for university filters. The image and official-source links must be HTTPS URLs.

Only records marked published appear at `/api/public/site-content`; drafts are private. The public `edvuno.top` Nginx vhost proxies that path to the portal app on `127.0.0.1:7100`. The website fetches the feed on load. When no published content exists for a category, clearly labeled preview examples remain visible. Offers are shown only when actual offers are published.

Before publishing any offer, institution, scholarship, contact detail, or claim, verify it and provide a source link. The inquiry form remains a demo and does not submit personal information.
