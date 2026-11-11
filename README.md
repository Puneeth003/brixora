# Brixora

Property listing platform for a brokerage. Owners submit with phone + WhatsApp OTP, admin reviews and publishes, and every enquiry goes to the brokerage. Enquiries land in a built-in CRM worked by admins and agents. Visitors and owners can keep a member account to save listings and read replies. Full spec: [SPEC.md](SPEC.md).

Stack: Next.js 16 (App Router, Cache Components) · MySQL 8 / MariaDB on Hostinger (`mysql2`) · WhatsApp Cloud API · SMTP email (nodemailer) · sharp. Auth, sessions, file storage and scheduled jobs are built into the app; there are no third-party backend services.

## Layout

```
src/app/(site)/          public site: /, /properties, /properties/[ref], /post, /manage, /login,
                         /localities, /privacy
src/app/(site)/account/  member area: overview + profile, /account/enquiries (threads), /account/saved
src/app/admin/(auth)/    /admin/login, /admin/mfa, /admin/forgot-password (+ actions.ts)
src/app/admin/(panel)/   dashboard, submissions, listings, change requests, builders & projects,
                         enquiries + CSV, messages; CRM: clients, clients/[id], inbox; agents,
                         members, users, profile
src/app/admin/crm-actions.ts  CRM, agents, members, replies, own-password server actions
src/app/media/           public watermarked photos (/media/<uuid>.webp)
src/app/admin/originals/ private original uploads (admin only)
src/app/api/             whatsapp/webhook (Meta), cron/expire-listings (daily job)
src/lib/db.ts            MySQL pool + query helpers (rows normalised: ISO dates, booleans, parsed JSON)
src/lib/auth.ts          DB sessions, guards (requireStaff / requireAdmin / requireOwner), rate limiting
src/lib/crypto.ts        scrypt passwords, TOTP, AES-GCM secret encryption
src/lib/password.ts      staff password rules (12+ characters)
src/lib/mail.ts          SMTP email (nodemailer) + reset / changed / welcome templates
src/lib/crm.ts           client scoping, enquiry → client (recordEnquiryInCrm), matching listings
src/lib/crm-constants.ts pipeline, client types/sources, activity and agent-type labels
src/lib/member.ts        member-account helpers (unread replies)
src/lib/storage.ts       uploads on disk under UPLOAD_DIR
db/schema.sql            base tables + public views
db/migrations/           002_crm.sql, 003_accounts.sql, 004_site_verification.sql: apply in order after schema.sql
db/seed.sql              demo listings (generated)
db/demo-workflow.sql     demo submissions, change requests, enquiries, message log
db/demo-crm.sql          demo agents/broker, clients, conversations, a visitor member
scripts/create-admin.mjs create the admin / reset password or 2FA
```

The admin panel has its own look (floating dark sidebar, Nunito Sans). Its theme is scoped under `.admin-ui` in `globals.css`, so it never leaks into the public site.

## Security model

- **The database is server-only.** Only the Next.js server holds the `DB_*` credentials. Every page, server action and route handler checks the caller first (`requireStaff` / `requireAdmin`, or `getOwner` plus an ownership check). Nothing in the browser talks to MySQL.
- **Public reads** use the `public_properties` / `public_images` views, which expose only the safe columns of live, unexpired listings. Private address, owner, notes and originals are never in them.
- **Sessions.** The cookie holds a random 256-bit token, and the `sessions` table stores only its SHA-256. Member (`brx_owner`, 30 days) and staff (`brx_admin`, 12 h, `Path=/admin`, `SameSite=Strict`) cookies are separate and httpOnly, and Secure in production.
- **Staff roles** (`users.role`):
  - `admin`: everything. The first admin comes from `scripts/create-admin.mjs`; more can be added in Admin → Agents & brokers.
  - `agent`: the CRM only (clients, inbox, profile), and only the clients assigned to them (`clientScope` in `src/lib/crm.ts`). Admin-only pages and actions use `requireAdmin` and send agents back to `/admin/clients`.
  - `agent_type` is `agent` (in-house) or `broker` (partner). A broker without an email is a record only and can't sign in.
  - Deactivating a staff account, or changing its email or role, ends its sessions.
- **Staff sign-in** is email + scrypt password, then a TOTP code (secret AES-256-GCM encrypted with `AUTH_SECRET`, each code accepted once). `ADMIN_2FA=off` makes it password-only; 2FA is on by default and applies to agents too.
- **Staff password reset** (`/admin/forgot-password`):
  - Emailed 6-digit code, stored only as an HMAC. It expires in 10 minutes and allows 5 tries. At most 3 codes per 10 minutes per account, and 5 requests per 15 minutes per email.
  - Unknown emails get the same generic answer.
  - A correct code yields a one-time token for setting the new password (12+ characters). Setting it signs out every session and sends a "password changed" email.
  - Staff change their own password at `/admin/profile` (current password required; other sessions are signed out).
- **Member OTP** (owners and visitors share one flow).
  - The 6-digit code goes out on WhatsApp and is stored only as an HMAC. It expires in 5 minutes, is single-use, and allows at most 5 tries.
  - Sends are limited to 3 per number per hour (plus a per-IP limit).
  - Admin can block a member (Admin → Members); blocked accounts can't sign in. Members see only their own listings, enquiries and saved properties.
- **Rate limits** (`auth_attempts`): 5 failed staff passwords or TOTP codes per 15 minutes per account (wider per IP), 10 OTP failures per hour, plus the reset limits above.
- **Uploads** are re-encoded by sharp. Public copies get random names, originals are served only to the admin, and storage keys are validated against a strict pattern.

## Local development

```bash
cp .env.example .env.local   # set DB_USER, DB_PASS, DB_NAME, AUTH_SECRET
npm install
mysql -u USER -p DBNAME < db/schema.sql
mysql -u USER -p DBNAME < db/migrations/002_crm.sql
mysql -u USER -p DBNAME < db/migrations/003_accounts.sql
mysql -u USER -p DBNAME < db/migrations/004_site_verification.sql
# optional demo data, in this order:
mysql -u USER -p DBNAME < db/seed.sql            # listings
mysql -u USER -p DBNAME < db/demo-workflow.sql   # submissions, requests, enquiries, messages
mysql -u USER -p DBNAME < db/demo-crm.sql        # agents, clients, conversations, a member
npm run admin:create -- you@example.com          # prompts for a password
npm run dev
```

Without `DB_USER` / `DB_NAME` the public pages show built-in demo listings. Sign-in, accounts and admin need the database.

In development, WhatsApp messages (including login codes) and emails (reset codes, welcome emails) are printed to the server console instead of being sent. That happens when `WHATSAPP_TOKEN` / `SMTP_HOST` are empty.

Demo agents have no password: set one from Admin → Agents & brokers, or use "Forgot password". Each demo file's header lists the `DELETE` statements that remove it before launch.

## Hostinger setup (one time)

1. **Database:**
   - hPanel → Databases → MySQL Databases → create a database and user.
   - With phpMyAdmin → Import, import `db/schema.sql`, then `db/migrations/002_crm.sql`, then `db/migrations/003_accounts.sql`, then `db/migrations/004_site_verification.sql`.
   - Optional demo data: `db/seed.sql`, `db/demo-workflow.sql`, `db/demo-crm.sql`.
   - Existing install: import only the migrations you haven't applied, in order.
2. **Config values** (phpMyAdmin → SQL):
   ```sql
   UPDATE app_config SET value = 'BRX' WHERE name = 'ref_prefix';           -- reference prefix
   UPDATE app_config SET value = '90'  WHERE name = 'listing_expiry_days';
   ```
3. **Node.js app:**
   - Connect the GitHub repo. Build: `npm run build`, start: `npm run start`, Node 20.9+.
   - Set every variable from `.env.example` in the panel.
4. **Email (SMTP):**
   - hPanel → Emails → create a mailbox (e.g. `no-reply@yourdomain.in`).
   - Set `SMTP_HOST=smtp.hostinger.com`, `SMTP_PORT=465`, `SMTP_SECURE=ssl`, and `SMTP_USER` / `SMTP_PASS` for that mailbox.
   - Set `MAIL_FROM` (same address) and `MAIL_FROM_NAME`.
   - Production refuses to send without `SMTP_HOST`, so password resets and welcome emails need it.
   - Check delivery from Admin → Settings → Security → Outgoing email → "Send test email". Creating the mailbox also adds the domain's MX, SPF and DKIM records; without them Gmail and Outlook drop or spam-folder the mail.
5. **Uploads folder:** create a folder outside the app directory (e.g. `/home/<user>/brixora-uploads`) and set `UPLOAD_DIR` to it. Redeploys replace the app folder, so photos must not live inside it. Include this folder in your backups.
6. **Admin account:**
   - Run `npm run admin:create -- you@yourdomain.in` once, over SSH or locally with the `DB_*` variables pointing at the Hostinger database (enable Remote MySQL for your IP).
   - The first sign-in at `/admin/login` walks you through authenticator-app setup (unless `ADMIN_2FA=off`).
   - Lost the authenticator? Run `npm run admin:create -- you@yourdomain.in --reset-2fa`. Forgot the password? Use "Forgot password" on the login page with the same email you gave `admin:create`; any other address gets the same "we've sent a code" message but no email (the server log says so).
7. **Agents & brokers:**
   - Add staff in Admin → Agents & brokers. With an email and "send welcome email", they get a link to set their password.
   - Partner brokers can be added without an email, as records to credit referrals.
8. **Daily cron:** hPanel → Advanced → Cron Jobs (or any external scheduler), daily at 00:30 IST:
   ```
   curl -fsS -H "Authorization: Bearer <CRON_SECRET>" https://<your domain>/api/cron/expire-listings
   ```
   It expires old listings and clears dead sessions and codes. Public pages already hide expired listings, so a missed run is harmless.
9. **Meta webhook:**
   - Callback URL: `https://<your domain>/api/whatsapp/webhook`, with the `WHATSAPP_VERIFY_TOKEN` you chose.
   - Subscribe to `messages`. If you connect the WhatsApp Business app number (step 9a), also subscribe to `account_update`, `smb_message_echoes`, `history` and `smb_app_state_sync`.
   - Submit every template in the table below, including `enquiry_reply` (used when staff answer an enquiry).

9a. **Use the existing WhatsApp Business app number (coexistence):** the team keeps using the WhatsApp Business app on the phone, and the website sends from the same number.
   - Meta app (developers.facebook.com): add the WhatsApp and Facebook Login for Business products. The app needs `whatsapp_business_management` and `whatsapp_business_messaging`. Meta expects a Tech Provider app with Business Verification, so start that early. App admins and testers can try the flow while the app is in development mode.
   - Facebook Login for Business → Configurations → create one for "WhatsApp Embedded Signup". Copy its ID into `WHATSAPP_ES_CONFIG_ID`, the app ID into `META_APP_ID` and the app secret into `WHATSAPP_APP_SECRET`. Add your domain to the allowed domains for the JavaScript SDK.
   - Apply `db/migrations/005_whatsapp_connection.sql`.
   - Admin → Settings → WhatsApp → **Connect WhatsApp Business app**. Log in with Facebook, choose "Connect your existing WhatsApp Business app", enter the number and confirm in the app on the phone (WhatsApp Business 2.24.17 or later). Contacts and chat history sync starts right after; Meta allows it only within 24 hours of connecting.
   - Set `BROKERAGE_ENQUIRY_WHATSAPP` to a different number (e.g. the manager's). The connected number can't forward enquiries to itself.
   - Open the app on the phone at least every ~14 days, or Meta disconnects the API. While connected: API throughput is 20 messages/second; broadcast lists, disappearing/view-once messages, greeting/away messages and labels stop working in the app.
   - The connected number overrides `WHATSAPP_TOKEN` / `WHATSAPP_PHONE_NUMBER_ID`. Disconnect falls back to them.

If `sharp` fails to install on the host, ask Hostinger for a Node build with libvips, or move image processing to a small separate service.

## CRM & accounts (daily use)

- **Clients** (`/admin/clients`): one record per buyer, tenant, seller, landlord or investor, with source, budget, requirements, assigned agent and referring broker.
  - Pipeline: new → contacted → site visit → negotiation → won / lost.
  - Each client page has a timeline (calls, WhatsApp, meetings, site visits, notes, status and assignment changes), a next follow-up (shown in IST), and live listings that match their requirements.
  - Agents see and edit only their own clients. Admin sees all and assigns.
- **Website enquiries feed the CRM.** Each enquiry finds the client by phone or creates one (source "website"), and is added to the timeline. A won or lost client who enquires again is reopened as new.
- **Inbox** (`/admin/inbox`): enquiry conversations. A staff reply is saved on the enquiry and nudges the visitor on WhatsApp (`enquiry_reply`) to read it in their account.
- **Agents & brokers** (`/admin/agents`, admin only): add, edit, deactivate, resend the welcome email.
- **Members** (`/admin/members`, admin only): visitors and owners with accounts. Open one as a client, or block them. **Users** (`/admin/users`) lists every account.
- **Profile** (`/admin/profile`): change your own password.
- **Member accounts** (public site):
  - Visitors and owners sign up or sign in at `/login` with the same WhatsApp OTP flow. Earlier enquiries from that number are claimed on sign-in.
  - `/account`: overview + profile. `/account/enquiries`: each enquiry with the team's replies; members can reply. `/account/saved`: the shortlist (save button on listing pages). `/manage`: their listings and change requests.

### On-site verification

- **Schedule** a visit from the property page in admin: pick a date & time and an agent. The owner gets `site_visit_scheduled` on WhatsApp.
- **On the visit** the agent opens `/admin/verifications/<id>` on their phone: works through the checklist, captures GPS, takes proof photos (staff-only) and marks the result verified or issues found. `/admin/verifications` lists upcoming and past visits.
- **Approval rule:** while Settings → Organization → "Require on-site verification before approving a listing" is on (default, `app_config.require_site_verification = '1'`), a listing can't be approved until a visit is completed as verified. Turn it off to approve without a visit.
- **Public badge:** a verified listing shows "Verified" on its card and "Verified on site · <date>" on its page (`properties.verified_at`).

## WhatsApp templates to submit (Meta → WhatsApp Manager)

Language `en`. Body variables in the order the app sends them. Ready-to-paste wording and sample values: [docs/whatsapp-templates.md](docs/whatsapp-templates.md).

| Name | Category | Variables |
|---|---|---|
| `otp_login` | Authentication (copy-code button) | {{1}} code |
| `submission_received` | Utility | {{1}} name, {{2}} reference |
| `listing_approved` | Utility | {{1}} reference, {{2}} link |
| `listing_rejected` | Utility | {{1}} reference, {{2}} reason |
| `change_received` | Utility | {{1}} reference, {{2}} request type |
| `change_approved` | Utility | {{1}} reference, {{2}} request type |
| `change_rejected` | Utility | {{1}} reference, {{2}} request type, {{3}} reason |
| `sold_confirmed` | Utility | {{1}} reference |
| `enquiry_forward` | Utility | {{1}} reference, {{2}} name, {{3}} phone, {{4}} message, {{5}} link |
| `enquiry_reply` | Utility | {{1}} name, {{2}} reference, {{3}} link to the account's enquiries |
| `site_visit_scheduled` | Utility | {{1}} reference, {{2}} date & time |
| `staff_invite` | Utility | {{1}} first name, {{2}} set-password link |

When a member replies STOP, `users.wa_opt_out` is set and non-essential templates are skipped. OTP, rejections and enquiry forwards still go out.
