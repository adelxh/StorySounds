// src/components/AuthButton.js
import React from 'react';
import './AuthButton.css';

const AuthButton = ({ onSignIn, onSignUp }) => {
  return (
    <div className="auth-buttons">
      <button 
        className="auth-btn signin-btn"
        onClick={onSignIn}
      >
        Sign In
      </button>
      <button 
        className="auth-btn signup-btn"
        onClick={onSignUp}
      >
        Get Started
      </button>
    </div>
  );
};

export default AuthButton;