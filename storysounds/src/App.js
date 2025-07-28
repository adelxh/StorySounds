import React, { useState, useEffect, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import './App.css';

// Authentication imports
import { AuthProvider, useAuth } from './contexts/AuthContext';
import AuthModal from './components/AuthModal';
import UserMenu from './components/UserMenu';
import AuthButton from './components/AuthButton';

// Import the new PlaylistHistory component
import PlaylistHistory from './components/PlaylistHistory';

// API Base URL
const API_BASE_URL = process.env.REACT_APP_API_URL || 'https://storysounds.onrender.com'; // https://6862e2cd5dcb.ngrok-free.app
const fetchWithNgrokHeaders = async (url, options = {}) => {
  const defaultOptions = {
    headers: {
      'ngrok-skip-browser-warning': 'true',
      ...options.headers
    },
    ...options
  };
  
  return fetch(url, defaultOptions);
};

const FeedbackModal = ({isOpen, onClose}) => {
  const [feedback, setFeedback] = useState('');
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState(null);

  const handleSubmit = async () => {
    if (!feedback.trim()) {
      setSubmitStatus('error');
      return;
    }

    setIsSubmitting(true);
    setSubmitStatus(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          feedback: feedback.trim(),
          email: email.trim() || null,
          timestamp: new Date().toLocaleString(),
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to send feedback');
      }

      console.log('✅ Feedback sent successfully:', result);
      setSubmitStatus('success');
      setFeedback('');
      setEmail('');
      
      setTimeout(() => {
        onClose();
        setSubmitStatus(null);
      }, 2000);
      
    } catch (error) {
      console.error('❌ Failed to send feedback:', error);
      setSubmitStatus('error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      handleSubmit();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="feedback-modal-overlay" onClick={handleOverlayClick}>
      <div className="feedback-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h4>Send Feedback</h4>
          <button className="close-button" onClick={onClose}>×</button>
        </div>
        
        <div className="modal-content">
          {submitStatus === 'success' ? (
            <div className="feedback-success">
              <div className="success-icon">✅</div>
              <h3>Thank you!</h3>
              <p>Your feedback has been sent successfully.</p>
            </div>
          ) : (
            <div className="feedback-form">
              <div className="form-group">
                <label htmlFor="email">Email (optional)</label>
                <input
                  type="email"
                  id="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your.email@example.com"
                  className="feedback-input"
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="feedback">Your Feedback *</label>
                <textarea
                  id="feedback"
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  onKeyDown={handleKeyPress}
                  placeholder="Tell us what you think, report a bug, or suggest an improvement..."
                  className="feedback-textarea"
                  rows="6"
                  required
                />
                <div className="textarea-hint">
                  Press Ctrl+Enter (Cmd+Enter on Mac) to send quickly
                </div>
              </div>
              
              {submitStatus === 'error' && (
                <div className="feedback-error">
                  <p>❌ Failed to send feedback. Please try again.</p>
                </div>
              )}
              
              <div className="form-actions">
                <button
                  type="button"
                  onClick={onClose}
                  className="cancel-button"
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  className="submit-button"
                  disabled={isSubmitting || !feedback.trim()}
                >
                  {isSubmitting ? 'Sending...' : 'Send Feedback'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Homepage Component - Contains all your existing main app logic
const HomePage = () => {
  // Authentication state
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState('signin');

  // All your existing state
  const [isLoaded, setIsLoaded] = useState(false);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [isRecording, setIsRecording] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState('prompt');
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);
  
  // Hybrid preview state
  const [youtubeModal, setYoutubeModal] = useState(null);
  const [currentPreview, setCurrentPreview] = useState(null);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);

  const [isProcessing, setIsProcessing] = useState(false);
  const [transcription, setTranscription] = useState('');
  const [spotifyTracks, setSpotifyTracks] = useState([]);
  const [aiRecommendations, setAiRecommendations] = useState([]);
  const [playlistSummary, setPlaylistSummary] = useState(null);
  const [processingError, setProcessingError] = useState('');
  const [textInput, setTextInput] = useState(''); // for text inputs instead of recording
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const audioRef = useRef(null);
  const streamRef = useRef(null);
  const timerRef = useRef(null);

  const [spotifyAuth, setSpotifyAuth] = useState({
    isAuthenticated: false,
    user: null,
    isLoading: false
  });
  const [playlistCreation, setPlaylistCreation] = useState({
    isCreating: false,
    error: null,
    success: null
  });

  // Authentication handlers
  const handleSignIn = () => {
    setAuthModalMode('signin');
    setIsAuthModalOpen(true);
  };

  const handleSignUp = () => {
    setAuthModalMode('signup');
    setIsAuthModalOpen(true);
  };

  const closeAuthModal = () => {
    setIsAuthModalOpen(false);
  };

  // All your existing functions - keeping them exactly as they are
  const handleTextSubmit = async () => {
    if (!textInput.trim()) return;
    
    setIsProcessing(true);
    setProcessingError('');
    
    try {
      // Use the text input as transcription and process it
      setTranscription(textInput.trim());
      
      const response = await fetchWithNgrokHeaders(`${API_BASE_URL}/api/transcribe/text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          transcription: textInput.trim(),
          skipTranscription: true // Skip actual transcription since we have text
        })
      });

      if (!response.ok) throw new Error('Processing failed');
      
      const data = await response.json();
      setAiRecommendations(data.recommendations || []);
      setSpotifyTracks(data.spotifyTracks || []);
      setPlaylistSummary(data.summary || '');
      
      // Clear the input after successful submission
      setTextInput('');
      
    } catch (error) {
      console.error('Error processing text:', error);
      setProcessingError('Failed to process your request. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  // All your existing useEffect hooks
  useEffect(() => {
    checkSpotifyAuthStatus();
  }, []);

  useEffect(() => {
    // Check for Spotify auth callback in URL
    const urlParams = new URLSearchParams(window.location.search);
    const spotifyAuth = urlParams.get('spotify_auth');
    const userId = urlParams.get('user_id');
    const userName = urlParams.get('user_name');
    const error = urlParams.get('error');
    
    console.log('🔍 Checking URL params:', { spotifyAuth, userId, userName, error });
    
    if (spotifyAuth === 'success' && userId) {
      console.log('✅ Spotify auth callback detected:', { userId, userName });
      
      localStorage.setItem('spotify_user_id', userId);
      
      setSpotifyAuth({
        isAuthenticated: true,
        user: { id: userId, display_name: decodeURIComponent(userName || userId) },
        isLoading: false
      });
      
      const savedState = localStorage.getItem('app_state_before_auth');
      if (savedState) {
        try {
          const state = JSON.parse(savedState);
          console.log('🔄 Restoring app state:', state);
          
          const isRecent = Date.now() - state.timestamp < 10 * 60 * 1000;
          
          if (isRecent) {
            setTranscription(state.transcription || '');
            setSpotifyTracks(state.spotifyTracks || []);
            setAiRecommendations(state.aiRecommendations || []);
            setPlaylistSummary(state.playlistSummary || null);
            
            if (state.audioUrl) {
              setAudioUrl(state.audioUrl);
            }
            
            console.log('✅ App state restored successfully!');
          } else {
            console.log('🗑️ Saved state is too old, skipping restore');
          }
          
          localStorage.removeItem('app_state_before_auth');
          
        } catch (error) {
          console.error('❌ Error restoring state:', error);
          localStorage.removeItem('app_state_before_auth');
        }
      } else {
        console.log('ℹ️ No saved state to restore');
      }
      
      window.history.replaceState({}, document.title, window.location.pathname);
      console.log('🎉 Spotify authentication complete!');
      
    } else if (error) {
      console.error('❌ Spotify auth error:', error);
      setSpotifyAuth(prev => ({ ...prev, isLoading: false }));
      window.history.replaceState({}, document.title, window.location.pathname);
      localStorage.removeItem('app_state_before_auth');
    }
  }, []);

  useEffect(() => {
    console.log('📊 Current App State:', {
      transcription: transcription?.substring(0, 50) + '...',
      spotifyTracksCount: spotifyTracks?.length || 0,
      aiRecommendationsCount: aiRecommendations?.length || 0,
      playlistSummary: playlistSummary,
      spotifyAuth: spotifyAuth,
      hasAudioUrl: !!audioUrl
    });
  }, [transcription, spotifyTracks, aiRecommendations, playlistSummary, spotifyAuth, audioUrl]);

  useEffect(() => {
    setIsLoaded(true);
    
    const handleMouseMove = (e) => {
      if (!youtubeModal) {
        setMousePosition({ x: e.clientX, y: e.clientY });
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (currentPreview) {
        currentPreview.pause();
      }
    };
  }, [youtubeModal]);

  // All your existing functions (keeping them exactly as they are)
  const startTimer = () => {
    setRecordingTime(0);
    timerRef.current = setInterval(() => {
      setRecordingTime(prev => prev + 1);
    }, 1000);
  };

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const handlePreviewClick = (track) => {
    if (track.preview_url) {
      handleSpotifyPreview(track);
      return;
    }
    
    if (track.youtube_preview) {
      handleYouTubePreview(track);
      return;
    }

    alert('No preview available for this track');
  };

  const handleSpotifyPreview = (track) => {
    if (currentPreview && currentPreview.src === track.preview_url && isPreviewPlaying) {
      currentPreview.pause();
      setIsPreviewPlaying(false);
      return;
    }

    if (currentPreview) {
      currentPreview.pause();
      currentPreview.currentTime = 0;
    }

    setYoutubeModal(null);

    const audio = new Audio(track.preview_url);
    audio.volume = 0.7;
    
    setTimeout(() => {
      if (!audio.paused) {
        audio.pause();
        audio.currentTime = 0;
        setIsPreviewPlaying(false);
        setCurrentPreview(null);
      }
    }, 30000);

    audio.onended = () => {
      setIsPreviewPlaying(false);
      setCurrentPreview(null);
    };

    audio.onerror = () => {
      alert('Error playing Spotify preview');
      setIsPreviewPlaying(false);
      setCurrentPreview(null);
    };

    audio.play().then(() => {
      setCurrentPreview(audio);
      setIsPreviewPlaying(true);
    }).catch(error => {
      console.error('Error playing audio:', error);
      alert('Error playing preview');
    });
  };

  const checkSpotifyAuthStatus = async () => {
    const savedUserId = localStorage.getItem('spotify_user_id');
    console.log('🔍 Checking auth status for user:', savedUserId);
    
    if (!savedUserId) {
      console.log('❌ No saved user ID found');
      return;
    }
    
    try {
      const response = await fetchWithNgrokHeaders(`${API_BASE_URL}/api/spotify/status/${savedUserId}`);
      const data = await response.json();
      
      console.log('📊 Auth status response:', data);
      
      if (data.authenticated) {
        console.log('✅ User is authenticated');
        setSpotifyAuth({
          isAuthenticated: true,
          user: data.user,
          isLoading: false
        });
      } else {
        console.log('❌ User not authenticated on server');
        localStorage.removeItem('spotify_user_id');
        setSpotifyAuth({
          isAuthenticated: false,
          user: null,
          isLoading: false
        });
      }
    } catch (error) {
      console.error('❌ Error checking Spotify auth:', error);
      localStorage.removeItem('spotify_user_id');
      setSpotifyAuth({
        isAuthenticated: false,
        user: null,
        isLoading: false
      });
    }
  };

  const handleSpotifyLogin = async () => {
    setSpotifyAuth(prev => ({ ...prev, isLoading: true }));
    
    try {
      const stateToSave = {
        transcription,
        spotifyTracks,
        aiRecommendations,
        playlistSummary,
        audioUrl,
        audioBlob: audioBlob ? 'has_audio' : null,
        timestamp: Date.now()
      };
      
      localStorage.setItem('app_state_before_auth', JSON.stringify(stateToSave));
      console.log('💾 Saved app state before auth:', stateToSave);
      
      const response = await fetchWithNgrokHeaders(`${API_BASE_URL}/api/spotify/login`);
      const data = await response.json();
      
      if (data.authUrl) {
        console.log('🚀 Redirecting to Spotify auth...');
        window.location.href = data.authUrl;
      } else {
        throw new Error('No auth URL received');
      }
    } catch (error) {
      console.error('❌ Error initiating Spotify login:', error);
      setSpotifyAuth(prev => ({ ...prev, isLoading: false }));
    }
  };

  const handleSpotifyLogout = async () => {
    const userId = localStorage.getItem('spotify_user_id');
    if (userId) {
      try {
        await fetchWithNgrokHeaders(`${API_BASE_URL}/api/spotify/logout/${userId}`, {
          method: 'POST'
        });
      } catch (error) {
        console.error('Error logging out:', error);
      }
    }
    
    localStorage.removeItem('spotify_user_id');
    setSpotifyAuth({
      isAuthenticated: false,
      user: null,
      isLoading: false
    });
  };

  const createSpotifyPlaylist = async () => {
    if (!spotifyAuth.isAuthenticated || !spotifyTracks.length) return;
    
    setPlaylistCreation({ isCreating: true, error: null, success: null });
    
    try {
      const playlistName = generatePlaylistName(transcription);
      
      const formattedTracks = spotifyTracks.map(track => ({
        id: track.id.includes(`spotify:track:`) ? track.id : `spotify:track:${track.id}`
      }));
      
      const response = await fetchWithNgrokHeaders(`${API_BASE_URL}/api/spotify/create-playlist`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          userId: spotifyAuth.user.id,
          playlistName: playlistName,
          description: `Created from audio: "${transcription.substring(0, 100)}..."`,
          tracks: formattedTracks
        })
      });
      
      const data = await response.json();
      
      if (response.ok && data.success) {
        setPlaylistCreation({
          isCreating: false,
          error: null,
          success: data.playlist
        });
      } else {
        throw new Error(data.error || 'Failed to create playlist');
      }
    } catch (error) {
      console.error('Error creating playlist:', error);
      setPlaylistCreation({
        isCreating: false,
        error: error.message,
        success: null
      });
    }
  };

  const generatePlaylistName = (transcription) => {
    const text = transcription.toLowerCase();
    
    const genreKeywords = ['rock', 'pop', 'jazz', 'classical', 'hip hop', 'country', 'electronic', 'indie'];
    const moodKeywords = ['chill', 'energetic', 'sad', 'happy', 'workout', 'study', 'party', 'relaxing'];
    
    for (const genre of genreKeywords) {
      if (text.includes(genre)) {
        return `My ${genre.charAt(0).toUpperCase() + genre.slice(1)} Playlist`;
      }
    }
    
    for (const mood of moodKeywords) {
      if (text.includes(mood)) {
        return `${mood.charAt(0).toUpperCase() + mood.slice(1)} Vibes`;
      }
    }
    
    const date = new Date().toLocaleDateString();
    return `StorySound Playlist - ${date}`;
  };

  const SpotifyAuthSection = () => (
    <div className="spotify-auth-section">
      {!spotifyAuth.isAuthenticated ? (
        <div className="auth-prompt">
          <h4>🎵 Save to Spotify</h4>
       
          <button 
            onClick={handleSpotifyLogin}
            disabled={spotifyAuth.isLoading}
            className="spotify-login-button"
          >
            {spotifyAuth.isLoading ? 'Connecting...' : 'Connect Spotify'}
          </button>
        </div>
      ) : (
        <div className="auth-success">
          <div className="user-info">
            <span className="welcome-text">
              🎧 Connected as {spotifyAuth.user.display_name || spotifyAuth.user.id}
            </span>
            <button onClick={handleSpotifyLogout} className="logout-button">
              Disconnect
            </button>
          </div>
          
          {spotifyTracks.length > 0 && (
            <div className="playlist-creation">
              <button 
                onClick={createSpotifyPlaylist}
                disabled={playlistCreation.isCreating}
                className="create-playlist-button"
              >
                {playlistCreation.isCreating ? 'Creating Playlist...' : 'Create Spotify Playlist'}
              </button>
              
              {playlistCreation.error && (
                <div className="creation-error">
                  <p>❌ {playlistCreation.error}</p>
                </div>
              )}
              
              {playlistCreation.success && (
                <div className="creation-success">
                  <p>✅ Playlist created successfully!</p>
                  <a 
                    href={playlistCreation.success.url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="playlist-link"
                  >
                    Open "{playlistCreation.success.name}" in Spotify
                  </a>
                  <p className="track-count">
                    {playlistCreation.success.tracks_added} tracks added
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );

  const handleYouTubePreview = (track) => {
    console.log('Opening YouTube preview for:', track.name);
  
    if (currentPreview) {
      currentPreview.pause();
      setCurrentPreview(null);
      setIsPreviewPlaying(false);
    }

    if (youtubeModal && youtubeModal.videoId === track.youtube_preview.videoId) {
      console.log('Modal already open for this track, closing');
      setYoutubeModal(null);
      return;
    }

    setYoutubeModal({
      videoId: track.youtube_preview.videoId,
      song: track.name,
      artist: track.artist,
      embedUrl: track.youtube_preview.embedUrl
    });
  }

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Continue with the rest of your functions...
  const processAudioAndGeneratePlaylist = async (audioBlob) => {
    if (!audioBlob) return;
    
    setIsProcessing(true);
    setProcessingError('');
    setTranscription('');
    setSpotifyTracks([]);
    setAiRecommendations([]);
    setPlaylistSummary(null);
    
    try {
      const formData = new FormData();
      const audioFile = new File([audioBlob], 'recording.webm', {
        type: 'audio/webm;codecs=opus'
      });
      
      formData.append('file', audioFile);
      
      console.log('Processing audio and generating playlist...');
      
      const response = await fetchWithNgrokHeaders(`${API_BASE_URL}/api/transcribe`, {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.details || errorData.error || `HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      
      console.log('=== HYBRID PREVIEW DEBUG ===');
      console.log('Full response:', data);
      console.log('Spotify tracks array:', data.spotifyTracks);

      if (data.spotifyTracks && data.spotifyTracks.length > 0) {
        console.log(`\n📊 Analyzing ${data.spotifyTracks.length} tracks:`);
        
        data.spotifyTracks.forEach((track, index) => {
          console.log(`\nTrack ${index + 1}: "${track.name}" by "${track.artist}"`);
          console.log(`  Spotify preview: ${track.preview_url ? '✅ Available' : '❌ Null'}`);
          console.log(`  YouTube preview: ${track.youtube_preview ? '✅ Available' : '❌ Null'}`);
          
          if (track.youtube_preview) {
            console.log(`  YouTube details:`, track.youtube_preview);
          }
          
          if (!track.preview_url && !track.youtube_preview) {
            console.log(`  ⚠️ NO PREVIEWS AVAILABLE for this track`);
          }
        });
        
        const spotifyCount = data.spotifyTracks.filter(t => t.preview_url).length;
        const youtubeCount = data.spotifyTracks.filter(t => t.youtube_preview).length;
        const noPreviewCount = data.spotifyTracks.filter(t => !t.preview_url && !t.youtube_preview).length;
        
        console.log(`\n📈 HYBRID PREVIEW SUMMARY:`);
        console.log(`  🎧 Spotify previews: ${spotifyCount}`);
        console.log(`  📺 YouTube previews: ${youtubeCount}`);
        console.log(`  ❌ No previews: ${noPreviewCount}`);
        console.log(`  📊 Total coverage: ${((spotifyCount + youtubeCount) / data.spotifyTracks.length * 100).toFixed(1)}%`);
        
      } else {
        console.log('❌ No Spotify tracks found in response');
      }
      console.log('=== END HYBRID DEBUG ===');

      setTranscription(data.transcription || 'No transcription available');
      setAiRecommendations(data.aiRecommendations || []);
      setSpotifyTracks(data.spotifyTracks || []);
      setPlaylistSummary(data.playlistSummary || null);
      
      console.log('Processing successful:', {
        transcription: data.transcription,
        foundTracks: data.spotifyTracks?.length || 0,
        totalRecommendations: data.aiRecommendations?.length || 0,
        playlistSummary: data.playlistSummary
      });
      
    } catch (error) {
      console.error('Processing error:', error);
      setProcessingError(
        error.message.includes('fetch') 
          ? 'Unable to connect to the server. Make sure the backend is running on port 5000.'
          : `Failed to process audio: ${error.message}`
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleStartRecording = async () => {
    try {
      setIsRecording(true);
      audioChunksRef.current = [];
      
      setTranscription('');
      setSpotifyTracks([]);
      setAiRecommendations([]);
      setPlaylistSummary(null);
      setProcessingError('');
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100,
        },
        video: false 
      });
      
      streamRef.current = stream;
      setPermissionStatus('granted');
      
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });
      
      mediaRecorderRef.current = mediaRecorder;
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      
      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const audioUrl = URL.createObjectURL(audioBlob);
        
        setAudioBlob(audioBlob);
        setAudioUrl(audioUrl);
        
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
        }
        
        processAudioAndGeneratePlaylist(audioBlob);
      };
      
      mediaRecorder.start();
      startTimer();
      
    } catch (error) {
      setIsRecording(false);
      setPermissionStatus('denied');
      
      if (error.name === 'NotAllowedError') {
        alert('Microphone access denied. Please allow microphone access and try again.');
      } else if (error.name === 'NotFoundError') {
        alert('No microphone found. Please connect a microphone and try again.');
      } else {
        console.error('Error accessing microphone:', error);
        alert('Error accessing microphone. Please try again.');
      }
    }
  };

  const handleStopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      stopTimer();
    }
  };

  const handlePlayPause = () => {
    if (!audioRef.current) return;
    
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  const handleDownload = () => {
    if (!audioBlob) return;
    
    const url = URL.createObjectURL(audioBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `story-recording-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.webm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleNewRecording = () => {
    if (currentPreview) {
      currentPreview.pause();
      setCurrentPreview(null);
      setIsPreviewPlaying(false);
    }
    setYoutubeModal(null);

    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
    setAudioBlob(null);
    setAudioUrl(null);
    setIsPlaying(false);
    setRecordingTime(0);
    setTranscription('');
    setSpotifyTracks([]);
    setAiRecommendations([]);
    setPlaylistSummary(null);
    setProcessingError('');
  };

  const handleRetryProcessing = () => {
    if (audioBlob) {
      processAudioAndGeneratePlaylist(audioBlob);
    }
  };

  const testBackendConnection = async () => {
    try {
      const response = await fetchWithNgrokHeaders(`${API_BASE_URL}/api/transcribe`, {
        method: 'GET',
      });
      return response.ok;
    } catch (error) {
      return false;
    }
  };

  const handleTestConnection = async () => {
    const isConnected = await testBackendConnection();
    alert(isConnected ? 'Backend connection successful!' : 'Backend connection failed. Make sure the server is running on port 5000.');
  };

  // YouTube Modal Component
  const YouTubeModal = ({ modal, onClose }) => {
    if (!modal) return null;

    return (
      <div className="youtube-modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
        <div className="youtube-modal" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <h4>{modal.song} - {modal.artist}</h4>
            <button className="close-button" onClick={onClose}>×</button>
          </div>
          <div className="modal-content">
            <iframe
              width="560"
              height="315"
              src={modal.embedUrl}
              title="YouTube preview"
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            ></iframe>
          </div>
        </div>
      </div>
    );
  };

  // Show loading screen while auth is initializing
  if (authLoading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner"></div>
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className="app">
      {/* Animated background */}
      <div className="background-animation">
        <div className="wave wave1"></div>
        <div className="wave wave2"></div>
        <div className="wave wave3"></div>
      </div>
      
      {/* Floating particles */}
      <div className="particles">
        {[...Array(12)].map((_, i) => (
          <div key={i} className={`particle particle-${i + 1}`}></div>
        ))}
      </div>

      {/* Mouse follower */}
      {!youtubeModal && (
         <div 
        className="mouse-follower"
        style={{
          left: mousePosition.x,
          top: mousePosition.y,
        }}
      ></div>
      )}

      {/* Main content */}
      <div className={`container ${isLoaded ? 'loaded' : ''}`}>
        <header className="header">
          <div className="logo">
            <span className="logo-text">StorySounds</span>
            <div className="logo-pulse"></div>
          </div>
          
          <div className="header-actions">
            {isAuthenticated ? (
              <UserMenu />
            ) : (
              <AuthButton onSignIn={handleSignIn} onSignUp={handleSignUp} />
            )}
            
            <button 
              className="test-connection-btn"
              onClick={handleTestConnection}
              style={{
                background: 'rgba(255, 255, 255, 0.1)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                color: 'white',
                padding: '0.5rem 1rem',
                borderRadius: '8px',
                fontSize: '0.9rem',
                cursor: 'pointer',
                transition: 'all 0.3s ease',
                marginLeft: '1rem'
              }}
            >
              Test Backend
            </button>
          </div>
        </header>

        <main className="main">
          <div className="hero-section">
            <div className="hero-content">
              <h1 className="headline">
                <span className="headline-part">Tell Your Story.</span>
                <span className="headline-part gradient-text">Get the Playlist</span>
              </h1>
              
              <p className="subtext">
                Speak a vibe, a moment, or a mood. We'll transcribe it and create a Spotify playlist that matches perfectly.
              </p>

              {!audioBlob && !transcription ? (
                <div className="input-recording-container">
                  {/* Text Input with Send Button */}
                  <div className="text-input-container">
                    <input
                      type="text"
                      value={textInput}
                      onChange={(e) => setTextInput(e.target.value)}
                      placeholder="Describe your mood, vibe, or the music you're looking for..."
                      className="text-input"
                      onKeyPress={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleTextSubmit();
                        }
                      }}
                      disabled={isProcessing}
                    />
                    <button
                      className="send-button"
                      onClick={handleTextSubmit}
                      disabled={!textInput.trim() || isProcessing}
                    >
                      <span className="send-icon">📤</span>
                    </button>
                  </div>

                  {/* Divider */}
                  <div className="input-divider">
                    <span>or</span>
                  </div>

                  {/* Recording Button */}
                  <button 
                    className={`cta-button ${isRecording ? 'recording' : ''}`}
                    onClick={isRecording ? handleStopRecording : handleStartRecording}
                    disabled={isRecording && recordingTime < 1}
                  >
                    <div className="button-content">
                      <span className="mic-icon">
                        {isRecording ? '⏹️' : '🎙️'}
                      </span>
                      <span className="button-text">
                        {isRecording ? `Recording... ${formatTime(recordingTime)}` : `Record The Vibe You're Feeling`}
                      </span>
                    </div>
                    {isRecording && (
                      <div className="recording-indicator">
                        <div className="pulse"></div>
                      </div>
                    )}
                  </button>
                </div>
              )  : (
                <div className="recording-results">
                  <div className="playback-controls">
                    <audio 
                      ref={audioRef} 
                      src={audioUrl} 
                      onEnded={() => setIsPlaying(false)}
                    />
                    
                    <button className="play-button" onClick={handlePlayPause}>
                      <span className="play-icon">
                        {isPlaying ? '⏸️' : '▶️'}
                      </span>
                      <span className="play-text">
                        {isPlaying ? 'Pause' : 'Play Recording'}
                      </span>
                    </button>
                    
                    <div className="recording-actions">
                      <button className="action-button download" onClick={handleDownload}>
                        <span>📥</span>
                        Download
                      </button>
                      
                      <button className="action-button new-recording" onClick={handleNewRecording}>
                        <span>🎙️</span>
                        New Recording
                      </button>
                    </div>
                  </div>

                  {/* Processing Section */}
                  <div className="processing-section">
                    <h3>Your Personalized Playlist</h3>
                    
                    {isProcessing && (
                      <div className="processing-loading">
                        <div className="loading-spinner"></div>
                        <div className="processing-steps">
                          <p>🎤 Transcribing your audio...</p>
                          <p>🤖 Generating song recommendations...</p>
                          <p>🎵 Finding tracks on Spotify...</p>
                          <p>📺 Adding YouTube previews...</p>
                          <p>📋 Creating your playlist...</p>
                        </div>
                      </div>
                    )}
                    
                    {processingError && (
                      <div className="processing-error">
                        <p>❌ {processingError}</p>
                        <button 
                          className="retry-button"
                          onClick={handleRetryProcessing}
                        >
                          Retry
                        </button>
                      </div>
                    )}
                    
                    {transcription && !isProcessing && (
                      <div className="transcription-result">
                        <h4>What you said:</h4>
                        <div className="transcription-text">
                          <p>"{transcription}"</p>
                        </div>
                      </div>
                    )}

                    {/* Enhanced Playlist Summary */}
                    {playlistSummary && (
                      <div className="playlist-summary">
                        <div className="summary-stats">
                          <div className="stat">
                            <span className="stat-number">{playlistSummary.totalRecommended || 0}</span>
                            <span className="stat-label">Songs Recommended</span>
                          </div>
                          <div className="stat">
                            <span className="stat-number">{playlistSummary.foundOnSpotify || 0}</span>
                            <span className="stat-label">Found on Spotify</span>
                          </div>
                          {playlistSummary.totalPreviews !== undefined && (
                            <div className="stat">
                              <span className="stat-number">{playlistSummary.totalPreviews}</span>
                              <span className="stat-label">Total Previews</span>
                            </div>
                          )}
                          {playlistSummary.spotifyPreviews !== undefined && playlistSummary.youtubePreviews !== undefined && (
                            <div className="stat">
                              <span className="stat-number">
                                {playlistSummary.spotifyPreviews}/{playlistSummary.youtubePreviews}
                              </span>
                              <span className="stat-label">Spotify/YouTube</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Enhanced Spotify Tracks with Hybrid Previews */}
                    {spotifyTracks.length > 0 && (
                      <div className="spotify-playlist">
                        <h4>Your Spotify Playlist:</h4>
                        <div className="tracks-grid">
                          {spotifyTracks.map((track, index) => (
                            <div key={track.id || index} className="track-card">
                              {track.image && (
                                <img 
                                  src={track.image} 
                                  alt={track.album}
                                  className="track-image"
                                />
                              )}
                              <div className="track-info">
                                <h5 className="track-name">{track.name}</h5>
                                <p className="track-artist">{track.artist}</p>
                                <p className="track-album">{track.album}</p>
                                {track.recommendation && (
                                  <p className="track-reason">💭 {track.recommendation.reason}</p>
                                )}
                                
                                {/* Preview source indicator */}
                                <div className="preview-sources">
                                  {track.preview_url && (
                                    <span className="preview-source spotify">🎧 Spotify Preview</span>
                                  )}
                                  {!track.preview_url && track.youtube_preview && (
                                    <span className="preview-source youtube">📺 YouTube Preview</span>
                                  )}
                                  {!track.preview_url && !track.youtube_preview && (
                                    <span className="preview-source none">❌ No Preview</span>
                                  )}
                                </div>

                                <div className="track-actions">
                                  {/* Enhanced preview button */}
                                  {(track.preview_url || track.youtube_preview) ? (
                                    <button 
                                      className={`preview-button ${
                                        track.preview_url 
                                          ? (currentPreview && currentPreview.src === track.preview_url && isPreviewPlaying ? 'playing' : '')
                                          : ''
                                      }`}
                                      onClick={() => handlePreviewClick(track)}
                                    >
                                      {track.preview_url ? (
                                        // Spotify preview
                                        currentPreview && currentPreview.src === track.preview_url && isPreviewPlaying 
                                          ? '⏸️ Pause' 
                                          : '🎧 Preview'
                                      ) : (
                                        // YouTube preview
                                        '📺 Preview'
                                      )}
                                    </button>
                                  ) : (
                                    <span className="no-preview">No preview available</span>
                                  )}
                                  
                                  {/* Spotify link */}
                                  {track.external_urls?.spotify && (
                                    <a 
                                      href={track.external_urls.spotify}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="spotify-link"
                                    >
                                      🎧 Open in Spotify
                                    </a>
                                  )}
                                  
                                  {/* YouTube link (if available) */}
                                  {track.youtube_preview && (
                                    <a 
                                      href={track.youtube_preview.youtubeUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="youtube-link"
                                    >
                                      📺 YouTube
                                    </a>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                        
                        <div className="playlist-actions">
                          <SpotifyAuthSection />
                          <button 
                            className="retry-button"
                            onClick={handleRetryProcessing}
                          >
                            🔄 Generate New Playlist
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="features">
                <div className="feature">
                  <div className="feature-icon">🎵</div>
                  <span>AI-Powered Matching</span>
                </div>
                <div className="feature">
                  <div className="feature-icon">⚡</div>
                  <span>Instant Playlists</span>
                </div>
                <div className="feature">
                  <div className="feature-icon">🎧</div>
                  <span>Spotify Integration</span>
                </div>
              </div>
            </div>

            <div className="hero-visual">
              <div className="sound-wave">
                <div className="wave-bar"></div>
                <div className="wave-bar"></div>
                <div className="wave-bar"></div>
                <div className="wave-bar"></div>
                <div className="wave-bar"></div>
                <div className="wave-bar"></div>
                <div className="wave-bar"></div>
                <div className="wave-bar"></div>
              </div>
              <div className="microphone-glow"></div>
            </div>
          </div>
        </main>

        <button 
          className="feedback-trigger-button"
          onClick={() => setIsFeedbackModalOpen(true)}
        >
          💬 Feedback
        </button>
        
        {/* Modals */}
        <FeedbackModal 
          isOpen={isFeedbackModalOpen}
          onClose={() => setIsFeedbackModalOpen(false)}
        />
        
        <AuthModal 
          isOpen={isAuthModalOpen}
          onClose={closeAuthModal}
          initialMode={authModalMode}
        />

        <footer className="footer">
          <div className="footer-content">
            <p>&copy; 2025 StorySounds. Experience music like never before.</p>
          </div>
        </footer>
      </div>

      {/* YouTube Modal */}
      <YouTubeModal 
        modal={youtubeModal} 
        onClose={() => setYoutubeModal(null)} 
      />
    </div>
  );
};

// Main App Content Component with routing
const AppContent = () => {
  return (
    <Routes>
      {/* Homepage route */}
      <Route path="/" element={<HomePage />} />
      
      {/* Playlist History route */}
      <Route path="/playlist-history" element={<PlaylistHistory />} />
      
      {/* Redirect any unknown routes to homepage */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

// Main App wrapper with AuthProvider and Router
const App = () => {
  return (
    <AuthProvider>
      <Router>
        <AppContent />
      </Router>
    </AuthProvider>
  );
};

export default App;