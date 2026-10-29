const nodemailer = require('nodemailer');

// Office 365 SMTP, sending as the sponsorships mailbox. Shared by every email the portal sends.
function createTransporter() {
  return nodemailer.createTransport({
    host: 'smtp.office365.com',
    port: 587,
    secure: false,
    auth: {
      user: 'timeclock@ztexconstruction.com',
      pass: process.env.SMTP_PASSWORD
    },
    tls: { ciphers: 'SSLv3' }
  });
}

module.exports = { createTransporter };
