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
    };
  }, []);

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
      
      // Update state with all the response data
      setTranscription(data.transcription || 'No transcription available');
      setAiRecommendations(data.aiRecommendations || []);
      setSpotifyTracks(data.spotifyTracks || []);
      setPlaylistSummary(data.playlistSummary || null);
      
      console.log('Processing successful:', {
        transcription: data.transcription,
        foundTracks: data.spotifyTracks?.length || 0,
        totalRecommendations: data.aiRecommendations?.length || 0
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

                    {playlistSummary && (
                      <div className="playlist-summary">
                        <div className="summary-stats">
                          <div className="stat">
                            <span className="stat-number">{playlistSummary.totalRecommended}</span>
                            <span className="stat-label">Songs Recommended</span>
                          </div>
                          <div className="stat">
                            <span className="stat-number">{playlistSummary.foundOnSpotify}</span>
                            <span className="stat-label">Found on Spotify</span>
                          </div>
                        </div>
                      </div>
                    )}

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
                                <div className="track-actions">
                                  {track.preview_url && (
                                    <button 
                                      className="preview-button"
                                      onClick={() => {
                                        const audio = new Audio(track.preview_url);
                                        audio.play();
                                      }}
                                    >
                                      🎵 Preview
                                    </button>
                                  )}
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
                            Generate New Playlist
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
    </div>
  );
};

export default App;