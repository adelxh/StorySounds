// backend/routes/transcribe.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { OpenAI } = require('openai');
const axios = require('axios');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // Replace with your actual key
});

// Spotify credentials - add these to your .env file
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;

if (!process.env.OPENAI_API_KEY) {
  console.error('❌ OPENAI_API_KEY not found in environment variables');
}
if (!process.env.SPOTIFY_CLIENT_ID) {
  console.error('❌ SPOTIFY_CLIENT_ID not found in environment variables');
}
if (!process.env.SPOTIFY_CLIENT_SECRET) {
  console.error('❌ SPOTIFY_CLIENT_SECRET not found in environment variables');
}

// Configure multer to save files with proper extensions
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = 'uploads/';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const timestamp = Date.now();
    const extension = getFileExtension(file);
    cb(null, `audio_${timestamp}.${extension}`);
  }
});

const upload = multer({ storage: storage });

// Helper function to determine file extension
function getFileExtension(file) {
  if (file.originalname && file.originalname.includes('.')) {
    const ext = file.originalname.split('.').pop().toLowerCase();
    const supportedFormats = ['flac', 'm4a', 'mp3', 'mp4', 'mpeg', 'mpga', 'oga', 'ogg', 'wav', 'webm'];
    if (supportedFormats.includes(ext)) {
      return ext;
    }
  }
  
  const mimeTypeMap = {
    'audio/webm': 'webm',
    'audio/ogg': 'ogg',
    'audio/mpeg': 'mp3',
    'audio/mp4': 'm4a',
    'audio/wav': 'wav',
    'audio/flac': 'flac',
    'video/webm': 'webm',
  };
  
  if (file.mimetype && mimeTypeMap[file.mimetype]) {
    return mimeTypeMap[file.mimetype];
  }
  
  return 'webm';
}

// Get Spotify access token using Client Credentials flow
async function getSpotifyAccessToken() {
  try {
    const response = await axios.post('https://accounts.spotify.com/api/token', 
      'grant_type=client_credentials',
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64')}`
        }
      }
    );
    return response.data.access_token;
  } catch (error) {
    console.error('Error getting Spotify token:', error);
    throw new Error('Failed to authenticate with Spotify');
  }
}

// Search for tracks on Spotify
async function searchSpotifyTracks(query, accessToken, limit = 10) {
  try {
    const response = await axios.get('https://api.spotify.com/v1/search', {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      },
      params: {
        q: query,
        type: 'track',
        limit: limit,
        market: 'US'
      }
    });
    return response.data.tracks.items;
  } catch (error) {
    console.error('Error searching Spotify:', error);
    return [];
  }
}

// Generate song recommendations using OpenAI
async function generateSongRecommendations(transcription) {
  try {
    const prompt = `Based on this user's request: "${transcription}"

Generate a list of 15 specific songs that match their request. Include songs from the mentioned genres, countries, or themes.
Please suggest songs that would be perfect for this. Think about:
- The exact mood and vibe they're describing
- their age group and what statistically that age group listens to
- any cultural/regional preferences mentioned
- the energy level they might want
- musical styles that would match their description 

Please focus on this: 
- popular enough to be easily found
- well-known tracks 


Format your response as a JSON array with this exact structure:
[
  {
    "song": "Song Title",
    "artist": "Artist Name",
    "reason": "Brief reason why this song fits"
  }
]

Be specific with real song titles and artist names. Focus on popular and recognizable songs.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: "You are a music expert who gives personalized recommendations just like a knowledgeable friend would. You understand nuanced music preferences and can match songs to specific moods, cultures, and vibes perfectly. Always respond with valid JSON."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.4,
      max_tokens: 2000, 
    });

    const responseText = completion.choices[0].message.content;
    
    // Try to extract JSON from the response
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    } else {
      throw new Error('Failed to parse song recommendations');
    }
  } catch (error) {
    console.error('Error generating song recommendations:', error);
    throw new Error('Failed to generate song recommendations');
  }
}

// Find tracks on Spotify based on AI recommendations
async function findSpotifyTracks(songRecommendations, accessToken) {
  const foundTracks = [];
  
  for (const recommendation of songRecommendations) {
    try {
      // Search for the specific song and artist
      const query = `track:"${recommendation.song}" artist:"${recommendation.artist}"`;
      const tracks = await searchSpotifyTracks(query, accessToken, 1);
      
      if (tracks.length > 0) {
        foundTracks.push({
          ...tracks[0],
          recommendation: recommendation
        });
      } else {
        // Fallback: search with broader query
        const fallbackQuery = `${recommendation.song} ${recommendation.artist}`;
        const fallbackTracks = await searchSpotifyTracks(fallbackQuery, accessToken, 1);
        
        if (fallbackTracks.length > 0) {
          foundTracks.push({
            ...fallbackTracks[0],
            recommendation: recommendation
          });
        }
      }
      
      // Add small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      console.error(`Error finding track for ${recommendation.song}:`, error);
    }
  }
  
  return foundTracks;
}

// Health check endpoint
router.get('/', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Transcription and playlist service is running',
    features: ['transcription', 'spotify-search', 'ai-recommendations']
  });
});

// Main transcription and playlist generation endpoint
router.post('/', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided' });
    }

    const audioPath = req.file.path;
    console.log(`Processing file: ${audioPath}`);

    // Verify file exists and has content
    const fileStats = fs.statSync(audioPath);
    if (fileStats.size === 0) {
      fs.unlinkSync(audioPath);
      return res.status(400).json({ error: 'Uploaded file is empty' });
    }

    let transcriptionText = '';
    
    try {
      // Step 1: Transcribe audio
      const audioStream = fs.createReadStream(audioPath);
      
      const transcription = await openai.audio.transcriptions.create({
        file: audioStream,
        model: 'whisper-1',
        response_format: 'json',
        language: 'en',
      });

      transcriptionText = transcription.text;
      console.log('Transcription successful:', transcriptionText);

      // Delete audio file after transcription
      fs.unlinkSync(audioPath);

      // Step 2: Generate song recommendations using AI
      console.log('Generating song recommendations...');
      const songRecommendations = await generateSongRecommendations(transcriptionText);
      console.log(`Generated ${songRecommendations.length} song recommendations`);

      // Step 3: Get Spotify access token
      console.log('Getting Spotify access token...');
      const spotifyToken = await getSpotifyAccessToken();

      // Step 4: Search for tracks on Spotify
      console.log('Searching for tracks on Spotify...');
      const spotifyTracks = await findSpotifyTracks(songRecommendations, spotifyToken);
      console.log(`Found ${spotifyTracks.length} tracks on Spotify`);

      // Prepare response
      const response = {
        transcription: transcriptionText,
        aiRecommendations: songRecommendations,
        spotifyTracks: spotifyTracks.map(track => ({
          id: track.id,
          name: track.name,
          artist: track.artists[0]?.name,
          album: track.album?.name,
          preview_url: track.preview_url,
          external_urls: track.external_urls,
          image: track.album?.images?.[0]?.url,
          recommendation: track.recommendation
        })),
        playlistSummary: {
          totalRecommended: songRecommendations.length,
          foundOnSpotify: spotifyTracks.length,
          success: true
        }
      };

      res.json(response);

    } catch (transcriptionError) {
      if (fs.existsSync(audioPath)) {
        fs.unlinkSync(audioPath);
      }
      
      console.error('Processing error:', transcriptionError);
      
      if (transcriptionError.status === 400) {
        res.status(400).json({ 
          error: 'Invalid audio file format or content',
          details: transcriptionError.message
        });
      } else {
        res.status(500).json({ 
          error: 'Processing error',
          details: transcriptionError.message
        });
      }
    }

  } catch (err) {
    console.error('❌ Server error:', err);
    
    if (req.file && req.file.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({ 
      error: 'Internal server error',
      details: err.message
    });
  }
});

module.exports = router;