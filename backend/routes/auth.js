// backend/routes/auth.js
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { 
  hashPassword, 
  comparePassword, 
  generateToken, 
  isValidEmail, 
  isValidPassword, 
  sanitizeUser 
} = require('../utils/auth');
const { authenticateToken } = require('../middleware/auth');

// SIGN UP
router.post('/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Validate input
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Name, email, and password are required'
      });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({
        success: false,
        error: 'Please enter a valid email address'
      });
    }

    if (!isValidPassword(password)) {
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 8 characters with at least one letter and one number'
      });
    }

    if (name.trim().length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Name must be at least 2 characters long'
      });
    }

    // Check if user already exists
    const existingUserQuery = 'SELECT id FROM users WHERE email = $1';
    const existingUser = await pool.query(existingUserQuery, [email.toLowerCase()]);

    if (existingUser.rows.length > 0) {
      return res.status(409).json({
        success: false,
        error: 'An account with this email already exists'
      });
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Insert new user
    const insertUserQuery = `
      INSERT INTO users (name, email, password_hash, plan) 
      VALUES ($1, $2, $3, $4) 
      RETURNING id, name, email, plan, created_at
    `;
    
    const newUser = await pool.query(insertUserQuery, [
      name.trim(),
      email.toLowerCase(),
      hashedPassword,
      'free'
    ]);

    const user = newUser.rows[0];

    // Generate JWT token
    const token = generateToken(user.id, user.email);

    console.log('✅ New user registered:', user.email);

    res.status(201).json({
      success: true,
      message: 'Account created successfully',
      user: sanitizeUser(user),
      token
    });

  } catch (error) {
    console.error('❌ Signup error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create account. Please try again.'
    });
  }
});

// SIGN IN
router.post('/signin', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required'
      });
    }

    // Find user by email
    const userQuery = 'SELECT * FROM users WHERE email = $1';
    const userResult = await pool.query(userQuery, [email.toLowerCase()]);

    if (userResult.rows.length === 0) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password'
      });
    }

    const user = userResult.rows[0];

    // Check if account is active
    if (!user.is_active) {
      return res.status(401).json({
        success: false,
        error: 'Account is deactivated'
      });
    }

    // Compare password
    const isPasswordValid = await comparePassword(password, user.password_hash);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password'
      });
    }

    // Update last login
    const updateLoginQuery = 'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1';
    await pool.query(updateLoginQuery, [user.id]);

    // Generate JWT token
    const token = generateToken(user.id, user.email);

    console.log('✅ User signed in:', user.email);

    res.json({
      success: true,
      message: 'Signed in successfully',
      user: sanitizeUser(user),
      token
    });

  } catch (error) {
    console.error('❌ Signin error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to sign in. Please try again.'
    });
  }
});

// GET USER PROFILE (protected route)
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    res.json({
      success: true,
      user: req.user
    });
  } catch (error) {
    console.error('❌ Profile error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get profile'
    });
  }
});

// UPDATE PROFILE (protected route)
router.put('/profile', authenticateToken, async (req, res) => {
  try {
    const { name } = req.body;
    const userId = req.user.id;

    if (!name || name.trim().length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Name must be at least 2 characters long'
      });
    }

    const updateQuery = `
      UPDATE users 
      SET name = $1 
      WHERE id = $2 
      RETURNING id, name, email, plan, created_at
    `;
    
    const result = await pool.query(updateQuery, [name.trim(), userId]);
    const updatedUser = result.rows[0];

    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: sanitizeUser(updatedUser)
    });

  } catch (error) {
    console.error('❌ Profile update error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update profile'
    });
  }
});

// CHANGE PASSWORD (protected route)
router.put('/change-password', authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        error: 'Current password and new password are required'
      });
    }

    if (!isValidPassword(newPassword)) {
      return res.status(400).json({
        success: false,
        error: 'New password must be at least 8 characters with at least one letter and one number'
      });
    }

    // Get current password hash
    const userQuery = 'SELECT password_hash FROM users WHERE id = $1';
    const userResult = await pool.query(userQuery, [userId]);
    const user = userResult.rows[0];

    // Verify current password
    const isCurrentPasswordValid = await comparePassword(currentPassword, user.password_hash);
    
    if (!isCurrentPasswordValid) {
      return res.status(401).json({
        success: false,
        error: 'Current password is incorrect'
      });
    }

    // Hash new password
    const hashedNewPassword = await hashPassword(newPassword);

    // Update password
    const updateQuery = 'UPDATE users SET password_hash = $1 WHERE id = $2';
    await pool.query(updateQuery, [hashedNewPassword, userId]);

    res.json({
      success: true,
      message: 'Password changed successfully'
    });

  } catch (error) {
    console.error('❌ Password change error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to change password'
    });
  }
});

// SIGN OUT (protected route)
router.post('/signout', authenticateToken, (req, res) => {
  // Since we're using stateless JWT, we just send a success response
  // The frontend will remove the token from storage
  res.json({
    success: true,
    message: 'Signed out successfully'
  });
});

module.exports = router;