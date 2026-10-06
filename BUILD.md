# ZTEX Sponsorships Portal — Build Doc

> The history of how this was made. Update the Build Log every time the project is touched.

## What it is
A community sponsorship request portal for ZTEX Construction at https://sponsorships.ztexconstruction.com. Outside organizations fill in a multi-step request form (organization, contact, event, requested amount/tier, description, supporting files). The request is emailed to the company sponsorships mailbox with Approve / Deny links; the approver can review and optionally adjust the amount, tier and notes, sign with their name, and confirm. Marketing is then notified of the decision by email. Runs on Vercel.

## Stack & architecture
- Front end: static `index.html` (multi-step form), `thanks.html`, `assets/css/styles.css`, `assets/js/main.js` — plain HTML/CSS/JS, ZTEX Red/Yellow branding
- Back end: three **Vercel Node serverless functions** (`vercel.json` v2 builds/routes)
  - `api/submit.js` — receives the form as JSON (files base64-encoded in the browser via `FileReader`), generates a `submissionId` (UUID), base64-encodes the submission into Approve/Deny links, emails the request with file attachments
  - `api/action.js` — Approve/Deny link target; renders the review form (adjust amount/tier, notes, approver select remembered in a `lastApprover` cookie); shows "Already handled" if the submission is locked
  - `api/confirm.js` — finalizes: checks/sets a Redis lock `submission:<id>` (90-day TTL) to block double approve/deny, then emails marketing the decision
- Email: `nodemailer` via Office 365 SMTP (`smtp.office365.com:587`), sent from the sponsorships mailbox using Send As
- State: **Upstash Redis** (`@upstash/redis`, `Redis.fromEnv()`), provisioned through Vercel; used only for the double-action lock
- No database; submission data travels inside the email links
- `server.js` / `express` / `multer` / `formidable` / `@vercel/kv` remain in `package.json` from earlier iterations but the deployed app uses only the `api/*.js` functions

Flow: browser form → `POST /api/submit` → email to sponsorships mailbox (Approve/Deny links) → `GET /api/action` review page → `POST /api/confirm` → Redis lock → email to marketing → confirmation page.

## How to run, build, deploy
- No build step. Install deps with `npm install`.
- Local: `vercel dev` (the `npm start` script references a `server.js` that is no longer in the repo)
- Deploy: push to `main` → Vercel auto-deploy. DNS for the custom domain points at Vercel.

## Configuration
Names only; values live in Vercel → Project → Environment Variables (local copies in gitignored `.env*` files).
- `SMTP_PASSWORD` — Office 365 SMTP password for the sending mailbox
- `MARKETING_EMAIL` — comma-separated recipients for decision notifications (code has a fallback)
- Redis (from the Vercel/Upstash integration): `KV_REST_API_URL`, `KV_REST_API_TOKEN`, `KV_REST_API_READ_ONLY_TOKEN`, `KV_URL`, `REDIS_URL`
- `VERCEL_OIDC_TOKEN` (written by `vercel env pull`)

## Key decisions
- 2026-05-11 — Initial build with a Node/Express email backend, then Vercel serverless config — reason not recorded.
- 2026-05-11 — Converted to a static site on GitHub Pages with Formspree as the form backend — reason not recorded.
- 2026-06-25 — Replaced Formspree with a custom Vercel backend and an approve/deny workflow (commit `ffb91d1`) — reason not recorded.
- 2026-06-25 — Send email from the company sponsorships mailbox via Send As — reason not recorded.
- 2026-06-25 — Approver can adjust amount/tier/notes before approving or denying (marked optional) — reason not recorded.
- 2026-06-25 — Redis lock with 90-day TTL to prevent double approve/deny; approver name captured and remembered by cookie — reason not recorded.
- 2026-06-25 — Removed the slogan from all pages; added social icons in brand red — reason not recorded.

## Build log
### 2026-05-11 — Initial portal
- Initial build: ZTEX-branded sponsorship portal, multi-step form, file uploads, email backend (`ce2fd66`)
- Added Vercel serverless config and `formidable` for deployment (`cda4cc8`)
- Converted to a static site for GitHub Pages, Formspree as the form backend (`98b8e6a`)
- Updated logo to the new ZTEX Red/Yellow branding (`9a71ca7`)
- Who: Orion

### 2026-06-25 — Custom domain, custom backend, approval workflow
- Wired the Formspree endpoint (`6152c57`); added thank-you page for post-submit redirect (`17bde68`)
- Added `CNAME` for `sponsorships.ztexconstruction.com` (`f968ec1`)
- Removed slogan from all pages (`42f780f`); footer social icons (Facebook, Instagram, LinkedIn, YouTube) styled in brand red (`810bd28`, `256334e`)
- Replaced Formspree with custom backend: `api/submit` + approve/deny flow (`ffb91d1`)
- Emails sent from the sponsorships mailbox via Send As (`2cfef36`); added/corrected a marketing notification recipient (`18786a5`, `b23e064`)
- Review form with adjustable amount, tier and notes before approve/deny (`c011d76`)
- Double-action prevention with Redis, approver signature, cookie memory (`5e45fe3`)
- Problem: amount fields showed a double dollar sign (`36894f1`); the fix left a syntax error in `confirm.js`, so it was rewritten cleanly with correct dollar-sign stripping (`546ddc4`)
- Labeled the "Adjust Sponsorship" section as optional on the approval page (`fe3530b`)
- Who: Orion. No journal was kept for this session; entries are reconstructed from git.

### 2026-10-06 — Documentation
- Project memory note reconstructed from git history; this BUILD.md added.

### 2026-10-06 — Secure approve/deny links + HTML escaping
- Approve/deny links used to carry the whole request as unsigned base64, so anyone could forge an "Approved" email to marketing with any org/amount. Submissions are now stored server-side in Redis (`pending:<token>`, 90-day TTL) and links carry only a random 256-bit token (`lib/security.js`).
- All user-supplied fields are HTML-escaped in the boss email, review page, and marketing email (previously raw → script injection on the approver's page).
- Decision lock is now atomic (Redis `SET NX`) and is released if the marketing email fails, so a failed send no longer leaves a request stuck as "already handled".
- `/api/confirm` only accepts known approvers and tiers. Removed dead duplicate email/page builders from `action.js`.
- Verified locally with 15 mocked end-to-end checks (forged/made-up links rejected, escaping, retry after email failure, double-decision blocked).
- Note: approve/deny links in emails sent before this deploy no longer work; those requests need to be resubmitted.
- Found during deploy: the original Upstash Redis store had been deleted (Vercel integration "Uninstalled"; host no longer resolves), so approve/deny links that touched Redis had been failing with FUNCTION_INVOCATION_FAILED for an unknown period. Rolled production back briefly, removed the stale KV_*/REDIS_URL vars, provisioned a new Upstash for Redis store `ztex-sponsorships-redis` via Vercel Marketplace, redeployed 3b24aec and promoted it. Live checks: forged old-style link 400, made-up token 404, homepage 200.

### 2026-10-06 — Admin page (/admin)
- Added `/admin` (`api/admin.js`): single-account login, then edit **Approvers** (names on the approval page), **New Request Inbox** (who gets new requests with Approve/Deny), and **Marketing Team** (who gets decisions). Settings stored in Redis key `settings` (`lib/settings.js`); defaults equal the previous hardcoded values, `MARKETING_EMAIL` env is now only a fallback.
- Auth (`lib/auth.js`): password checked against an scrypt hash in env; HMAC-signed HttpOnly/Secure/SameSite=Strict session cookie (8h, path /admin); 5 failed logins per IP → 15-min lockout; cross-origin POSTs rejected; page is noindex, no-store, no framing.
- Approver list and inbox/marketing emails are validated (valid emails, no HTML, max 20, de-duplicated). Confirm step rejects approvers no longer on the list.
- Credentials: username + password generated by Orion and stored in macOS Keychain on Orion's Mac mini (service `ztex-sponsorships-admin`). Vercel env (production): `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH`, `ADMIN_SESSION_SECRET`.
- Verified with 33 mocked end-to-end checks (login/lockout/tamper/CSRF, validation, settings flowing into submit → approve → marketing email).

### 2026-10-06 — 2-step verification (TOTP) on /admin
- Admin login now requires an authenticator-app code after the password, matching CrewSheet/MVR (`otpauth` + `qrcode`, SHA1, 6 digits, 30s, ±1 step). Required (not optional) because it's the only admin account.
- Flow: correct password → 5-minute `ztex_admin_mfa` cookie (purpose "mfa", can't act as a session) → first time: QR + manual key enrollment, confirmed by a valid code; afterwards: code challenge → 8h `ztex_admin` session.
- Secret stored AES-256-GCM encrypted in Redis `admin:totp` (key derived from `ADMIN_SESSION_SECRET`); a used code can't be replayed; wrong codes count toward the same 5-failure/15-min lockout.
- Verified with 44 mocked checks (enrollment, replay, lockout, cookie purpose separation, plus the existing request/approval/admin tests).

## Current status & next steps
- Status: production, live at sponsorships.ztexconstruction.com. Last code change 2026-06-25.
- No open TODOs in code and no next steps recorded.
- Possible cleanup (not requested): remove unused dependencies (`express`, `multer`, `formidable`, `@vercel/kv`) and the dead `start`/`dev` scripts; turn off the stale GitHub Pages site.

## Gotchas
- Reset admin 2-step (lost phone): delete Redis keys `admin:totp` and `admin:totp:pending`; next login shows a new QR. Rotating `ADMIN_SESSION_SECRET` also invalidates the stored TOTP secret (forces re-enrollment).
- To change the admin password: generate a new scrypt hash (format `scrypt$N$r$p$salt$hash`, base64), update `ADMIN_PASSWORD_HASH` in Vercel production, redeploy, and update the Keychain entry. Rotating `ADMIN_SESSION_SECRET` signs everyone out.
- Redis is now required for submissions too (request records live there). If the Upstash store is removed again, the form stops working — check `vercel integration list` first.
- After the 2026-10-06 rollback/promote, confirm the next push to main auto-promotes to production.
- The repo still has GitHub Pages enabled with the same `CNAME` from the static/Formspree period, but DNS for the domain points at Vercel — Vercel is the live host.
- Approve/Deny links carry the submission as plain base64 in the query string (not signed or encrypted). Treat the links as sensitive and don't forward them.
- The Redis lock is written before the marketing email is sent; if the email fails, the request is locked anyway and must be handled manually.
- Large attachments go through the request body as base64 — Vercel function body limits apply.
- `Redis.fromEnv()` relies on the `KV_REST_API_*` names that the Vercel integration provides.
- This repo is public: never commit `.env*` files or credentials.
