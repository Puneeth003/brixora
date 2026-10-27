# Property Listing Platform – Specification

## 1. What this is
A listing platform for a real estate brokerage / channel partner. Owners and builders submit properties; admin reviews, cleans up, approves; approved listings go public. Owners can later request price or detail changes or mark a property sold, each subject to admin approval.

**Core principle:** The brokerage is the only point of contact. Visitors never see owner identity, contact details or exact address. Owners never see enquiries. All communication goes through the brokerage's staff (admin and agents).

**Added later:** a lead pipeline / CRM with agent and broker accounts (§14), staff password reset by email (§15), and member accounts for visitors and owners (§16).

**Out of scope:** commission payouts, payments, SMS, email to owners or visitors (staff email only).

## 2. Roles
- **Visitor** – browses, filters, sends enquiries to the brokerage. Login optional: with a member account (§16) they can save properties and read replies to their enquiries.
- **Owner** – signs in with phone number + WhatsApp OTP; submits and manages own properties. Sees only own listings' status. Owners and visitors share one member account type (`users.role = 'owner'`).
- **Admin** – full access. Email+password with authenticator-app 2FA (TOTP; `ADMIN_2FA=off` makes it password-only).
- **Agent** – staff with CRM access only, limited to clients assigned to them (§14). `agent_type` = `agent` (in-house) or `broker` (partner broker; without an email it is a record only and can't sign in). Same sign-in as admin.

## 3. Tech stack
- Next.js (App Router, TypeScript, Tailwind) – public site, owner portal, `/admin` in one codebase. Runs as a Node server, not static export.
- **Hostinger Managed Node.js Web App** – hosting; deploy from GitHub; domain, SSL, CDN included
- Hostinger MySQL – data store; auth (DB sessions, WhatsApp OTP, admin TOTP), file storage (disk under `UPLOAD_DIR`), WhatsApp sending/webhook and the daily expiry job all run inside the Next.js app
- **WhatsApp Business Platform** – Meta Cloud API directly, or via a BSP (Interakt / WATI / AiSensy). One approved **authentication** template for OTP; one approved **utility** template per notification type (§12).
- Cloudflare Turnstile – spam protection on post and enquiry forms
- Images – resize on upload (max ~1600px, WebP) and watermark with brokerage logo using `sharp`; keep original privately. If `sharp` won't build on Hostinger, move processing to a small separate service.
- Env vars (database, auth secret, WhatsApp token/phone-number ID, Turnstile) set in Hostinger's panel; never committed
- SMTP email (nodemailer; Hostinger mailbox) – staff password-reset codes, "password changed" notices and agent welcome emails. Optional later: a backup channel for enquiries if WhatsApp delivery fails

## 4. Public site
- **Home** `/` – search bar, featured listings, locality shortcuts, "Post your property" CTA, brokerage contact
- **Listings** `/properties` – filters: locality, sale/rent, property type, budget, BHK, furnishing; sort newest/price; pagination
- **Property detail** `/properties/[ref]` – watermarked gallery, specs, description, builder/project + RERA no. if linked, **locality only** (no address, house name, exact pin), enquiry form, WhatsApp click-to-chat to **brokerage** number, brokerage contact block
- **Post property** `/post` – steps: type → location → details → photos → phone number → WhatsApp OTP → name → confirmation with reference number (also sent on WhatsApp)
- **Manage my listing** `/manage` – phone → WhatsApp OTP → own listings, change requests, mark sold
- **Privacy policy** `/privacy` – phone numbers are collected and messaged

Privacy rule: owner data and private fields must not appear in HTML, API responses or page source — not merely hidden in the UI.

## 5. Owner portal (`/manage`)
- View own listing(s) and status
- **Change price** – proposed new price
- **Update details** – description, availability, add/replace photos
- **Mark as sold**
- Status of past requests. Never sees enquiries.

## 6. Admin panel (`/admin`)
- **Dashboard** – pending submissions, pending change requests, live count, enquiries today, failed WhatsApp messages
- **Submissions** – tabs: Pending / Under review / Rejected
- **Review screen**
  - Edit every public field; original submission shown read-only alongside
  - Owner details panel (name, phone, private address) – admin only
  - Photos: reorder, hide, delete, upload replacements, set cover
  - Auto-scan of title/description for phone numbers, emails, URLs, house names → flagged
  - Approve checklist: address removed · contact info removed · photos checked for name boards / number plates / phone numbers
  - Internal notes; Approve / Reject (reason required)
- **Live listings** – edit, toggle featured, mark sold, archive, extend expiry
- **Change requests** – tabs Pending / Approved / Rejected; diff view current vs proposed; edit proposed values before approving
- **Builders & projects** – CRUD; link listings to a project
- **Enquiries** – read-only log, forward status, CSV export
- **Messages** – log of every WhatsApp message sent, with delivery status; retry button on failures
- **Activity log** – per property
- **CRM** (admin + agents) – Clients, Inbox (§14); **Agents & brokers**, **Members**, **Users** (admin only); **Profile** (own password)
- Look: floating dark sidebar, Nunito Sans; theme scoped under `.admin-ui` so it doesn't affect the public site

## 7. Property lifecycle
`pending → under_review → approved | rejected`
`approved → sold_pending → sold`
`approved → archived` (admin) · `approved → expired` (daily cron → `/api/cron/expire-listings`, after N days; admin can extend)

Rules:
- Public reads **only** `approved`, unexpired listings, via a restricted view. Enforced in the server data layer (the database is never reachable from the browser).
- Owner actions never touch the live record's content; they create change requests.
- `sold_pending` hides the listing immediately: creating a `sold` change request sets `status = sold_pending` (inside the same server action / DB function, not by an owner UPDATE). Admin confirms (`sold`) or reverts (`approved`).
- Rejections carry a reason and notify the owner.
- Approval needs a completed on-site verification while `require_site_verification` is on (§17).

## 8. Change request workflow
1. Owner signs in on `/manage`
2. Chooses price / details / sold
3. Request saved with proposed values; owner gets WhatsApp "received"
4. Price/details: listing stays live until approved. Sold: hidden now.
5. Admin approves (optionally edits proposed values) → live record updated, proposed photos set `approved = true`, owner notified. Reject → owner notified with reason.
6. Logged in `activity_log`

## 9. Enquiries
Form: name, phone, message + Turnstile. Submitted to a server route that verifies the Turnstile token server-side, then saves to `enquiries` (service role) with property reference → forwarded immediately to the brokerage WhatsApp number (utility template with name, phone, message, listing link). Failed forwards are flagged and retried. Owner is never notified.

## 10. Messaging (WhatsApp)
- All outbound messages are **template messages** sent server-side (Next.js server), never from the browser
- Every send is written to `messages` first, then sent; delivery status updated via the WhatsApp status webhook
- OTP: server action generates the code → authentication template to the owner's number (code stored only as an HMAC)
- Rate limits: max 3 OTPs per number per hour, 5 tries per code, Turnstile on send; admin login/TOTP lockouts
- Opt-out: owners can reply STOP; flag `users.wa_opt_out` and suppress non-essential messages (OTP and rejections still go)

## 11. Data model
- **profiles** – id (auth user), role (`admin` | `owner`), name, phone (verified), wa_opt_out
- **properties** – id, reference_no (`<PREFIX>-2026-0001`, prefix from brand name; generated server-side), status, listing_type, property_type, title, description, price, price_negotiable, locality, city, private_address, private_landmark, bedrooms, bathrooms, area_sqft, furnishing, floor, property_age, amenities[], builder_id, project_id, rera_no, featured, owner_id, submitted_at, reviewed_by, approved_at, rejected_reason, sold_at, expires_at, original_submission (jsonb), internal_notes
- **property_images** – id, property_id, storage_path, watermarked_path, sort_order, is_cover, is_visible, uploaded_by, change_request_id (nullable; set for photos proposed in a change request), approved (bool; false until the submission or change request is approved)
- **builders** – id, name, rera_no, contact_name, phone, notes
- **projects** – id, builder_id, name, locality, rera_no, status
- **change_requests** – id, property_id, type (`price` | `details` | `sold`), proposed (jsonb), status, requested_at, reviewed_by, reviewed_at, admin_note
- **enquiries** – id, property_id, name, phone, message, created_at, forwarded, forward_error
- **messages** – id, recipient_phone, template_name, payload (jsonb), wa_message_id, status (`queued` | `sent` | `delivered` | `read` | `failed`), error, created_at, updated_at
- **clients**, **client_activities**, **password_resets**, **enquiry_messages**, **saved_properties** – see §14–16 (`db/migrations/002_crm.sql`, `003_accounts.sql`)
- **activity_log** – id, entity_type, entity_id, action, actor_type, actor_id, diff (jsonb), created_at
- **View `public_properties`** – approved rows only; safe columns only (no owner_id, private_*, internal_notes, original_submission, reviewed_by)
- **View `public_images`** – images where `is_visible` and `approved`, of approved properties; watermarked_path only
- **View `my_properties`** – rows where owner_id = auth.uid(); owner-safe columns only (public fields + status, reference_no, rejected_reason, submitted_at, expires_at, private_address). Excludes internal_notes, original_submission, reviewed_by, featured-admin fields.
- Public views expose only safe columns; public pages read nothing else.

## 12. Notifications (WhatsApp utility templates, brokerage → owner)
Submission received (with reference) · Site visit scheduled (`site_visit_scheduled`: reference, date & time) · Approved (with link) · Rejected (with reason) · Change request received · Change request approved · Change request rejected (with reason) · Sold confirmed
Plus: Enquiry forward (to brokerage) · Enquiry reply (`enquiry_reply`: name, reference, link to `/account/enquiries`; tells the visitor staff replied) · OTP (authentication template)
Optional: periodic "your listing is receiving interest" message, no details.

## 13. Access rules
- The MySQL user is server-only; every page, server action and route handler authorises the caller before querying.
- Anonymous: reads `public_properties` and `public_images` only. Enquiries go through a server action with Turnstile (§9).
- Owner (phone-verified session): reads own properties (owner-safe columns) and own `change_requests` only. Submissions and change requests go through server actions that check the session and ownership and write only whitelisted fields; `status`, `owner_id`, `reference_no`, `featured`, `approved_at`, `expires_at`, etc. are set server-side.
- Member: additionally reads own enquiries, their `enquiry_messages` and own `saved_properties`. Blocked members (`is_active = 0`) can't sign in.
- Agent: CRM pages only (`requireStaff`); clients, timelines and enquiry threads restricted to clients assigned to them. Admin-only pages use `requireAdmin`.
- Admin: full access. The first admin is created by `scripts/create-admin.mjs` (no sign-up page); further admins and agents are added in Admin → Agents & brokers. Staff routes require a TOTP-verified session unless `ADMIN_2FA=off`.
- `messages` and webhook endpoint: server only; webhook verified by Meta app-secret signature
- Storage: originals under `UPLOAD_DIR/originals`, served only to the admin; watermarked copies under `UPLOAD_DIR/public` with random filenames; writes only server-side

## 14. CRM (`/admin/clients`, `/admin/inbox`)
- **clients** – one per phone number: name, phone, alt phone, email, type (`buyer` | `tenant` | `seller` | `landlord` | `investor`), source (`website` | `walk_in` | `referral` | `phone` | `whatsapp` | `broker` | `social` | `other`), requirements (sale/rent, property types, localities, BHK, budget min–max), linked listing, notes, assigned agent, referring broker, next follow-up, last contact
- Pipeline: `new → contacted → site_visit → negotiation → won | lost` (lost needs a reason)
- **client_activities** – timeline: note, call, WhatsApp, email, meeting, site visit, plus automatic status / assignment / enquiry entries
- Follow-ups are entered and shown in IST; client page lists live listings matching the requirements
- **Website enquiries → CRM** (`recordEnquiryInCrm`): find the client by phone or create one (source `website`), link the enquiry, add it to the timeline; a won/lost client who enquires again is reopened as `new`. Failure never blocks the enquiry.
- **Inbox** – enquiry conversations. Staff replies are stored in `enquiry_messages` and trigger the `enquiry_reply` WhatsApp template; the visitor reads and answers in `/account/enquiries`.
- **Scoping** – admin sees every client and assigns them; an agent sees and edits only clients assigned to them (`clientScope` in `src/lib/crm.ts`), including their enquiry threads.

## 15. Staff accounts and password reset
- Staff = `users.role` `admin` | `agent`, managed in Admin → Agents & brokers (admin only): add, edit, deactivate, change role. Deactivating or changing email/role ends the account's sessions. Admin can't remove their own admin access.
- New agents with an email can get a welcome email with a link to set their password (via the reset flow below).
- **Forgot password** (`/admin/forgot-password`): email → 6-digit code by email (HMAC-hashed, 10 min, 5 tries; max 3 codes per 10 min per account, 5 requests per 15 min per email; unknown emails get the same generic answer) → correct code returns a one-time token → new password (12+ characters, not containing the email, not trivial). Success signs out every session and sends a "password changed" email.
- **Profile** (`/admin/profile`): change own password (current password required; rate-limited; other sessions signed out).
- Email is SMTP (`SMTP_*`, `MAIL_FROM*`). Development without `SMTP_HOST` prints mail to the console; production refuses to send.

## 16. Member accounts (`/login`, `/account`)
- Visitors and owners sign up / sign in with phone + WhatsApp OTP (same flow and limits as §10); one account type.
- On sign-in, earlier enquiries from that phone number are claimed (`enquiries.user_id`).
- `/account` – overview and profile (name, optional email) · `/account/enquiries` – each enquiry with staff replies; member can reply · `/account/saved` – shortlist, from the save button on listing pages · `/manage` – own listings and change requests (§5)
- Admin → Members: list members, open one as a CRM client, block / unblock.
- Still true: members never see owner details of other listings; owners never see enquiries on their listings.

## 17. On-site verification (`/admin/verifications`)
- **site_verifications** – one per visit: property, status (`scheduled` | `completed` | `cancelled`), result (`verified` | `issues`), scheduled time, assigned agent, visited time, checklist (JSON), notes, GPS (lat/lng + accuracy). **site_verification_photos** – proof photos, private (staff only).
- Admin schedules from the property page → owner gets `site_visit_scheduled` (reference, date & time). Visits can be cancelled.
- Agent completes the visit on their phone at `/admin/verifications/<id>`: checklist, GPS capture, proof photos, notes, result. A `verified` result sets `properties.verified_at` / `verified_by`.
- Approval rule: when `app_config.require_site_verification = '1'` (default; Settings → Organization), `approveProperty` refuses listings without `verified_at`.
- Public: `public_properties` exposes `verified_at` only; cards show "Verified", the detail page "Verified on site · <date>". Photos, GPS and notes are never public.
- Migration: `db/migrations/004_site_verification.sql`.

## 18. Build order for Claude Code
One phase at a time; within a phase, one task at a time.

**Phase 0 – Foundation**
1. Scaffold Next.js + Tailwind, push to GitHub, connect to Hostinger, confirm hello-world deploys with domain and SSL
2. Hostinger MySQL; `db/schema.sql` for all tables, enums, and the views (§11)
3. Access rules (§13) in the server data layer; uploads folder outside the app
4. WhatsApp: template sender + `messages` logging and `/api/whatsapp/webhook` (status updates); test with one template
5. Auth: owner WhatsApp OTP sessions; admin email+password + TOTP 2FA via `scripts/create-admin.mjs`
6. Env vars in Hostinger; redeploy and verify

**Phase 1 – Core loop**
7. Public listings page with filters (reads `public_properties`)
8. Property detail page + enquiry form with Turnstile + WhatsApp forward to brokerage
9. Post-property flow: upload, resize, watermark, phone + WhatsApp OTP, reference number
10. Admin submissions queue + review screen with auto-scan and checklist + approve/reject
11. Owner WhatsApp notifications: received / approved / rejected
12. `/privacy` page; admin Messages screen with retry

**Phase 2 – Owner self-service**
13. `/manage` with phone + WhatsApp OTP login
14. Change requests + admin change-request screen + their notifications
15. Builders & projects CRUD + linking
16. Featured, archive, expiry with extend; daily cron job for auto-expiry
17. Opt-out handling

**Phase 3 – Growth**
18. Locality SEO pages, sitemap, metadata
19. Analytics
20. Paid featured slots (optional)

## 19. Do before Phase 0 task 4 (not code — takes days)
- Meta Business account + business verification
- A dedicated phone number for the WhatsApp Business API (cannot already be on regular WhatsApp)
- Decide: Meta Cloud API direct vs a BSP (Interakt / WATI / AiSensy) — BSPs cost a monthly fee but make templates and onboarding easier
- Submit the templates in §12 for approval; the OTP one must be **authentication** category
- Set up the display name and profile for the business number

## 20. Decisions still open
- WhatsApp provider (direct vs BSP) and the business number
- Hostinger plan tier
- Admin email
- Photo limits (suggest min 3, max 15)
- Listing expiry window (suggest 90 days)
- Whether owners get "interest" notifications
- Brand name
- Confirm K-RERA agent registration before going public
