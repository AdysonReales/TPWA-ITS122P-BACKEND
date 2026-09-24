const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const crypto = require('crypto');
const SibApiV3Sdk = require('@getbrevo/brevo');

const SALT_ROUNDS = 10;
const TOKEN_EXPIRY = '1d';

let apiInstance = null;
if (process.env.BREVO_API_KEY) {
  apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();
  apiInstance.setApiKey(SibApiV3Sdk.TransactionalEmailsApiApiKeys.apiKey, process.env.BREVO_API_KEY);
}

const sendOtpEmail = async (toEmail, otp, resetUrl) => {
  if (!apiInstance && process.env.BREVO_API_KEY) {
    apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();
    apiInstance.setApiKey(SibApiV3Sdk.TransactionalEmailsApiApiKeys.apiKey, process.env.BREVO_API_KEY);
  }

  if (!apiInstance) {
    throw new Error('BREVO_API_KEY is not configured');
  }

  const senderEmail = process.env.EMAIL_FROM || 'no-reply@lakbye.com';
  const email = new SibApiV3Sdk.SendSmtpEmail();
  email.sender = { email: senderEmail, name: 'LakBye' };
  email.to = [{ email: toEmail }];
  email.subject = 'Your LakBye password reset code';
  email.htmlContent = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; border: 1px solid #eaeaea; border-radius: 12px; background-color: #ffffff;">
      <div style="margin-bottom: 20px;">
        <h1 style="color: #f05a28; font-size: 24px; font-weight: 800; margin: 0;">LakBye</h1>
      </div>
      <h2 style="color: #111; margin-bottom: 12px; font-size: 18px;">Reset Your Password</h2>
      <p style="color: #555; font-size: 15px; line-height: 1.5;">
        Your reset code is: <strong style="font-size: 18px; color: #f05a28; letter-spacing: 1px;">${otp}</strong>.
      </p>
      <p style="color: #555; font-size: 14px; line-height: 1.5;">
        This code expires in 30 minutes.
      </p>
      ${
        resetUrl
          ? `<div style="margin: 28px 0;">
              <a href="${resetUrl}" style="background-color: #f05a28; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 14px; display: inline-block;">
                Reset Password Link
              </a>
            </div>
            <p style="color: #888; font-size: 13px; line-height: 1.5;">
              If you are having trouble clicking the button, copy and paste this URL into your browser:<br/>
              <a href="${resetUrl}" style="color: #f05a28; word-break: break-all;">${resetUrl}</a>
            </p>`
          : ''
      }
      <hr style="border: none; border-top: 1px solid #eaeaea; margin: 24px 0;" />
      <p style="color: #aaa; font-size: 12px; line-height: 1.4;">
        If you did not request this password reset, you can safely ignore this email.
      </p>
    </div>
  `;
  return apiInstance.sendTransacEmail(email);
};

function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, username: user.username },
    process.env.JWT_SECRET,
    { expiresIn: TOKEN_EXPIRY }
  );
}

function setAuthCookie(res, token) {
  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 24 * 60 * 60 * 1000, // 1 day
  });
}

// POST /api/auth/register
async function register(req, res) {
  try {
    const { full_name, email, password, role } = req.body;

    if (!full_name || !email || !password) {
      return res.status(400).json({ message: 'full_name, email, and password are required.' });
    }

    if (password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters.' });
    }

    // Only allow "customer" on public self-registration.
    // Admin/Staff accounts should be created via the admin-only user management route.
    const safeRole = 'customer';
    void role; // ignored on purpose for public registration

    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ message: 'Email is already registered.' });
    }

    const password_hash = await bcrypt.hash(password, SALT_ROUNDS);

    const result = await pool.query(
      `INSERT INTO users (full_name, email, password_hash, role, username, avatar_url, bio)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, full_name, email, role, username, avatar_url, bio, created_at`,
      [full_name, email, password_hash, safeRole, null, null, null]
    );

    const user = result.rows[0];
    const token = signToken(user);
    setAuthCookie(res, token);

    return res.status(201).json({
      message: 'Registration successful.',
      user,
      token, // also returned in body for frontends using bearer-token auth
    });
  } catch (err) {
    console.error('Register error:', err);
    return res.status(500).json({ message: 'Server error during registration.' });
  }
}

// POST /api/auth/login
async function login(req, res) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'email and password are required.' });
    }

    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    if (!user.is_active) {
      return res.status(403).json({ message: 'This account has been deactivated. Contact an administrator.' });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    const token = signToken(user);
    setAuthCookie(res, token);

    return res.status(200).json({
      message: 'Login successful.',
      user: {
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        role: user.role,
      },
      token,
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ message: 'Server error during login.' });
  }
}

// POST /api/auth/logout
function logout(req, res) {
  res.clearCookie('token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  });
  return res.status(200).json({ message: 'Logged out successfully.' });
}

// GET /api/auth/me
async function getCurrentUser(req, res) {
  try {
    const result = await pool.query(
      'SELECT id, full_name, email, role, username, avatar_url, bio, created_at FROM users WHERE id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found.' });
    }

    return res.status(200).json({ user: result.rows[0] });
  } catch (err) {
    console.error('Get current user error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
}

// POST /api/auth/forgot-password
async function forgotPassword(req, res) {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: 'Email is required.' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const userRes = await pool.query(
      'SELECT id, email, full_name FROM users WHERE LOWER(email) = $1',
      [cleanEmail]
    );
    const user = userRes.rows[0];

    // Return generic message if email is not found to prevent user enumeration
    if (!user) {
      console.log(`[PASSWORD RESET] No user found for: ${cleanEmail}`);
      return res.status(200).json({
        message: 'If an account exists, a reset link has been dispatched.',
        accountFound: false,
      });
    }

    // 1. Generate secure random token and expiration window
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 1000 * 60 * 30); // 30 minutes expiry

    // 2. Persist token and expiration to the database
    await pool.query(
      'UPDATE users SET reset_password_token = $1, reset_password_expires = $2 WHERE id = $3',
      [token, expiresAt, user.id]
    );

    // 3. Construct the reset link (Prioritizing request origin, client URL, or production domain)
    const clientBaseUrl =
      req.get('origin') ||
      process.env.CLIENT_URL ||
      process.env.FRONTEND_URL ||
      'https://lakbye.vercel.app';

    const cleanBaseUrl = clientBaseUrl.replace(/\/$/, '');
    const resetUrl = `${cleanBaseUrl}/reset-password?token=${token}`;

    console.log(`\n[PASSWORD RESET LINK]: ${resetUrl}\n`);

    // 4. Send via Brevo if configured
    let emailSent = false;
    let emailError = null;

    if (process.env.BREVO_API_KEY) {
      try {
        await sendOtpEmail(user.email, token, resetUrl);
        emailSent = true;
        console.log(`[BREVO] Password reset email successfully dispatched to: ${user.email}`);
      } catch (emailErr) {
        emailError = emailErr?.response?.text || emailErr?.message || 'Email delivery failed';
        console.error('Brevo delivery error:', emailErr?.response?.text || emailErr);
      }
    } else {
      console.log(`\n[BREVO_API_KEY NOT CONFIGURED] Reset link for ${user.email}: ${resetUrl}\n`);
    }

    return res.status(200).json({
      message: emailSent
        ? 'A reset link has been dispatched to your email.'
        : 'If an account exists, a reset link has been dispatched.',
      accountFound: true,
      emailSent,
      emailError: emailError || undefined,
      // Provide devResetUrl whenever email delivery could not be completed or in non-production
      devResetUrl: (!emailSent || process.env.NODE_ENV !== 'production') ? resetUrl : undefined,
    });
  } catch (err) {
    console.error('Forgot password error:', err);
    return res.status(500).json({ message: 'Failed to process password reset request.' });
  }
}

async function resetPassword(req, res) {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({ message: 'Token and new password are required.' });
    }

    if (password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters long.' });
    }

    // 1. Locate user by matching token and verifying timestamptz expiry against NOW()
    const userRes = await pool.query(
      `SELECT id, email 
       FROM users 
       WHERE reset_password_token = $1 
         AND reset_password_expires > NOW()`,
      [token]
    );

    const user = userRes.rows[0];
    if (!user) {
      return res.status(400).json({
        message: 'Invalid or expired password reset link. Please request a new one.',
      });
    }

    // 2. Hash new password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // 3. Update password and clear token columns in the database
    await pool.query(
      `UPDATE users 
       SET password_hash = $1, 
           reset_password_token = NULL, 
           reset_password_expires = NULL 
       WHERE id = $2`,
      [passwordHash, user.id]
    );

    console.log(`Password successfully updated for user ID: ${user.id} (${user.email})`);

    return res.status(200).json({
      message: 'Password updated successfully! You can now log in with your new password.',
    });
  } catch (err) {
    console.error('Reset password error:', err);
    return res.status(500).json({ message: 'Failed to reset password. Please try again.' });
  }
}

/**
 * Automatically ensures password recovery columns exist in PostgreSQL on startup.
 */
async function initAuthColumns() {
  try {
    await pool.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS reset_password_token VARCHAR(255),
      ADD COLUMN IF NOT EXISTS reset_password_expires TIMESTAMPTZ;
    `);
    console.log('User auth password recovery columns verified.');
  } catch (err) {
    console.error('Failed to verify user auth password recovery columns:', err);
  }
}

module.exports = { register, login, logout, getCurrentUser, forgotPassword, resetPassword, initAuthColumns };
