// backend/middleware/auth.js
const { verifyToken } = require('../utils/auth');
const pool = require('../config/database');

// Middleware to verify JWT token
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({ 
        success: false, 
        error: 'Access token required' 
      });
    }

    // Verify token
    const decoded = verifyToken(token);
    
    // Get user from database to ensure they still exist and are active
    const userQuery = 'SELECT id, name, email, plan, is_active FROM users WHERE id = $1';
    const userResult = await pool.query(userQuery, [decoded.userId]);
    
    if (userResult.rows.length === 0) {
      return res.status(401).json({ 
        success: false, 
        error: 'User not found' 
      });
    }

    const user = userResult.rows[0];
    
    if (!user.is_active) {
      return res.status(401).json({ 
        success: false, 
        error: 'Account is deactivated' 
      });
    }

    // Add user info to request object
    req.user = user;
    next();
    
  } catch (error) {
    console.error('❌ Token verification error:', error);
    return res.status(403).json({ 
      success: false, 
      error: 'Invalid token' 
    });
  }
};

// Middleware to check if user has premium plan
const requirePremium = (req, res, next) => {
  if (req.user.plan !== 'premium') {
    return res.status(403).json({ 
      success: false, 
      error: 'Premium subscription required' 
    });
  }
  next();
};

// Optional authentication (user may or may not be logged in)
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      req.user = null;
      return next();
    }

    const decoded = verifyToken(token);
    const userQuery = 'SELECT id, name, email, plan, is_active FROM users WHERE id = $1';
    const userResult = await pool.query(userQuery, [decoded.userId]);
    
    if (userResult.rows.length > 0 && userResult.rows[0].is_active) {
      req.user = userResult.rows[0];
    } else {
      req.user = null;
    }
    
    next();
  } catch (error) {
    req.user = null;
    next();
  }
};

module.exports = {
  authenticateToken,
  requirePremium,
  optionalAuth
};