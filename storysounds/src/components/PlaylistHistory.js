// src/components/PlaylistHistory.js
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import UserMenu from './UserMenu';
import './PlaylistHistory.css';

const PlaylistHistory = () => {
  const [playlists, setPlaylists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { user } = useAuth();

  // Mock data for demonstration - replace with actual API call
  useEffect(() => {
    const fetchPlaylistHistory = async () => {
      try {
        setLoading(true);
        
        // Simulate API call delay
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Mock data - replace this with actual API call
        const mockPlaylists = [
          {
            id: 1,
            name: "Chill Vibes Playlist",
            createdAt: "2024-01-15T10:30:00Z",
            trackCount: 12,
            description: "Relaxing songs for a peaceful evening",
            spotifyUrl: "https://open.spotify.com/playlist/example1",
            transcription: "I want some chill and relaxing music for studying"
          },
          {
            id: 2,
            name: "Workout Energy",
            createdAt: "2024-01-10T14:22:00Z",
            trackCount: 18,
            description: "High-energy tracks for intense workouts",
            spotifyUrl: "https://open.spotify.com/playlist/example2",
            transcription: "Give me upbeat music for my gym session"
          },
          {
            id: 3,
            name: "Jazz Night",
            createdAt: "2024-01-05T20:15:00Z",
            trackCount: 8,
            description: "Smooth jazz for a cozy evening",
            spotifyUrl: null, // Not saved to Spotify
            transcription: "I'm in the mood for some smooth jazz music"
          }
        ];
        
        setPlaylists(mockPlaylists);
        setError(null);
      } catch (err) {
        setError('Failed to load playlist history');
        console.error('Error fetching playlists:', err);
      } finally {
        setLoading(false);
      }
    };

    if (user) {
      fetchPlaylistHistory();
    } else {
      setLoading(false);
    }
  }, [user]);

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (!user) {
    return (
      <div className="playlist-history-page">
        <header className="page-header">
          <div className="header-content">
            <div className="logo-section">
              <h1>🎵 StorySound</h1>
              <p className="tagline">Turn your voice into playlists</p>
            </div>
            <div className="header-actions">
              <Link to="/" className="back-button">← Back to Home</Link>
            </div>
          </div>
        </header>
        
        <main className="main-content">
          <div className="auth-required">
            <div className="auth-icon">🔒</div>
            <h2>Sign In Required</h2>
            <p>Please sign in to view your playlist history.</p>
            <Link to="/" className="home-link">Go to Homepage</Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="playlist-history-page">
      <header className="page-header">
        <div className="header-content">
          <div className="logo-section">
            <h1>🎵 StorySound</h1>
            <p className="tagline">Turn your voice into playlists</p>
          </div>
          
          <div className="header-actions">
            <Link to="/" className="back-button">← Back to Home</Link>
            <UserMenu />
          </div>
        </div>
      </header>

      <main className="main-content">
        <div className="page-title">
          <h2>🎵 Your Playlist History</h2>
          <p>All the playlists you've created with StorySound</p>
        </div>

        {loading ? (
          <div className="loading-state">
            <div className="loading-spinner"></div>
            <p>Loading your playlists...</p>
          </div>
        ) : error ? (
          <div className="error-state">
            <div className="error-icon">❌</div>
            <h3>Oops! Something went wrong</h3>
            <p>{error}</p>
            <button 
              className="retry-button"
              onClick={() => window.location.reload()}
            >
              Try Again
            </button>
          </div>
        ) : playlists.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🎼</div>
            <h3>No playlists yet</h3>
            <p>Create your first playlist by uploading audio on the homepage!</p>
            <Link to="/" className="create-first-button">
              Create Your First Playlist
            </Link>
          </div>
        ) : (
          <div className="playlists-grid">
            {playlists.map((playlist) => (
              <div key={playlist.id} className="playlist-card">
                <div className="playlist-header">
                  <h3 className="playlist-name">{playlist.name}</h3>
                  <div className="playlist-meta">
                    <span className="track-count">{playlist.trackCount} tracks</span>
                    <span className="created-date">{formatDate(playlist.createdAt)}</span>
                  </div>
                </div>

                <div className="playlist-content">
                  <div className="transcription-section">
                    <h4>Original Request:</h4>
                    <p className="transcription-text">"{playlist.transcription}"</p>
                  </div>

                  {playlist.description && (
                    <div className="description-section">
                      <p className="playlist-description">{playlist.description}</p>
                    </div>
                  )}
                </div>

                <div className="playlist-actions">
                  {playlist.spotifyUrl ? (
                    <a 
                      href={playlist.spotifyUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="spotify-link"
                    >
                      🎧 Open in Spotify
                    </a>
                  ) : (
                    <span className="no-spotify">Not saved to Spotify</span>
                  )}
                  
                  <button className="view-details-button">
                    View Details
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default PlaylistHistory;