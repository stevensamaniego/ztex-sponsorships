/* ==========================================================================
   ZTEX Sponsorship Portal — Backend
   Handles form submissions, file uploads, and email notifications
   ========================================================================== */

const express = require('express');
const multer = require('multer');
const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Config ---
const EMAIL_TO = process.env.SPONSORSHIP_EMAIL || 'sponsorships@ztexconstruction.com';
const SMTP_HOST = process.env.SMTP_HOST || 'smtp.office365.com';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587');
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';

// --- File Upload Config ---
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const submissionDir = path.join(uploadsDir, `${Date.now()}`);
        fs.mkdirSync(submissionDir, { recursive: true });
        req.submissionDir = submissionDir;
        cb(null, submissionDir);
    },
    filename: (req, file, cb) => {
        // Sanitize filename
        const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
        cb(null, safe);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024, files: 5 },
    fileFilter: (req, file, cb) => {
        const allowed = [
            'application/pdf',
            'image/jpeg', 'image/png',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        ];
        cb(null, allowed.includes(file.mimetype));
    }
});

// --- Static Files ---
app.use(express.static(path.join(__dirname)));
app.use(express.json());

// --- Health Check ---
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
});

// --- Form Submission ---
app.post('/api/submit', upload.array('files', 5), async (req, res) => {
    try {
        const {
            orgName, contactName, email, phone,
            eventName, eventDate, sponsorshipAmount,
            sponsorshipTier, description, additionalNotes
        } = req.body;

        // Validate required fields
        if (!orgName || !contactName || !email || !phone || !eventName || !description) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const files = req.files || [];
        const submittedAt = new Date().toLocaleString('en-US', {
            timeZone: 'America/Denver',
            dateStyle: 'full',
            timeStyle: 'short'
        });

        // Build email HTML
        const emailHtml = buildEmailHtml({
            orgName, contactName, email, phone,
            eventName, eventDate, sponsorshipAmount,
            sponsorshipTier, description, additionalNotes,
            fileCount: files.length, submittedAt
        });

        // Build plain text fallback
        const emailText = buildEmailText({
            orgName, contactName, email, phone,
            eventName, eventDate, sponsorshipAmount,
            sponsorshipTier, description, additionalNotes,
            fileCount: files.length, submittedAt
        });

        // Prepare email attachments
        const attachments = files.map(f => ({
            filename: f.originalname,
            path: f.path
        }));

        // Send email
        if (SMTP_USER && SMTP_PASS) {
            const transporter = nodemailer.createTransport({
                host: SMTP_HOST,
                port: SMTP_PORT,
                secure: SMTP_PORT === 465,
                auth: { user: SMTP_USER, pass: SMTP_PASS }
            });

            await transporter.sendMail({
                from: `"ZTEX Sponsorship Portal" <${SMTP_USER}>`,
                to: EMAIL_TO,
                replyTo: email,
                subject: `Sponsorship Request: ${eventName} — ${orgName}`,
                text: emailText,
                html: emailHtml,
                attachments
            });

            console.log(`[${new Date().toISOString()}] Email sent for: ${orgName} — ${eventName}`);
        } else {
            // No SMTP configured — log submission
            console.log(`[${new Date().toISOString()}] SUBMISSION (no SMTP configured):`);
            console.log(JSON.stringify(req.body, null, 2));
            console.log(`Files: ${files.map(f => f.originalname).join(', ') || 'none'}`);
        }

        // Log to submissions file
        const logEntry = {
            timestamp: new Date().toISOString(),
            orgName, contactName, email, phone,
            eventName, eventDate, sponsorshipAmount,
            sponsorshipTier, description, additionalNotes,
            files: files.map(f => ({ name: f.originalname, size: f.size, path: f.path }))
        };

        const logFile = path.join(__dirname, 'submissions.log');
        fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n');

        res.json({ success: true, message: 'Sponsorship request submitted successfully' });
    } catch (err) {
        console.error('Submission error:', err);
        res.status(500).json({ error: 'Failed to process submission' });
    }
});

// --- Email Templates ---
function buildEmailHtml(data) {
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body { font-family: Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 20px; }
            .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
            .header { background: #c10e20; padding: 24px 32px; }
            .header h1 { color: #ffffff; font-size: 20px; margin: 0; }
            .header p { color: rgba(255,255,255,0.8); font-size: 13px; margin: 4px 0 0; }
            .body { padding: 32px; }
            .field { margin-bottom: 16px; }
            .field-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #888; font-weight: 600; margin-bottom: 4px; }
            .field-value { font-size: 15px; color: #2a2a2a; line-height: 1.5; }
            .divider { height: 1px; background: #eee; margin: 24px 0; }
            .description { background: #f8f8f8; padding: 16px; border-radius: 6px; border-left: 3px solid #c10e20; }
            .description p { margin: 0; font-size: 14px; line-height: 1.6; color: #333; white-space: pre-wrap; }
            .files { background: #f0f0f0; padding: 12px 16px; border-radius: 6px; }
            .files p { margin: 0; font-size: 13px; color: #555; }
            .footer { padding: 16px 32px; background: #fafafa; border-top: 1px solid #eee; text-align: center; }
            .footer p { font-size: 11px; color: #aaa; margin: 0; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>New Sponsorship Request</h1>
                <p>Submitted ${data.submittedAt}</p>
            </div>
            <div class="body">
                <div class="field">
                    <div class="field-label">Organization</div>
                    <div class="field-value"><strong>${escHtml(data.orgName)}</strong></div>
                </div>
                <div class="field">
                    <div class="field-label">Contact</div>
                    <div class="field-value">${escHtml(data.contactName)}<br>${escHtml(data.email)} | ${escHtml(data.phone)}</div>
                </div>
                <div class="divider"></div>
                <div class="field">
                    <div class="field-label">Event / Sponsorship</div>
                    <div class="field-value"><strong>${escHtml(data.eventName)}</strong></div>
                </div>
                ${data.eventDate ? `<div class="field"><div class="field-label">Event Date</div><div class="field-value">${escHtml(data.eventDate)}</div></div>` : ''}
                ${data.sponsorshipAmount ? `<div class="field"><div class="field-label">Amount Requested</div><div class="field-value">${escHtml(data.sponsorshipAmount)}</div></div>` : ''}
                ${data.sponsorshipTier ? `<div class="field"><div class="field-label">Tier / Level</div><div class="field-value">${escHtml(data.sponsorshipTier)}</div></div>` : ''}
                <div class="divider"></div>
                <div class="field">
                    <div class="field-label">Description</div>
                    <div class="description"><p>${escHtml(data.description)}</p></div>
                </div>
                ${data.additionalNotes ? `
                <div class="field">
                    <div class="field-label">Additional Notes</div>
                    <div class="field-value" style="font-size:14px;color:#555;">${escHtml(data.additionalNotes)}</div>
                </div>` : ''}
                ${data.fileCount > 0 ? `
                <div class="divider"></div>
                <div class="files"><p>📎 ${data.fileCount} file(s) attached</p></div>` : ''}
            </div>
            <div class="footer">
                <p>ZTEX Construction Sponsorship Portal — sponsorships.ztexconstruction.com</p>
            </div>
        </div>
    </body>
    </html>`;
}

function buildEmailText(data) {
    let text = `NEW SPONSORSHIP REQUEST\n`;
    text += `Submitted: ${data.submittedAt}\n`;
    text += `${'='.repeat(50)}\n\n`;
    text += `Organization: ${data.orgName}\n`;
    text += `Contact: ${data.contactName}\n`;
    text += `Email: ${data.email}\n`;
    text += `Phone: ${data.phone}\n\n`;
    text += `Event: ${data.eventName}\n`;
    if (data.eventDate) text += `Date: ${data.eventDate}\n`;
    if (data.sponsorshipAmount) text += `Amount Requested: ${data.sponsorshipAmount}\n`;
    if (data.sponsorshipTier) text += `Tier: ${data.sponsorshipTier}\n`;
    text += `\nDescription:\n${data.description}\n`;
    if (data.additionalNotes) text += `\nAdditional Notes:\n${data.additionalNotes}\n`;
    if (data.fileCount > 0) text += `\nAttachments: ${data.fileCount} file(s)\n`;
    text += `\n${'='.repeat(50)}\n`;
    text += `ZTEX Construction Sponsorship Portal`;
    return text;
}

function escHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// --- Start Server ---
app.listen(PORT, () => {
    console.log(`\n  ZTEX Sponsorship Portal`);
    console.log(`  Running on http://localhost:${PORT}`);
    console.log(`  Email target: ${EMAIL_TO}`);
    console.log(`  SMTP: ${SMTP_USER ? 'configured' : 'NOT configured (logging only)'}\n`);
});
