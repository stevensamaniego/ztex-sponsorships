const nodemailer = require('nodemailer');
const { IncomingForm } = require('formidable');
const fs = require('fs');

export const config = { api: { bodyParser: false } };

const EMAIL_TO = process.env.SPONSORSHIP_EMAIL || 'sponsorships@ztexconstruction.com';
const SMTP_HOST = process.env.SMTP_HOST || 'smtp.office365.com';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587');
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';

function parseForm(req) {
    return new Promise((resolve, reject) => {
        const form = new IncomingForm({
            maxFileSize: 10 * 1024 * 1024,
            maxFiles: 5,
            allowEmptyFiles: false,
        });
        form.parse(req, (err, fields, files) => {
            if (err) reject(err);
            else resolve({ fields, files });
        });
    });
}

function val(v) {
    return Array.isArray(v) ? v[0] : v || '';
}

function escHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { fields, files } = await parseForm(req);

        const orgName = val(fields.orgName);
        const contactName = val(fields.contactName);
        const email = val(fields.email);
        const phone = val(fields.phone);
        const eventName = val(fields.eventName);
        const eventDate = val(fields.eventDate);
        const sponsorshipAmount = val(fields.sponsorshipAmount);
        const sponsorshipTier = val(fields.sponsorshipTier);
        const description = val(fields.description);
        const additionalNotes = val(fields.additionalNotes);

        if (!orgName || !contactName || !email || !phone || !eventName || !description) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const submittedAt = new Date().toLocaleString('en-US', {
            timeZone: 'America/Denver',
            dateStyle: 'full',
            timeStyle: 'short'
        });

        // Collect uploaded files
        const fileEntries = files.files ? (Array.isArray(files.files) ? files.files : [files.files]) : [];

        const emailHtml = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 20px; }
                .container { max-width: 600px; margin: 0 auto; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
                .header { background: #c10e20; padding: 24px 32px; }
                .header h1 { color: #fff; font-size: 20px; margin: 0; }
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
                    <p>Submitted ${escHtml(submittedAt)}</p>
                </div>
                <div class="body">
                    <div class="field">
                        <div class="field-label">Organization</div>
                        <div class="field-value"><strong>${escHtml(orgName)}</strong></div>
                    </div>
                    <div class="field">
                        <div class="field-label">Contact</div>
                        <div class="field-value">${escHtml(contactName)}<br>${escHtml(email)} | ${escHtml(phone)}</div>
                    </div>
                    <div class="divider"></div>
                    <div class="field">
                        <div class="field-label">Event / Sponsorship</div>
                        <div class="field-value"><strong>${escHtml(eventName)}</strong></div>
                    </div>
                    ${eventDate ? `<div class="field"><div class="field-label">Event Date</div><div class="field-value">${escHtml(eventDate)}</div></div>` : ''}
                    ${sponsorshipAmount ? `<div class="field"><div class="field-label">Amount Requested</div><div class="field-value">${escHtml(sponsorshipAmount)}</div></div>` : ''}
                    ${sponsorshipTier ? `<div class="field"><div class="field-label">Tier / Level</div><div class="field-value">${escHtml(sponsorshipTier)}</div></div>` : ''}
                    <div class="divider"></div>
                    <div class="field">
                        <div class="field-label">Description</div>
                        <div class="description"><p>${escHtml(description)}</p></div>
                    </div>
                    ${additionalNotes ? `<div class="field"><div class="field-label">Additional Notes</div><div class="field-value" style="font-size:14px;color:#555;">${escHtml(additionalNotes)}</div></div>` : ''}
                    ${fileEntries.length > 0 ? `<div class="divider"></div><div class="files"><p>📎 ${fileEntries.length} file(s) attached</p></div>` : ''}
                </div>
                <div class="footer">
                    <p>ZTEX Construction Sponsorship Portal</p>
                </div>
            </div>
        </body>
        </html>`;

        // Send email if SMTP is configured
        if (SMTP_USER && SMTP_PASS) {
            const transporter = nodemailer.createTransport({
                host: SMTP_HOST,
                port: SMTP_PORT,
                secure: SMTP_PORT === 465,
                auth: { user: SMTP_USER, pass: SMTP_PASS }
            });

            const attachments = fileEntries.map(f => ({
                filename: f.originalFilename || f.newFilename,
                path: f.filepath
            }));

            await transporter.sendMail({
                from: `"ZTEX Sponsorship Portal" <${SMTP_USER}>`,
                to: EMAIL_TO,
                replyTo: email,
                subject: `Sponsorship Request: ${eventName} — ${orgName}`,
                html: emailHtml,
                attachments
            });
        }

        console.log(`[SUBMISSION] ${orgName} — ${eventName} (${email}) [${fileEntries.length} files]`);

        return res.status(200).json({ success: true, message: 'Sponsorship request submitted successfully' });
    } catch (err) {
        console.error('Submission error:', err);
        return res.status(500).json({ error: 'Failed to process submission' });
    }
}
