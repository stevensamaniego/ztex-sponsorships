# ZTEX Sponsorships Portal — Build Doc

> The history of how this was made. Update the Build Log every time the project is touched.

## What it is
A community sponsorship request portal for ZTEX Construction at https://sponsorships.ztexconstruction.com. Outside organizations fill in a multi-step request form (organization, contact, event, requested amount/tier, description, supporting files). The request is emailed to the company sponsorships mailbox with Approve / Deny links; the approver can review and optionally adjust the amount, tier and notes, sign with their name, and confirm. Marketing is then notified of the decision by email. Runs on Vercel.

## Stack & architecture
- Front end: static `index.html` (multi-step form), `thanks.html`, `assets/css/styles.css`, `assets/js/main.js` — plain HTML/CSS/JS, ZTEX Red/Yellow branding
- Back end: three **Vercel Node serverless functions** (`vercel.json` v2 builds/routes)
  - `api/submit.js` — receives the form as JSON (files base64-encoded in the browser via `FileReader`), generates a `submissionId` (UUID), base64-encodes the submission into Approve/Deny links, emails the request with file attachments
  - `api/action.js` — Approve/Deny link target; requires Microsoft sign-in (approver identity from the Entra ID token), then renders the review form (adjust amount/tier, notes, "Signing as Name (email)"); shows "Already handled" if the submission is locked
  - `api/auth-login.js` / `api/auth-callback.js` (`/api/auth/login`, `/api/auth/callback`) — Microsoft Entra ID OIDC sign-in for approvers (`lib/approver.js`)
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
- `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH`, `ADMIN_SESSION_SECRET` — /admin login; `ADMIN_SESSION_SECRET` also signs approver sign-in cookies
- `MS_TENANT_ID` (ZTEX tenant `002232eb-1c3d-4754-9b76-6e8633a0fc69`), `MS_CLIENT_ID`, `MS_CLIENT_SECRET` — Entra app registration for approver sign-in. If any is missing, approve/deny pages fail closed ("Approver sign-in isn't configured yet").

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

### 2026-10-06 — Fix email sending (stale SMTP password)
- Steven's test submission failed: Microsoft rejected the timeclock@ login (`535 5.7.3 Authentication unsuccessful`). Vercel `SMTP_PASSWORD` was 103 days old and no longer matched the mailbox's app password, so the form had likely been unable to send for some time.
- Updated `SMTP_PASSWORD` (production, sensitive) to the current app password, redeployed. Live test submission returned `{"ok":true}`.
- The timeclock@ app password is still due for rotation (it was hardcoded in ZPresence until today); when rotated, update this env var too.

### 2026-10-06 — Microsoft sign-in for approvers
- Problem: the review page had an "Approving / Denying As" dropdown, so anyone holding an approve/deny link could sign as any approver.
- Approvers now sign in with their ZTEX Microsoft 365 account (Entra ID). OIDC authorization-code flow with PKCE (S256), confidential client, built on Node `crypto` + `fetch` (no new dependencies), in `lib/approver.js`:
  - `GET /api/auth/login?returnTo=…` → state, nonce and PKCE verifier stored in a 10-minute signed HttpOnly/Secure/SameSite=Lax cookie (`ztex_oidc_flow`, path `/api/auth`), redirect to the tenant's `/oauth2/v2.0/authorize` with `domain_hint=ztexconstruction.com` and no `prompt` (already signed-in users pass silently).
  - `GET /api/auth/callback` → checks state, redeems the code at the token endpoint (client secret + code_verifier), validates the `id_token` claims (iss, aud, tid, nonce, exp). Signature isn't checked: the token comes straight from the token endpoint over TLS to a confidential client (OIDC Core 3.1.3.7). Identity = lowercased `preferred_username` (fallback `email`), name = `name`. Issues an 8h `ztex_approver` cookie (path `/`, signed with `ADMIN_SESSION_SECRET`, purpose "approver" in a JSON payload, so it can't be swapped with admin cookies). Redirects back only to `/api/action?…`, otherwise `/`.
- `/api/action` redirects to sign-in when there's no session, 403s signed-in people who aren't approvers, shows "No approvers are configured yet" when the list is empty, and shows "Signing as Name (email)" instead of the dropdown (`lastApprover` cookie removed).
- `/api/confirm` takes identity only from the session cookie (any `approverName` in the form is ignored), re-checks the approver list, records `approver` + `approverEmail`, and the marketing email says "Decision made by: Name (email)". Atomic claim / release-on-email-failure unchanged.
- `/admin`: approvers are now **Microsoft 365 email addresses** (validated, lowercased, at least one required on save); warning shown when none are set. Default approvers are empty; previously stored names are ignored.
- New env vars: `MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET` (not yet set in Vercel).
- Verified with 79 mocked end-to-end checks (login URL/PKCE, callback state/nonce/tenant/aud/issuer/expiry rejection, open-redirect, non-approver 403, spoofed approverName ignored, cookie purpose separation, fail-closed config, admin approver validation, plus the existing request/admin/TOTP tests).
- Work is on local branch `feature/microsoft-signin`; not pushed or deployed (waiting for the Entra app registration).

- 2026-10-06: deployed (077c652) with Entra app "ZTEX Sponsorships Approvals" (client f9f8b710…), approvers steven/groldan/jroyo/mtarin@ set in Redis; Steven verified sign-in → approve → decision email end to end.

### 2026-10-07 — Enter key submitted incomplete requests
- Problem (reported by Steven): pressing Enter in a step-1 field triggered the form's implicit submit. The submit handler only validated step 3 (which has no required fields), so a half-filled request went to `/api/submit`, which had no validation, and was emailed to leadership.
- `assets/js/main.js`: on steps 1–2, the submit event now acts as Continue (validate the current step, then advance). On step 3, every step is re-validated and the form jumps back to the first incomplete one.
- `api/submit.js`: server-side guard. It returns 400 when orgName/contactName/email/phone/eventName/description is missing or blank, or the email is invalid, before anything is stored or emailed.
- Verified: stubbed handler tests (partial, empty, missing body, bad email, whitespace give 400 with no email or Redis write; a full request gives 200) and a local Playwright run (Enter on partial step 1/2 stays put with 0 POSTs, Enter on a complete step advances, a blanked step-1 field at submit jumps back, a complete submit gives 1 POST and /thanks).

### 2026-10-07 — Request ledger on /admin
- `/admin` now opens on a **Requests** tab; settings moved to a **Settings** tab (`/admin?view=settings`). Both sit behind the existing password + TOTP.
- New `lib/ledger.js`: a permanent record per request at `ledger:{token}` (JSON: submitted fields, attachment file names but not their contents, status, submittedAt, decision, approver, adjusted amount/tier, leadership notes), plus a sorted-set index `ledger` scored by submit time. No TTL; the `pending:` / `submission:` keys still expire after 90 days and only drive the links.
  - `api/submit.js` writes the entry (status `pending`) after the pending record.
  - `api/confirm.js` records approved/denied after the marketing email succeeds. This is best-effort: a ledger failure is logged but doesn't fail the decision. Requests that predate the ledger get an entry built from the pending record, with no submit time.
  - A pending entry older than 90 days displays as `expired`.
- UI: clickable status counters (Pending, with $ requested; Approved, with $ committed using the adjusted amount when changed; Denied; All), search (org/contact/email/phone/event/approver), expandable rows with full details, an adjusted amount shown next to the struck-through requested one, Mountain Time dates, and a responsive card layout on phones. **Export CSV** follows the current filter and search, with formula-injection protection and a UTF-8 BOM.
- No backfill: the 16 existing Redis records were all test submissions, so the ledger starts empty.
- Verified with an in-memory Redis harness running the real handlers: submit ×3 → approve with adjustment, deny, double-decision blocked; filters, search, CSV, XSS escaping, unauthenticated access blocked; legacy (pre-ledger) decision; expiry. Visual check with Playwright at desktop and phone widths.

### 2026-10-07 — Settings header fix
- On desktop the Settings tab's 560px card wrapped "Sign out" onto two lines. The settings card is now 680px (`.card.mid`), tabs and Sign out are `white-space: nowrap`, and `.mid` gets the same tighter phone padding as `.wide`. Verified with Playwright at 1280 and 390 px (single-line button, no overflow).

### 2026-10-07 — Matching tier lists + required "Other" description
- Problem (reported by Steven): the public form offered Platinum/Gold/Silver/Bronze/Custom/N/A, but the approval page offered Bronze/Silver/Gold/Platinum/Title Sponsor/In-Kind/Other. Requests with Custom, N/A or no tier opened on the approval page with **Bronze** preselected, so approving without looking silently changed the tier to Bronze.
- New `lib/tiers.js` is the single list: Title Sponsor, Platinum, Gold, Silver, Bronze, In-Kind, Not Applicable, Other. It provides `parseTier` (validation; "Other" requires a description of up to 100 characters; legacy Custom → Other and N/A → Not Applicable, with Custom accepted without a description for cached old forms) and `tierLabel` (e.g. "Other: Hole sponsor"). The index.html `<select>` must stay in sync with it, and a test checks that.
- Public form: picking Other reveals a required full-width "Describe the Tier / Level" field. It's validated by Continue, Enter and final submit, and cleared and un-required when another tier is picked. The payload adds `sponsorshipTierOther`.
- `/api/submit` validates the tier and stores `sponsorshipTierOther` in the pending record and ledger; the leadership email shows the label.
- Approval page: same list; the requested tier is preselected, a blank request shows "Not specified" (never Bronze), and Other shows a prefilled, required description field. "Requested Tier" and "Requested Amount" were added to the summary box.
- `/api/confirm` validates `adjustedTier`/`adjustedTierOther` on approve (400 page, no decision claimed); the marketing email, ledger, admin and CSV use labels.
- Verified: 20 handler checks in the in-memory harness, email HTML checks, and Playwright runs of the public form (show/hide, required, Enter blocked, payload) and the approval page (prefill, toggle, browser validation).

### 2026-10-07 — Store attachments; forward them to marketing with the decision
- Asked by Steven: marketing should receive the submitter's files with the approved/denied email. Files used to be base64 in the submit body, emailed once to leadership and never stored.
- Found along the way: Vercel rejects function request bodies over ~4.5 MB (a probe of prod gave 413), so any request with more than ~3 MB of attachments was failing even though the form promised 10 MB per file.
- Private Vercel Blob store `ztex-sponsorships-files` (created with `vercel blob create-store --access private`; `BLOB_READ_WRITE_TOKEN` in Production/Preview/Development).
- Browser uploads go straight to Blob through `@vercel/blob/client` `upload()`, bundled with esbuild into `assets/js/blob-upload.js` (IIFE, `window.BlobUpload`; no CDN). Rebuild: `printf "import { upload } from '@vercel/blob/client';\nwindow.BlobUpload = { upload };\n" > _e.mjs && npx esbuild _e.mjs --bundle --minify --format=iife --platform=browser --target=es2019 --outfile=assets/js/blob-upload.js`. Paths are `requests/<22-char random id>/<sanitized name>` with a random suffix; the submit button shows per-file upload progress.
- `api/upload.js` (`handleUpload`) issues tokens only for that path shape, with the allowed content types, 10 MB max and a 10-minute expiry, and at most 30 tokens per IP per hour (Redis `uploadrate:`).
- `lib/files.js`: `verifyFiles` (at most 5 files, all in one folder, each checked with `head()` for existence, size ≤10 MB, allowed type, total ≤20 MB) and `loadAttachments` (`get()` with `access: 'private'` into nodemailer attachments). 20 MB total keeps forwarded mail under Exchange's ~35 MB limit after encoding. Submit body limit lowered to 1 MB.
- `/api/submit` verifies the files, stores `{ pathname, name, size, contentType }` in the pending record and ledger, and attaches them to the leadership email.
- `/api/confirm` attaches them to the approved **and** denied marketing emails, with a "Submitter's Documents" list. If a file can't be read, the decision email is still sent, with a note instead of the attachments.
- `/admin`: attachment names are download links (`/admin?download=<id>&file=<pathname>`, signed-in only; the file must belong to that ledger entry; streamed as an attachment with `nosniff`). The CSV lists attachment names.
- Verified against the real Blob store with a local server running the real handlers (Redis and SMTP stubbed): a 6 MB PDF + PNG uploaded from Playwright; leadership email and approval email carried both files at exact sizes; denial email carried its file; the admin download was SHA-256 identical; unauthenticated and wrong-request downloads were blocked; missing blob, bad path, mixed folders, 6 files, non-array and bad upload-token path were all rejected; deleted-blob fallback note confirmed. Test blobs deleted.
- Known gap: files uploaded by someone who then abandons the form stay in the store (no cleanup job yet).

### 2026-10-07 — Quarterly cleanup of abandoned uploads
- Steven asked for a periodic cleanup about every 90 days. Vercel cron can't express "every 90 days", so `vercel.json` `crons` runs `/api/cleanup` at `0 9 1 1,4,7,10 *` (09:00 UTC on Jan/Apr/Jul/Oct 1).
- `api/cleanup.js` requires `Authorization: Bearer $CRON_SECRET` (Vercel sends it automatically; the secret is in Vercel prod env and Keychain `ztex-sponsorships-cron`). It collects every `pathname` referenced by any ledger entry, lists `requests/` in Blob, and deletes blobs that aren't referenced **and** are over 24 hours old (so uploads in progress are safe). Files belonging to requests are never removed. The result is saved to Redis `cleanup:last` and shown at the bottom of the admin Settings tab.
- Verified against the real Blob store: 401 without or with a wrong secret; a fresh orphan was kept; with the clock moved forward 2 days the orphan was deleted and the referenced file kept; the Settings note renders.

### 2026-10-07 — Marketing email: drop the documents section
- At Steven's request, removed the "Submitter's Documents" list from the approved/denied marketing email body; the files are still attached. A one-line red note appears only if the attachments couldn't be loaded. Verified both cases with a stubbed handler test.

### 2026-10-07 — Calendar invite on approval; event date + start time required
- Steven's spec: Event Date and Start Time are required; every invite is 1 hour, shown as Free, with a 1-day reminder; approved requests only.
- Form: Event Name is now full width; Event Date is required; new required `eventTime` (`<input type="time">`, labelled Mountain Time).
- New `lib/calendar.js`: `parseEventWhen` (server validation: real date in 2000–2100, HH:MM time), `formatEventWhen` ("Saturday, November 14, 2026 at 6:00 PM", built from the parts with no time zone shifts), and `buildInvite` (RFC 5545 METHOD:REQUEST, America/Denver VTIMEZONE, DTEND = start + 60 min, TRANSP:TRANSPARENT + X-MICROSOFT-CDO-BUSYSTATUS:FREE, attendees OPT-PARTICIPANT with RSVP=FALSE, VALARM -P1D, escaping and UTF-8-safe 75-octet folding; all-day fallback when there's no time, null when there's no date).
- `/api/submit` validates date/time, stores `eventTime` (plus description/notes now also in the pending record), and the leadership email shows "Event Date & Time".
- `/api/confirm` (approve only): after the marketing email, sends a second email to approvers ∪ marketing (lowercased, deduped) using nodemailer `icalEvent`, with an HTML/text body of the details (approved amount/tier after adjustment, description, submitter notes, leadership notes, approver) and the same attachments. This is best-effort: a failure is logged and recorded as `invite: { sent:false, reason }` without failing the decision. On success the ledger records `invite: { sent:true, to:n }`.
- The approval page summary shows the event date and time; admin details show the date and time and "Calendar invite: Sent to N people / Not sent"; the CSV adds Event Time.
- Verified: calendar unit checks (validation, formatting, midnight/year rollover, Free, reminder, folding/escaping, all-day fallback); handler flow (400 on missing date or time, leadership email/approval page show the time, approve → marketing email + invite to 3 deduped recipients with the attachment and 6–7 PM Mountain, deny → no invite, SMTP failure on the invite → approval still succeeds and the ledger shows not sent); Playwright form check. A real invite was sent to steven@ only for Outlook verification.

### 2026-10-07 — Start time optional; all-day invite fallback
- At Steven's request, Event Start Time is optional again (Event Date stays required). `parseEventWhen` accepts an empty time and rejects a malformed one.
- With no time, the invite is an all-day Free event (VALUE=DATE, no VTIMEZONE) with its reminder at `-PT18H` (6 AM the day before; `-P1D` on an all-day event would fire at midnight). Timed events are unchanged (1 hour, `-P1D`). The invite body says "(all day)".
- Verified: calendar unit checks, handler flow (date-only submit → 200 → approve → all-day Free invite), and Playwright (date still blocks, time optional, payload `eventTime: ""`).

### 2026-10-07 — Reminders for pending requests
- Steven asked for reminders on requests still pending after 5 days and every 5 days after that.
- `api/reminders.js`, daily Vercel cron `0 15 * * *` (9 AM MDT / 8 AM MST), `CRON_SECRET` auth through the shared `lib/cron.js` (cleanup uses it too). For every ledger entry with status pending whose `pending:` record still exists (the links are live), `due = floor(daysPending / 5)`. If `due` is greater than the count sent so far, it emails the **approvers** list a reminder (days waiting, summary, the same Approve/Deny links) and records `reminder:<id>` = `{ count: due, lastAt, days }` (120-day TTL). This key is kept separate from the ledger so a reminder can never overwrite a decision.
- Missed runs catch up with a single reminder; a failed send isn't recorded, so the next day retries; decided or expired requests are skipped; no approvers means skipped. At most about 18 reminders before the 90-day link expiry.
- Admin: pending rows show "Reminders sent: N (last date)" or the reminder policy.
- Verified with simulated time (days 4/5/6/9/10/10 rerun/22/24/25 failure/26 retry, decided/expired skipped, admin display, no approvers, 401s), a visual check of the email, and the earlier suites (tiers 20/20 after adding the now-required event date to the test data, all-day 6/6, invite failure, cleanup auth).

### 2026-10-07 — Spanish language toggle (public site)
- Steven asked for an English/Spanish switch on the public site. Only `index.html`, `thanks.html` and the strings `assets/js/main.js` produces are translated; emails, `/admin` and the approver pages stay English.
- New `assets/js/i18n.js` (no dependencies, no build step), loaded before `main.js`. It holds `en` and `es` dictionaries (96 keys), picks the language (saved `localStorage` key `ztex_lang` wins; otherwise `navigator.language` starting with `es` → Spanish, else English), sets `<html lang>`, and fills elements marked `data-i18n` (text), `data-i18n-html` (markup from the dictionary only, e.g. headings with `<br><em>`) and `data-i18n-placeholder` / `-aria-label` / `-title` / `-alt` / `-content` (meta description). English stays in the HTML as the fallback, so the page reads correctly without JS, and a test checks the `en` dictionary matches that HTML so the two can't drift. `window.I18n` exposes `t(key, vars)`, `serverError(message)`, `setLang`, `lang` and `onChange`.
- Toggle: `EN | ES` buttons (`.lang-toggle`, `aria-pressed`) at the end of the nav links, and floating top-right on the thanks page. Switching re-applies the dictionary in place, so typed values, the current step and attached files are untouched. Labels with a required `*` and buttons with icons got a `<span data-i18n>` around their text so only the text changes.
- `main.js`: toasts, upload progress ("Uploading file 1 of 2 (35%)..."), "Submitting..." and the file-list "Remove file" title now go through `t()`. New `serverMessage()`: `/api/submit` still returns English; known messages and the two file-name patterns (`"x" exceeds 10MB.`, `"x" isn't an allowed file type.`) are mapped to Spanish client-side, anything unknown shows the generic Spanish error with (915) 591-6900. English behaviour is unchanged (known or unknown server text shown as before). Upload failures keep the generic "A file failed to upload" toast in both languages unless the message is known. Field names, ids, `<option value>`s and the JSON payload are unchanged.
- Known limitation: the Blob client (`assets/js/blob-upload.js`) swallows `/api/upload`'s message ("Too many uploads…", "Invalid file name.") into "Failed to retrieve the client token", so those two are mapped in the dictionary but can't surface today; users see the generic upload-failed toast in their language.
- Spanish: Mexican/US Spanish, formal usted, "hora de la montaña (MT)" for Mountain Time, brand names kept. Left in English on purpose: ZTEX Construction / ZTEX, the address and phone, "(915) 000-0000" and "$0.00" placeholders, social-network names, file-type names, the "© 2025" line on the thanks page.
- CSS: `.lang-toggle` styles; `.nav-links` now `align-items: center`. The phone nav was already squeezing the logo at 390px in English, and the Spanish labels made it worse, so at ≤600px the nav stacks (logo row, then links + toggle) with a 34px logo and `nowrap` links.
- Verified with a Playwright script against `python3 -m http.server` (Chromium, 1280 and 390 px, `/api/submit`, `/api/upload` and the Blob uploader stubbed, nothing sent): language defaults (locale/saved combinations), dictionary ↔ HTML drift and key coverage, no leftover English in ES on both pages (text, placeholders, aria-labels, titles, alt, options, `<title>`, meta), option values unchanged, no horizontal overflow and nav/step-label/button layout at 360–1280 px, toggle mid-form keeps values/step/files, validation errors, the "Other" box, client toasts, upload-progress and "Enviando..." text, identical `/api/submit` payload in EN and ES, 14 server error messages per language, upload-token failure through the real Blob client, persistence across reload and onto `/thanks`, and the no-JS English fallback. Screenshots in `/tmp/alan-spanish/`.
- Branch `feature/spanish-toggle`, not merged or deployed.

## Current status & next steps
- Status: production, live at sponsorships.ztexconstruction.com. Last code change 2026-06-25.
- No open TODOs in code and no next steps recorded.
- Possible cleanup (not requested): remove unused dependencies (`express`, `multer`, `formidable`, `@vercel/kv`) and the dead `start`/`dev` scripts; turn off the stale GitHub Pages site.

## Gotchas
- Approver sign-in needs an Entra app registration in the ZTEX tenant: single tenant, Web redirect URI exactly `https://sponsorships.ztexconstruction.com/api/auth/callback`, a client secret, delegated Microsoft Graph permissions `openid`, `profile`, `email` with admin consent granted (so approvers aren't prompted). Put its IDs/secret in `MS_TENANT_ID` / `MS_CLIENT_ID` / `MS_CLIENT_SECRET` (production) before deploying. The secret expires — renew it in Entra and update `MS_CLIENT_SECRET` before then, or approvals stop working.
- After deploying Microsoft sign-in, approver emails must be entered in `/admin` (old approver names are ignored); until then every approve/deny link shows "No approvers are configured yet".
- Sign-in only works on the production domain (the redirect URI is hardcoded), not on Vercel preview URLs.
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
