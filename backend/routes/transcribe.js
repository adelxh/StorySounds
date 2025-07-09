// backend/routes/transcribe.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { OpenAI } = require('openai');
const axios = require('axios');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, 
});

// Use environment variables first, fallback to hardcoded (not recommended for production)
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

// Debug: Check API keys
console.log('=== API KEYS CHECK ===');
console.log('OpenAI API Key:', !!openai.apiKey ? '✅ Present' : '❌ Missing');
console.log('Spotify Client ID:', !!SPOTIFY_CLIENT_ID ? '✅ Present' : '❌ Missing');
console.log('Spotify Client Secret:', !!SPOTIFY_CLIENT_SECRET ? '✅ Present' : '❌ Missing');
console.log('YouTube API Key:', !!YOUTUBE_API_KEY ? '✅ Present' : '❌ Missing');
console.log('=== END API KEYS CHECK ===');

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

// FIXED: YouTube search function with proper error handling
async function getYouTubePreview(songName, artistName) {
  console.log(`\n🔍 Searching YouTube for: "${songName}" by "${artistName}"`);
  
  if (!YOUTUBE_API_KEY) {
    console.log('❌ YouTube API key not found, skipping YouTube preview');
    return null;
  }

  // Handle undefined or null values safely
  const safeSongName = songName || 'Unknown Song';
  const safeArtistName = artistName && artistName !== 'undefined' && artistName !== 'Unknown Artist' 
    ? artistName 
    : '';

  try {
    // Create search query - skip artist if it's undefined/unknown
    const searchQuery = safeArtistName 
      ? `${safeSongName} ${safeArtistName}`
      : safeSongName;
    
    console.log(`  🔍 Search query: "${searchQuery}"`);
    
    const response = await axios.get('https://www.googleapis.com/youtube/v3/search', {
      params: {
        part: 'snippet',
        q: searchQuery,
        type: 'video',
        maxResults: 10,
        key: YOUTUBE_API_KEY,
        order: 'relevance'
      },
      timeout: 10000
    });

    console.log(`  📊 API Response: ${response.data.items?.length || 0} videos found`);
    
    if (response.data.items && response.data.items.length > 0) {
      const videos = response.data.items;
      
      const scoredVideos = videos.map(video => {
        let score = 0;
        const title = video.snippet.title.toLowerCase();
        const channelTitle = video.snippet.channelTitle.toLowerCase();
        const songLower = safeSongName.toLowerCase();
        const artistLower = safeArtistName ? safeArtistName.toLowerCase() : '';
        
        // Title matching
        if (title.includes(songLower)) score += 30;
        if (artistLower && title.includes(artistLower)) score += 20;
        
        // Prefer official content
        if (title.includes('official')) score += 25;
        if (title.includes('audio')) score += 20;
        if (title.includes('video')) score += 15;
        if (title.includes('music')) score += 10;
        
        // Channel matching (only if we have an artist)
        if (artistLower) {
          if (channelTitle.includes(artistLower)) score += 25;
          if (channelTitle.includes('official')) score += 15;
          if (channelTitle.includes('records')) score += 10;
          if (channelTitle.includes('music')) score += 10;
        }
        
        // Avoid non-music content
        if (title.includes('cover') && !title.includes('official')) score -= 10;
        if (title.includes('remix') && !title.includes('official')) score -= 5;
        if (title.includes('live') && !title.includes('official')) score -= 5;
        if (title.includes('karaoke')) score -= 20;
        if (title.includes('instrumental')) score -= 10;
        if (title.includes('tutorial')) score -= 20;
        if (title.includes('reaction')) score -= 30;
        
        return { video, score, title, channelTitle };
      });
      
      scoredVideos.sort((a, b) => b.score - a.score);
      
      console.log(`  📊 Top 3 scored results:`);
      scoredVideos.slice(0, 3).forEach((item, index) => {
        console.log(`    ${index + 1}. Score: ${item.score} - "${item.title}" by ${item.channelTitle}`);
      });
      
      // Use best match if score is reasonable (lowered threshold)
      const bestMatch = scoredVideos.find(item => item.score > 5);
      
      if (bestMatch) {
        const video = bestMatch.video;
        console.log(`  ✅ Selected: "${video.snippet.title}" (Score: ${bestMatch.score})`);
        console.log(`  📺 Channel: ${video.snippet.channelTitle}`);
        console.log(`  🆔 Video ID: ${video.id.videoId}`);
        
        return {
          videoId: video.id.videoId,
          title: video.snippet.title,
          channelTitle: video.snippet.channelTitle,
          youtubeUrl: `https://www.youtube.com/watch?v=${video.id.videoId}`,
          embedUrl: `https://www.youtube.com/embed/${video.id.videoId}?autoplay=1&start=30`,
          score: bestMatch.score
        };
      } else {
        console.log(`  ❌ No good matches found (all scores below 5)`);
        return null;
      }
    } else {
      console.log(`  ❌ No videos returned from API`);
      return null;
    }
    
  } catch (error) {
    console.error(`❌ YouTube search error for ${safeSongName}:`, error.response?.data || error.message);
    return null;
  }
}

// FIXED: Test function without scope issues
async function testYouTubeWithRealSong() {
  console.log('\n🧪 Testing YouTube API with a real song...');
  
  try {
    const testResult = await getYouTubePreview('Blinding Lights', 'The Weeknd');
    
    if (testResult) {
      console.log('✅ YouTube search test successful!');
      console.log('Test result:', testResult);
      return true;
    } else {
      console.log('❌ YouTube search test failed - no results found');
      return false;
    }
  } catch (error) {
    console.log('❌ YouTube search test failed with error:', error.message);
    return false;
  }
}

// FIXED: Enhancement function
async function enhanceTracksWithYouTube(spotifyTracks) {
  console.log(`\n🎵 Starting YouTube enhancement for ${spotifyTracks.length} tracks...`);
  
  // Test YouTube API first
  const apiWorking = await testYouTubeWithRealSong();
  if (!apiWorking) {
    console.log('❌ YouTube API not working properly, skipping YouTube previews');
    return spotifyTracks;
  }
  
  const enhancedTracks = [];
  let youtubeSuccessCount = 0;
  let spotifyPreviewCount = 0;
  
  for (let i = 0; i < spotifyTracks.length; i++) {
    const track = spotifyTracks[i];
    let enhancedTrack = { ...track };
    

    const artistName = track.artists && track.artists.length > 0 ? track.artists[0].name : 'Unknown Artist'; 

    console.log(`\n📀 Track ${i + 1}/${spotifyTracks.length}: "${track.name}" by "${artistName}"`);
    
    if (track.preview_url) {
      console.log('  ✅ Spotify preview available, skipping YouTube search');
      spotifyPreviewCount++;
    } else {
      console.log('  ❌ No Spotify preview, searching YouTube...');
      
      const youtubePreview = await getYouTubePreview(track.name, artistName);
      
      if (youtubePreview) {
        enhancedTrack.youtube_preview = youtubePreview;
        youtubeSuccessCount++;
        console.log(`  ✅ YouTube preview added for "${track.name}"`);
      } else {
        console.log(`  ❌ No suitable YouTube preview found for "${track.name}"`);
      }
      
      // Rate limiting delay
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    
    enhancedTracks.push(enhancedTrack);
  }
  
  console.log(`\n📊 Enhancement complete:`);
  console.log(`  🎧 Spotify previews: ${spotifyPreviewCount}`);
  console.log(`  📺 YouTube previews: ${youtubeSuccessCount}`);
  console.log(`  ❌ No previews: ${spotifyTracks.length - spotifyPreviewCount - youtubeSuccessCount}`);
  console.log(`  📈 Total coverage: ${((spotifyPreviewCount + youtubeSuccessCount) / spotifyTracks.length * 100).toFixed(1)}%`);
  
  return enhancedTracks;
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
        limit: limit
        // Removed market restriction for better results
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

Generate a list of 15 specific songs that match their request. Include songs from the mentioned genres, countries, languages, or themes.
Please suggest songs that would be perfect for this. Think about:
- The exact mood and vibe they're describing
- their age group and what statistically that age group listens to
- any cultural/regional preferences mentioned
- the energy level they might want
- musical styles that would match their description 
- pay close attention to the language they're requesting for example (give me russian songs) will mean you should PRIORITIZE the songs in that specific language.  

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
          content: "You are a music DJ who gives personalized recommendations just like a knowledgeable friend would. You understand nuanced music preferences and can match songs to specific moods, cultures, and vibes perfectly. Always respond with valid JSON."
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
    message: 'Enhanced transcription and playlist service is running',
    features: [
      'audio-transcription', 
      'ai-recommendations', 
      'spotify-search', 
      'youtube-previews',
      'hybrid-preview-system'
    ]
  });
});

// FIXED: Main endpoint with proper flow
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
        // language: 'en', 
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

      // FIXED: Add Spotify debug in the correct place
      console.log('=== SPOTIFY TRACK MAPPING DEBUG ===');
      spotifyTracks.forEach((track, index) => {
        console.log(`Track ${index + 1}:`);
        console.log(`  Raw track.name: "${track.name}"`);
        console.log(`  Raw track.artists:`, track.artists);
        console.log(`  First artist: "${track.artists?.[0]?.name}"`);
        console.log(`  Mapped artist: "${track.artists && track.artists.length > 0 ? track.artists[0].name : 'Unknown Artist'}"`);
      });
      console.log('=== END SPOTIFY MAPPING DEBUG ===');

      console.log('=== ARTIST EXTRACTION DEBUG ==='); 
      spotifyTracks.forEach((track, index) => {
  console.log(`Track ${index + 1}: "${track.name}"`);
  console.log(`  Raw artists array:`, track.artists);
  console.log(`  Artists length:`, track.artists?.length);
  console.log(`  First artist:`, track.artists?.[0]);
  console.log(`  First artist name:`, track.artists?.[0]?.name);
  console.log(`  Final mapped artist:`, track.artists && track.artists.length > 0 ? track.artists[0].name : 'Unknown Artist');
  console.log('  ---');
});
console.log('=== END ARTIST DEBUG ===');

      // Step 5: Enhance with YouTube previews
      console.log('Enhancing tracks with YouTube previews...');
      const enhancedTracks = await enhanceTracksWithYouTube(spotifyTracks);

      const spotifyPreviews = enhancedTracks.filter(t => t.preview_url).length;
      const youtubePreviews = enhancedTracks.filter(t => t.youtube_preview).length;
      console.log(`Preview availability: ${spotifyPreviews} Spotify, ${youtubePreviews} YouTube`);

      // FIXED: Prepare response with enhanced tracks
      const response = {
        transcription: transcriptionText,
        aiRecommendations: songRecommendations,
        spotifyTracks: enhancedTracks.map(track => ({
          id: track.id,
          name: track.name,
          artist: track.artists && track.artists.length > 0 ? track.artists[0].name : 'Unknown Artist',
          album: track.album?.name,
          preview_url: track.preview_url,
          youtube_preview: track.youtube_preview,
          external_urls: track.external_urls,
          image: track.album?.images?.[0]?.url,
          recommendation: track.recommendation
        })),
        playlistSummary: {
          totalRecommended: songRecommendations.length,
          foundOnSpotify: enhancedTracks.length,
          spotifyPreviews: spotifyPreviews,
          youtubePreviews: youtubePreviews,
          totalPreviews: spotifyPreviews + youtubePreviews,
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