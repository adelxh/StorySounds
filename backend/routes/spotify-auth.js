const express = require('express');
const router = express.Router();
const axios = require('axios');
const crypto = require('crypto');

const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI;

// In-memory storage for state and tokens (use Redis/database in production)
const authSessions = new Map();
const userTokens = new Map();

// LOGIN ROUTE:
router.get('/login', (req, res) => {
  console.log('🔧 DEBUG: REDIRECT_URI =', REDIRECT_URI);
  
  const state = crypto.randomBytes(16).toString('hex');
  const scope = 'playlist-modify-public playlist-modify-private';
  
  authSessions.set(state, { timestamp: Date.now() });
  
  const authURL = new URL('https://accounts.spotify.com/authorize');
  authURL.searchParams.append('response_type', 'code');
  authURL.searchParams.append('client_id', SPOTIFY_CLIENT_ID);
  authURL.searchParams.append('scope', scope);
  authURL.searchParams.append('redirect_uri', REDIRECT_URI);
  authURL.searchParams.append('state', state);
  
  res.json({ authUrl: authURL.toString() });
});

// REPLACE THIS ENTIRE CALLBACK ROUTE WITH METHOD 1:
router.get('/callback', async (req, res) => {
  const { code, state } = req.query;
  
  if (!state || !authSessions.has(state)) {
    return res.redirect('http://localhost:3000?error=invalid_state');
  }
  
  authSessions.delete(state);
  
  if (!code) {
    return res.redirect('http://localhost:3000?error=no_code');
  }
  
  try {
    // Exchange code for access token
    const tokenResponse = await axios.post('https://accounts.spotify.com/api/token', 
      new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: REDIRECT_URI,
      }), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64')}`
        }
      }
    );
    
    const { access_token, refresh_token, expires_in } = tokenResponse.data;
    
    // Get user profile
    const userResponse = await axios.get('https://api.spotify.com/v1/me', {
      headers: { 'Authorization': `Bearer ${access_token}` }
    });
    
    const userId = userResponse.data.id;
    
    // Store tokens
    userTokens.set(userId, {
      access_token,
      refresh_token,
      expires_at: Date.now() + (expires_in * 1000),
      user_info: userResponse.data
    });
    
    console.log(`✅ Stored auth for user: ${userId}`);
    
    // Redirect to frontend with success
    res.redirect(`http://localhost:3000?spotify_auth=success&user_id=${userId}&user_name=${encodeURIComponent(userResponse.data.display_name || userResponse.data.id)}`);
    
  } catch (error) {
    console.error('Error exchanging code for token:', error);
    res.redirect('http://localhost:3000?error=auth_failed');
  }
});

// Create playlist endpoint
router.post('/create-playlist', async (req, res) => {
  const { userId, playlistName, tracks, description } = req.body;
  
  if (!userId || !playlistName || !tracks || !Array.isArray(tracks)) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  const userAuth = userTokens.get(userId);
  if (!userAuth) {
    return res.status(401).json({ error: 'User not authenticated' });
  }
  
  try {
    // Check if token needs refresh
    let accessToken = userAuth.access_token;
    if (Date.now() >= userAuth.expires_at) {
      accessToken = await refreshAccessToken(userId);
    }
    
    // Create playlist
    const playlistResponse = await axios.post(
      `https://api.spotify.com/v1/users/${userId}/playlists`,
      {
        name: playlistName,
        description: description || 'Created with StorySound',
        public: false
      },
      {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }
    );
    
    const playlist = playlistResponse.data;
    console.log(`Created playlist: ${playlist.name} (${playlist.id})`);
    
    // Add tracks to playlist (Spotify accepts max 100 tracks per request)
    const trackUris = tracks
      .filter(track => track.id && track.id.startsWith('spotify:track:'))
      .map(track => track.id);
    
    if (trackUris.length === 0) {
      return res.status(400).json({ error: 'No valid Spotify track IDs provided' });
    }
    
    // Process tracks in batches of 100
    const batchSize = 100;
    for (let i = 0; i < trackUris.length; i += batchSize) {
      const batch = trackUris.slice(i, i + batchSize);
      
      await axios.post(
        `https://api.spotify.com/v1/playlists/${playlist.id}/tracks`,
        { uris: batch },
        {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        }
      );
    }
    
    console.log(`Added ${trackUris.length} tracks to playlist`);
    
    res.json({
      success: true,
      playlist: {
        id: playlist.id,
        name: playlist.name,
        url: playlist.external_urls.spotify,
        tracks_added: trackUris.length
      }
    });
    
  } catch (error) {
    console.error('Error creating playlist:', error);
    
    if (error.response?.status === 401) {
      // Token expired or invalid
      userTokens.delete(userId);
      return res.status(401).json({ error: 'Authentication expired. Please log in again.' });
    }
    
    res.status(500).json({ 
      error: 'Failed to create playlist',
      details: error.response?.data?.error?.message || error.message
    });
  }
});

// Refresh access token
async function refreshAccessToken(userId) {
  const userAuth = userTokens.get(userId);
  if (!userAuth?.refresh_token) {
    throw new Error('No refresh token available');
  }
  
  try {
    const response = await axios.post('https://accounts.spotify.com/api/token',
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: userAuth.refresh_token,
      }), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64')}`
        }
      }
    );
    
    const { access_token, expires_in } = response.data;
    
    // Update stored token
    userAuth.access_token = access_token;
    userAuth.expires_at = Date.now() + (expires_in * 1000);
    userTokens.set(userId, userAuth);
    
    return access_token;
  } catch (error) {
    console.error('Error refreshing token:', error);
    userTokens.delete(userId);
    throw new Error('Failed to refresh authentication');
  }
}

// Get user authentication status
router.get('/status/:userId', (req, res) => {
  const { userId } = req.params;
  const userAuth = userTokens.get(userId);
  
  if (!userAuth) {
    return res.json({ authenticated: false });
  }
  
  res.json({
    authenticated: true,
    user: userAuth.user_info,
    expires_at: userAuth.expires_at
  });
});

// Logout endpoint
router.post('/logout/:userId', (req, res) => {
  const { userId } = req.params;
  userTokens.delete(userId);
  res.json({ success: true });
});

module.exports = router;