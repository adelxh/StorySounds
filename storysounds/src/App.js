import React, { useState, useEffect, useRef } from 'react';
import './App.css';

const App = () => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [isRecording, setIsRecording] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState('prompt');
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  
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
      // Cleanup
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

  const handleStartRecording = async () => {
    try {
      setIsRecording(true);
      audioChunksRef.current = [];
      
      // Request microphone permission
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
      
      // Create MediaRecorder instance
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
        const audioBlob = new Blob(audioChunksRef.current, { 
          type: 'audio/webm;codecs=opus' 
        });
        setAudioBlob(audioBlob);
        
        // Create URL for playback
        const url = URL.createObjectURL(audioBlob);
        setAudioUrl(url);
        
        // Stop all tracks
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
        }
      };
      
      // Start recording
      mediaRecorder.start(100); // Collect data every 100ms
      startTimer();
      
    } catch (error) {
      setIsRecording(false);
      stopTimer();
      
      if (error.name === 'NotAllowedError') {
        setPermissionStatus('denied');
        alert('Microphone access is required to record your story. Please allow microphone access and try again.');
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
        </header>

        <main className="main">
          <div className="hero-section">
            <div className="hero-content">
              <h1 className="headline">
                <span className="headline-part">Tell Your Story.</span>
                <span className="headline-part gradient-text">Get the Playlist</span>
              </h1>
              
              <p className="subtext">
                Speak a vibe, a moment, or a mood. We'll match it with music that gets it.
              </p>

              {!audioBlob ? (
                <button 
                  className={`cta-button ${isRecording ? 'recording' : ''}`} 
                  onClick={isRecording ? handleStopRecording : handleStartRecording}
                  disabled={false}
                >
                  <span className="cta-icon">
                    {isRecording ? '⏹️' : '🎙️'}
                  </span>
                  <span className="cta-text">
                    {isRecording ? `Recording ${formatTime(recordingTime)}` : 'Start Recording'}
                  </span>
                  <div className="cta-ripple"></div>
                </button>
              ) : (
                <div className="recording-controls">
                  <div className="audio-player">
                    <audio 
                      ref={audioRef}
                      src={audioUrl}
                      onEnded={() => setIsPlaying(false)}
                      onLoadedMetadata={() => {
                        // Audio is ready to play
                      }}
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
                </div>
              )}

              <div className="features">
                <div className="feature">
                  <div className="feature-icon">🎵</div>
                  <span>AI-Powered Matching</span>
                </div>
                <div className="feature">
                  <div className="feature-icon">⚡</div>
                  <span>Instant Results</span>
                </div>
                <div className="feature">
                  <div className="feature-icon">🎧</div>
                  <span>Personalized Playlists</span>
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
          </div>
        </footer>
      </div>
    </div>
  );
};

export default App;