// backend/utils/auth.js
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Hash password
const hashPassword = async (password) => {
  const saltRounds = 12;
  return await bcrypt.hash(password, saltRounds);
};

// Compare password
const comparePassword = async (password, hashedPassword) => {
  return await bcrypt.compare(password, hashedPassword);
};

// Generate JWT token
const generateToken = (userId, email) => {
  const payload = {
    userId,
    email,
    iat: Math.floor(Date.now() / 1000)
  };
  
  return jwt.sign(payload, '', {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  });
};

// Verify JWT token
const verifyToken = (token) => {
  try {
    return jwt.verify(token, '');
  } catch (error) {
    throw new Error('Invalid token');
  }
};

// Validate email format
const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// Validate password strength
const isValidPassword = (password) => {
  // At least 8 characters, 1 letter, 1 number
  const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d@$!%*#?&]{8,}$/;
  return passwordRegex.test(password);
};

// Sanitize user data (remove password before sending to frontend)
const sanitizeUser = (user) => {
  const { password_hash, ...sanitizedUser } = user;
  return sanitizedUser;
};

module.exports = {
  hashPassword,
  comparePassword,
  generateToken,
  verifyToken,
  isValidEmail,
  isValidPassword,
  sanitizeUser
};