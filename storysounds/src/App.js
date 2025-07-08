import React, { useState, useEffect, useRef } from 'react';
import './App.css';

// API Base URL
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

const App = () => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [isRecording, setIsRecording] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState('prompt');
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  
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
  
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const audioRef = useRef(null);
  const streamRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    setIsLoaded(true);
    
    const handleMouseMove = (e) => {
      setMousePosition({ x: e.clientX, y: e.clientY });
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
  }, [currentPreview]);
  
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

  // Enhanced hybrid preview handler
  const handlePreviewClick = (track) => {
    // Priority 1: Use Spotify preview if available
    if (track.preview_url) {
      handleSpotifyPreview(track);
      return;
    }
    
    // Priority 2: Use YouTube preview if Spotify not available
    if (track.youtube_preview) {
      handleYouTubePreview(track);
      return;
    }
    
    // No preview available
    alert('No preview available for this track');
  };

  // Spotify preview handler
  const handleSpotifyPreview = (track) => {
    // If clicking the same track that's already playing, pause it
    if (currentPreview && currentPreview.src === track.preview_url && isPreviewPlaying) {
      currentPreview.pause();
      setIsPreviewPlaying(false);
      return;
    }

    // Stop any currently playing preview
    if (currentPreview) {
      currentPreview.pause();
      currentPreview.currentTime = 0;
    }

    // Close YouTube modal if open
    setYoutubeModal(null);

    // Create and play new audio
    const audio = new Audio(track.preview_url);
    audio.volume = 0.7;
    
    // Auto-stop after 30 seconds
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

  // YouTube preview handler
  const handleYouTubePreview = (track) => {
    console.log('Opening YouTube preview for:', track.name);
  
  // Stop any Spotify preview
  if (currentPreview) {
    currentPreview.pause();
    setCurrentPreview(null);
    setIsPreviewPlaying(false);
  }

  // Check if modal is already open for this track
  if (youtubeModal && youtubeModal.videoId === track.youtube_preview.videoId) {
    console.log('Modal already open for this track, closing');
    setYoutubeModal(null);
    return;
  }

  // Open YouTube modal
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

  // Function to process audio and generate playlist
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
      
      const response = await fetch(`${API_BASE_URL}/api/transcribe`, {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.details || errorData.error || `HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Enhanced debugging for hybrid system
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
        
        // Summary
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

      // Update state with all the response data
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
      
      // Clear previous results
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
        
        // Automatically process audio and generate playlist
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
    // Stop any playing previews
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
      const response = await fetch(`${API_BASE_URL}/api/transcribe`, {
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
      <div 
        className="mouse-follower"
        style={{
          left: mousePosition.x,
          top: mousePosition.y,
        }}
      ></div>

      {/* Main content */}
      <div className={`container ${isLoaded ? 'loaded' : ''}`}>
        <header className="header">
          <div className="logo">
            <span className="logo-text">SoundStory</span>
            <div className="logo-pulse"></div>
          </div>
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
              transition: 'all 0.3s ease'
            }}
          >
            Test Backend
          </button>
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

              {!audioBlob ? (
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
                      {isRecording ? `Recording... ${formatTime(recordingTime)}` : 'Start Recording'}
                    </span>
                  </div>
                  {isRecording && (
                    <div className="recording-indicator">
                      <div className="pulse"></div>
                    </div>
                  )}
                </button>
              ) : (
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

        <footer className="footer">
          <div className="footer-content">
            <p>&copy; 2025 SoundStory. Experience music like never before.</p>
            <p style={{ fontSize: '0.8rem', opacity: 0.7, marginTop: '0.5rem' }}>
              Backend: {API_BASE_URL}
            </p>
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

export default App;