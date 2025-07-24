// src/components/UserMenu.js
import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './UserMenu.css';

const UserMenu = () => {
  const [isOpen, setIsOpen] = useState(false);
  const { user, signout, isPremium } = useAuth();
  const menuRef = useRef(null);
    const navigate = useNavigate();

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSignOut = async () => {
    await signout();
    setIsOpen(false);
  };
  const handlePlaylistHistory = async () => {
    setIsOpen(false); 
    navigate('/playlist-history')
  }

  if (!user) return null;

  return (
    <div className="user-menu" ref={menuRef}>
      <button 
        className="user-menu-trigger"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="user-avatar">
          {user.name.charAt(0).toUpperCase()}
        </div>
        <span className="user-name">{user.name}</span>
        <span className={`plan-badge ${isPremium ? 'premium' : 'free'}`}>
          {isPremium ? '⭐ Premium' : '🆓 Free'}
        </span>
      </button>

      {isOpen && (
        <div className="user-menu-dropdown">
          <div className="user-info">
            <div className="user-avatar-large">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="user-name-large">{user.name}</div>
              <div className="user-email">{user.email}</div>
              <div className={`plan-status ${isPremium ? 'premium' : 'free'}`}>
                {isPremium ? '⭐ Premium Plan' : '🆓 Free Plan'}
              </div>
            </div>
          </div>

          <div className="menu-divider"></div>

          <div className="menu-items">
            <button className="menu-item">
              <span className="menu-icon">👤</span>
              Profile Settings
            </button>
            
            <button className="menu-item" onClick={handlePlaylistHistory}>
              <span className="menu-icon">🎵</span>
              Playlist History
            </button>
            
            {!isPremium && (
              <button className="menu-item upgrade">
                <span className="menu-icon">⭐</span>
                Upgrade to Premium
              </button>
            )}
            
            <button className="menu-item">
              <span className="menu-icon">💬</span>
              Support
            </button>
          </div>

          <div className="menu-divider"></div>

          <button className="menu-item signout" onClick={handleSignOut}>
            <span className="menu-icon">🚪</span>
            Sign Out
          </button>
        </div>
      )}
    </div>
  );
};

export default UserMenu;