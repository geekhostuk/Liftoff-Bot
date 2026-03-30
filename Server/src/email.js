const nodemailer = require('nodemailer');

let _transporter = null;

function getTransporter() {
  if (_transporter) return _transporter;

  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '465', 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    console.warn('[email] SMTP not configured — emails will not be sent. Set SMTP_HOST, SMTP_USER, SMTP_PASS.');
    return null;
  }

  _transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  return _transporter;
}

async function sendVerificationEmail(to, token) {
  const transporter = getTransporter();
  if (!transporter) {
    console.warn(`[email] Would send verification email to ${to} (SMTP not configured)`);
    return;
  }

  const siteUrl = process.env.SITE_URL || 'http://localhost:5173';
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  const verifyUrl = `${siteUrl}/verify?token=${encodeURIComponent(token)}`;

  await transporter.sendMail({
    from,
    to,
    subject: 'Verify your Liftoff Competition account',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #1a1a2e;">Liftoff Competition</h2>
        <p>Thanks for registering! Click the button below to verify your email address:</p>
        <p style="text-align: center; margin: 24px 0;">
          <a href="${verifyUrl}"
             style="display: inline-block; padding: 12px 24px; background: #00BFFF;
                    color: #fff; text-decoration: none; border-radius: 6px; font-weight: bold;">
            Verify Email
          </a>
        </p>
        <p style="color: #666; font-size: 13px;">
          Or copy this link: <a href="${verifyUrl}">${verifyUrl}</a>
        </p>
        <p style="color: #999; font-size: 12px;">This link expires in 24 hours.</p>
      </div>
    `,
  });
}

async function sendPasswordResetEmail(to, token) {
  const transporter = getTransporter();
  if (!transporter) {
    console.warn(`[email] Would send password reset email to ${to} (SMTP not configured)`);
    return;
  }

  const siteUrl = process.env.SITE_URL || 'http://localhost:5173';
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  const resetUrl = `${siteUrl}/reset-password?token=${encodeURIComponent(token)}`;

  await transporter.sendMail({
    from,
    to,
    subject: 'Reset your Liftoff Competition password',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #1a1a2e;">Liftoff Competition</h2>
        <p>We received a request to reset your password. Click the button below:</p>
        <p style="text-align: center; margin: 24px 0;">
          <a href="${resetUrl}"
             style="display: inline-block; padding: 12px 24px; background: #00BFFF;
                    color: #fff; text-decoration: none; border-radius: 6px; font-weight: bold;">
            Reset Password
          </a>
        </p>
        <p style="color: #666; font-size: 13px;">
          Or copy this link: <a href="${resetUrl}">${resetUrl}</a>
        </p>
        <p style="color: #999; font-size: 12px;">This link expires in 1 hour. If you didn't request this, ignore this email.</p>
      </div>
    `,
  });
}

module.exports = { sendVerificationEmail, sendPasswordResetEmail };
