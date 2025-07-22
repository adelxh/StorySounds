// src/contexts/AuthContext.js
import React, { createContext, useContext, useState, useEffect } from 'react';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'https://9c20d55f4d12.ngrok-free.app';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Initialize auth state from localStorage
  useEffect(() => {
    const initAuth = async () => {
      try {
        const storedToken = localStorage.getItem('auth_token');
        const storedUser = localStorage.getItem('auth_user');

        if (storedToken && storedUser) {
          setToken(storedToken);
          setUser(JSON.parse(storedUser));

          // Verify token is still valid
          await verifyToken(storedToken);
        }
      } catch (error) {
        console.error('Auth initialization error:', error);
        clearAuth();
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();
  }, []);

  // Verify token with backend
  const verifyToken = async (tokenToVerify) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/profile`, {
        headers: {
          'Authorization': `Bearer ${tokenToVerify}`,
          'ngrok-skip-browser-warning': 'true'
        }
      });

      if (!response.ok) {
        throw new Error('Token verification failed');
      }

      const data = await response.json();
      if (data.success) {
        setUser(data.user);
        return true;
      }
      throw new Error('Invalid response');
    } catch (error) {
      console.error('Token verification failed:', error);
      clearAuth();
      return false;
    }
  };

  // Sign up function
  const signup = async (name, email, password) => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch(`${API_BASE_URL}/api/auth/signup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true'
        },
        body: JSON.stringify({ name, email, password })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Signup failed');
      }

      // Store auth data
      localStorage.setItem('auth_token', data.token);
      localStorage.setItem('auth_user', JSON.stringify(data.user));
      
      setToken(data.token);
      setUser(data.user);

      return { success: true, user: data.user };
    } catch (error) {
      setError(error.message);
      return { success: false, error: error.message };
    } finally {
      setIsLoading(false);
    }
  };

  // Sign in function
  const signin = async (email, password) => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch(`${API_BASE_URL}/api/auth/signin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true'
        },
        body: JSON.stringify({ email, password })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Signin failed');
      }

      // Store auth data
      localStorage.setItem('auth_token', data.token);
      localStorage.setItem('auth_user', JSON.stringify(data.user));
      
      setToken(data.token);
      setUser(data.user);

      return { success: true, user: data.user };
    } catch (error) {
      setError(error.message);
      return { success: false, error: error.message };
    } finally {
      setIsLoading(false);
    }
  };

  // Sign out function
  const signout = async () => {
    try {
      // Call backend signout (optional, since JWT is stateless)
      if (token) {
        await fetch(`${API_BASE_URL}/api/auth/signout`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'ngrok-skip-browser-warning': 'true'
          }
        });
      }
    } catch (error) {
      console.error('Signout error:', error);
    } finally {
      clearAuth();
    }
  };

  // Clear auth state
  const clearAuth = () => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    setToken(null);
    setUser(null);
    setError(null);
  };

  // Update user profile
  const updateProfile = async (updates) => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch(`${API_BASE_URL}/api/auth/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'ngrok-skip-browser-warning': 'true'
        },
        body: JSON.stringify(updates)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Profile update failed');
      }

      // Update local state
      setUser(data.user);
      localStorage.setItem('auth_user', JSON.stringify(data.user));

      return { success: true, user: data.user };
    } catch (error) {
      setError(error.message);
      return { success: false, error: error.message };
    } finally {
      setIsLoading(false);
    }
  };

  // Helper function to make authenticated requests
  const authenticatedFetch = async (url, options = {}) => {
    if (!token) {
      throw new Error('No authentication token');
    }

    const authHeaders = {
      'Authorization': `Bearer ${token}`,
      'ngrok-skip-browser-warning': 'true',
      ...(options.headers || {})
    };

    return fetch(url, {
      ...options,
      headers: authHeaders
    });
  };

  const value = {
    // State
    user,
    token,
    isLoading,
    error,
    isAuthenticated: !!user,
    isPremium: user?.plan === 'premium',

    // Actions
    signup,
    signin,
    signout,
    updateProfile,
    clearAuth,
    authenticatedFetch,

    // Clear error manually
    clearError: () => setError(null)
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};