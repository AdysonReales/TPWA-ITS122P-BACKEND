const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const crypto = require('crypto');
const SALT_ROUNDS = 10;
const TOKEN_EXPIRY = '1d';

let resend = null;
try {
  const { Resend } = require('resend');
  if (process.env.RESEND_API_KEY) {
    resend = new Resend(process.env.RESEND_API_KEY);
  }
} catch {
  // resend package not yet installed or configured
}

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

    // Return a generic message even if email is not found to prevent user enumeration
    if (!user) {
      return res.status(200).json({
        message: 'If an account exists, a reset link has been dispatched.',
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

    // 3. Construct the reset link (Prioritizing Vercel production or custom CLIENT/FRONTEND_URL)
    const clientBaseUrl =
      process.env.FRONTEND_URL ||
      process.env.CLIENT_URL ||
      req.get('origin') ||
      'https://tpwa-its122p-frontend.vercel.app';

    const cleanBaseUrl = clientBaseUrl.replace(/\/$/, '');
    const resetUrl = `${cleanBaseUrl}/reset-password?token=${token}`;

    console.log(`\n🔑 [PASSWORD RESET LINK]: ${resetUrl}\n`);

    // 4. Send via Resend
    if (resend) {
      try {
      await resend.emails.send({
        from: 'LakBye <onboarding@resend.dev>',
        to: user.email,
        subject: 'Reset your LakBye password',
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; border: 1px solid #eaeaea; border-radius: 12px; background-color: #ffffff;">
            <div style="margin-bottom: 20px;">
              <h1 style="color: #f05a28; font-size: 24px; font-weight: 800; margin: 0;">LakBye</h1>
            </div>
            <h2 style="color: #111; margin-bottom: 12px; font-size: 18px;">Reset Your Password</h2>
            <p style="color: #555; font-size: 15px; line-height: 1.5;">
              Hi ${user.full_name || 'Traveler'},
            </p>
            <p style="color: #555; font-size: 15px; line-height: 1.5;">
              We received a request to reset your password for your LakBye account. Click the button below to choose a new password:
            </p>
            <div style="margin: 28px 0;">
              <a href="${resetUrl}" style="background-color: #f05a28; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 14px; display: inline-block;">
                Reset Password
              </a>
            </div>
            <p style="color: #888; font-size: 13px; line-height: 1.5;">
              This link is valid for 30 minutes. If you did not request this change, you can safely ignore this email.
            </p>
            <hr style="border: none; border-top: 1px solid #eaeaea; margin: 24px 0;" />
            <p style="color: #aaa; font-size: 12px; line-height: 1.4;">
              If you are having trouble clicking the button, copy and paste this URL into your browser:<br/>
              <a href="${resetUrl}" style="color: #f05a28; word-break: break-all;">${resetUrl}</a>
            </p>
          </div>
        `,
      });

      console.log(`✉️ Password reset email successfully dispatched to: ${user.email}`);
    } catch (emailErr) {
      console.error('Resend delivery error:', emailErr);
      // Even if Resend free tier has domain restrictions, keep going so local/dev testing does not crash
    }
    } else {
      console.log(`\n✉️ [RESEND_API_KEY NOT CONFIGURED] Reset link for ${user.email}: ${resetUrl}\n`);
    }

    return res.status(200).json({
      message: 'If an account exists, a reset link has been dispatched.',
      devResetUrl: process.env.NODE_ENV !== 'production' ? resetUrl : undefined,
    });
  } catch (err) {
    console.error('Forgot password error:', err);
    return res.status(500).json({ message: 'Failed to process password reset request.' });
  }
}

// POST /api/auth/reset-password
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

    console.log(`🔐 Password successfully updated for user ID: ${user.id} (${user.email})`);

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

