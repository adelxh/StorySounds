// src/components/AuthModal.js
import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import './AuthModal.css';

const AuthModal = ({ isOpen, onClose, initialMode = 'signin' }) => {
  const [mode, setMode] = useState(initialMode); // 'signin' or 'signup'
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [formErrors, setFormErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { signup, signin, error, clearError } = useAuth();

  // Reset form when modal opens/closes or mode changes
  React.useEffect(() => {
    if (isOpen) {
      setFormData({ name: '', email: '', password: '', confirmPassword: '' });
      setFormErrors({});
      clearError();
    }
  }, [isOpen, mode, clearError]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    
    // Clear field error when user starts typing
    if (formErrors[name]) {
      setFormErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const validateForm = () => {
    const errors = {};

    // Email validation
    if (!formData.email) {
      errors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      errors.email = 'Please enter a valid email';
    }

    // Password validation
    if (!formData.password) {
      errors.password = 'Password is required';
    } else if (formData.password.length < 8) {
      errors.password = 'Password must be at least 8 characters';
    } else if (!/(?=.*[A-Za-z])(?=.*\d)/.test(formData.password)) {
      errors.password = 'Password must contain at least one letter and one number';
    }

    // Name validation (signup only)
    if (mode === 'signup') {
      if (!formData.name) {
        errors.name = 'Name is required';
      } else if (formData.name.trim().length < 2) {
        errors.name = 'Name must be at least 2 characters';
      }

      // Confirm password validation (signup only)
      if (!formData.confirmPassword) {
        errors.confirmPassword = 'Please confirm your password';
      } else if (formData.password !== formData.confirmPassword) {
        errors.confirmPassword = 'Passwords do not match';
      }
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      let result;
      
      if (mode === 'signup') {
        result = await signup(formData.name, formData.email, formData.password);
      } else {
        result = await signin(formData.email, formData.password);
      }

      if (result.success) {
        onClose();
      }
    } catch (error) {
      console.error('Auth error:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="auth-modal-overlay" onClick={handleOverlayClick}>
      <div className="auth-modal" onClick={e => e.stopPropagation()}>
        <div className="auth-modal-header">
          <h2>{mode === 'signin' ? 'Welcome Back' : 'Join StorySounds'}</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>

        <div className="auth-modal-content">
          <form onSubmit={handleSubmit} className="auth-form">
            {mode === 'signup' && (
              <div className="form-group">
                <label htmlFor="name">Full Name</label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  className={`auth-input ${formErrors.name ? 'error' : ''}`}
                  placeholder="Enter your full name"
                  disabled={isSubmitting}
                />
                {formErrors.name && <span className="error-text">{formErrors.name}</span>}
              </div>
            )}

            <div className="form-group">
              <label htmlFor="email">Email Address</label>
              <input
                type="email"
                id="email"
                name="email"
                value={formData.email}
                onChange={handleInputChange}
                className={`auth-input ${formErrors.email ? 'error' : ''}`}
                placeholder="Enter your email"
                disabled={isSubmitting}
              />
              {formErrors.email && <span className="error-text">{formErrors.email}</span>}
            </div>

            <div className="form-group">
              <label htmlFor="password">Password</label>
              <input
                type="password"
                id="password"
                name="password"
                value={formData.password}
                onChange={handleInputChange}
                className={`auth-input ${formErrors.password ? 'error' : ''}`}
                placeholder={mode === 'signup' ? 'Create a password' : 'Enter your password'}
                disabled={isSubmitting}
              />
              {formErrors.password && <span className="error-text">{formErrors.password}</span>}
              {mode === 'signup' && (
                <div className="password-hint">
                  Password must be at least 8 characters with a letter and number
                </div>
              )}
            </div>

            {mode === 'signup' && (
              <div className="form-group">
                <label htmlFor="confirmPassword">Confirm Password</label>
                <input
                  type="password"
                  id="confirmPassword"
                  name="confirmPassword"
                  value={formData.confirmPassword}
                  onChange={handleInputChange}
                  className={`auth-input ${formErrors.confirmPassword ? 'error' : ''}`}
                  placeholder="Confirm your password"
                  disabled={isSubmitting}
                />
                {formErrors.confirmPassword && <span className="error-text">{formErrors.confirmPassword}</span>}
              </div>
            )}

            {error && (
              <div className="auth-error">
                <span>❌ {error}</span>
              </div>
            )}

            <button 
              type="submit" 
              className="auth-submit-button"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Please wait...' : (mode === 'signin' ? 'Sign In' : 'Create Account')}
            </button>
          </form>

          <div className="auth-switch">
            {mode === 'signin' ? (
              <p>
                Don't have an account?{' '}
                <button 
                  type="button" 
                  className="switch-mode-button"
                  onClick={() => setMode('signup')}
                  disabled={isSubmitting}
                >
                  Sign up
                </button>
              </p>
            ) : (
              <p>
                Already have an account?{' '}
                <button 
                  type="button" 
                  className="switch-mode-button"
                  onClick={() => setMode('signin')}
                  disabled={isSubmitting}
                >
                  Sign in
                </button>
              </p>
            )}
          </div>

          {mode === 'signup' && (
            <div className="plan-info">
              <div className="plan-badge">
                <span className="plan-icon">🆓</span>
                <span>Starting with <strong>Free Plan</strong></span>
              </div>
              <p className="plan-description">
                Get started for free! Upgrade to Premium anytime for unlimited playlists.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AuthModal;