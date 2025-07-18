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
    // Create search query
    const searchQuery = safeArtistName 
      ? `${safeSongName} ${safeArtistName}`
      : safeSongName;
    
    console.log(`  🔍 Search query: "${searchQuery}"`);
    
    const response = await axios.get('https://www.googleapis.com/youtube/v3/search', {
      params: {
        part: 'snippet',
        q: searchQuery,
        type: 'video',
        maxResults: 15, // Get more results to find better matches
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
        
        console.log(`    🎥 Analyzing: "${video.snippet.title}" by ${video.snippet.channelTitle}`);
        
        // CRITICAL: Check for actual content similarity first
        let hasRelevantContent = false;
        
        // Check if song name appears in title
        const songWords = songLower.split(' ').filter(word => word.length > 2);
        const foundSongWords = songWords.filter(word => title.includes(word));
        const songTitleMatch = songWords.length > 0 ? foundSongWords.length / songWords.length : 0;
        
        // Check if artist name appears in title or channel
        let artistMatch = 0;
        if (artistLower) {
          const artistWords = artistLower.split(' ').filter(word => word.length > 2);
          const foundInTitle = artistWords.filter(word => title.includes(word));
          const foundInChannel = artistWords.filter(word => channelTitle.includes(word));
          
          const titleArtistMatch = artistWords.length > 0 ? foundInTitle.length / artistWords.length : 0;
          const channelArtistMatch = artistWords.length > 0 ? foundInChannel.length / artistWords.length : 0;
          
          artistMatch = Math.max(titleArtistMatch, channelArtistMatch);
        }
        
        console.log(`      📊 Song title match: ${songTitleMatch.toFixed(2)} (${foundSongWords.length}/${songWords.length} words)`);
        console.log(`      📊 Artist match: ${artistMatch.toFixed(2)}`);
        
        // REQUIRE minimum similarity to be considered relevant
        if (songTitleMatch >= 0.4 || artistMatch >= 0.5) {
          hasRelevantContent = true;
          score += songTitleMatch * 100; // High weight for song title match
          score += artistMatch * 80; // High weight for artist match
          
          console.log(`      ✅ Content is relevant (song: ${songTitleMatch.toFixed(2)}, artist: ${artistMatch.toFixed(2)})`);
        } else {
          console.log(`      ❌ Content NOT relevant (song: ${songTitleMatch.toFixed(2)}, artist: ${artistMatch.toFixed(2)})`);
          // Don't score irrelevant content, regardless of other factors
          return { video, score: 0, title, channelTitle, hasRelevantContent: false };
        }
        
        // Only add bonus points if content is already relevant
        if (hasRelevantContent) {
          // Prefer official content
          if (title.includes('official')) score += 30;
          if (title.includes('music video')) score += 25;
          if (title.includes('official video')) score += 35;
          if (title.includes('official music video')) score += 40;
          
          // Channel credibility bonus (only if content matches)
          if (channelTitle.includes('official')) score += 20;
          if (channelTitle.includes('records')) score += 15;
          if (channelTitle.includes('music')) score += 10;
          
          // Avoid low-quality versions
          if (title.includes('cover') && !title.includes('official')) score -= 20;
          if (title.includes('karaoke')) score -= 30;
          if (title.includes('instrumental')) score -= 25;
          if (title.includes('remix') && !title.includes('official')) score -= 10;
        }
        
        console.log(`      📈 Final score: ${score}`);
        
        return { video, score, title, channelTitle, hasRelevantContent };
      });
      
      // Filter out irrelevant content first
      const relevantVideos = scoredVideos.filter(item => item.hasRelevantContent);
      
      console.log(`  📊 Relevant videos found: ${relevantVideos.length}/${scoredVideos.length}`);
      
      if (relevantVideos.length === 0) {
        console.log(`  ❌ No relevant videos found for "${safeSongName}" by "${safeArtistName}"`);
        return null;
      }
      
      // Sort relevant videos by score
      relevantVideos.sort((a, b) => b.score - a.score);
      
      console.log(`  📊 Top 3 relevant results:`);
      relevantVideos.slice(0, 3).forEach((item, index) => {
        console.log(`    ${index + 1}. Score: ${item.score} - "${item.title}" by ${item.channelTitle}`);
      });
      
      // Use best relevant match
      const bestMatch = relevantVideos[0];
      
      if (bestMatch && bestMatch.score > 20) { // Minimum score threshold
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
        console.log(`  ❌ No high-quality matches found (best score: ${bestMatch?.score || 0})`);
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
async function searchSingleYouTubePreview(track) {
  const artistName = track.artists && track.artists.length > 0 
    ? track.artists[0].name 
    : 'Unknown Artist';

  try {
    // Only search YouTube if no Spotify preview exists
    if (track.preview_url) {
      return {
        ...track,
        searchType: 'skipped_has_spotify',
        searchSuccess: true
      };
    }

    const youtubePreview = await getYouTubePreview(track.name, artistName);
    
    if (youtubePreview) {
      return {
        ...track,
        youtube_preview: youtubePreview,
        searchType: 'youtube_found',
        searchSuccess: true
      };
    } else {
      return {
        ...track,
        searchType: 'youtube_not_found',
        searchSuccess: true // Still successful, just no preview found
      };
    }
    
  } catch (error) {
    console.error(`❌ YouTube search error for "${track.name}":`, error.message);
    return {
      ...track,
      searchType: 'youtube_error',
      searchSuccess: false,
      error: error.message
    };
  }
}

async function enhanceTracksWithYouTube(spotifyTracks, maxConcurrency = 3) {
  console.log(`\n🎵 Starting parallel YouTube enhancement for ${spotifyTracks.length} tracks...`);
  const startTime = Date.now();
  
  // Test YouTube API first
  const apiWorking = await testYouTubeWithRealSong();
  if (!apiWorking) {
    console.log('❌ YouTube API not working properly, skipping YouTube previews');
    return spotifyTracks;
  }
  
  // Separate tracks that need YouTube search vs those that don't
  const tracksWithSpotify = spotifyTracks.filter(t => t.preview_url);
  const tracksNeedingYouTube = spotifyTracks.filter(t => !t.preview_url);
  
  console.log(`📊 Preview status: ${tracksWithSpotify.length} have Spotify, ${tracksNeedingYouTube.length} need YouTube`);
  
  // Process tracks in controlled batches for YouTube API rate limiting
  const enhancedTracks = [];
  const chunks = [];
  
  // Add tracks with Spotify previews (no processing needed)
  enhancedTracks.push(...tracksWithSpotify);
  
  // Split tracks needing YouTube into chunks
  for (let i = 0; i < tracksNeedingYouTube.length; i += maxConcurrency) {
    chunks.push(tracksNeedingYouTube.slice(i, i + maxConcurrency));
  }
  
  let youtubeSuccessCount = 0;
  let youtubeErrorCount = 0;
  
  // Process each chunk in parallel
  for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
    const chunk = chunks[chunkIndex];
    console.log(`🔍 Processing YouTube chunk ${chunkIndex + 1}/${chunks.length} (${chunk.length} tracks)`);
    
    // Execute YouTube searches in parallel for this chunk
    const chunkPromises = chunk.map(track => searchSingleYouTubePreview(track));
    const chunkResults = await Promise.allSettled(chunkPromises);
    
    // Process results
    chunkResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        const enhancedTrack = result.value;
        enhancedTracks.push(enhancedTrack);
        
        if (enhancedTrack.searchType === 'youtube_found') {
          youtubeSuccessCount++;
          console.log(`  ✅ YouTube preview found for "${enhancedTrack.name}"`);
        } else if (enhancedTrack.searchType === 'youtube_error') {
          youtubeErrorCount++;
        }
      } else {
        // Promise was rejected
        const originalTrack = chunk[index];
        enhancedTracks.push(originalTrack);
        youtubeErrorCount++;
        console.error(`❌ Failed to process "${originalTrack.name}":`, result.reason);
      }
    });
    
    // Small delay between chunks to respect YouTube API rate limits
    if (chunkIndex < chunks.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  const endTime = Date.now();
  const duration = endTime - startTime;
  
  // Calculate final stats
  const spotifyPreviewCount = enhancedTracks.filter(t => t.preview_url).length;
  const youtubePreviewCount = enhancedTracks.filter(t => t.youtube_preview).length;
  const totalWithPreviews = spotifyPreviewCount + youtubePreviewCount;
  const coveragePercent = ((totalWithPreviews / enhancedTracks.length) * 100).toFixed(1);
  
  console.log(`\n✅ Parallel YouTube enhancement completed in ${duration}ms`);
  console.log(`📊 Final results:`);
  console.log(`   🎧 Spotify previews: ${spotifyPreviewCount}`);
  console.log(`   📺 YouTube previews: ${youtubePreviewCount}`);
  console.log(`   ❌ No previews: ${enhancedTracks.length - totalWithPreviews}`);
  console.log(`   📈 Total coverage: ${coveragePercent}%`);
  console.log(`   ⚡ Speed improvement: ~${Math.round((tracksNeedingYouTube.length * 300) / duration)}x faster`);
  
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
    console.log(`Input transcription: ${transcription}`)
    const prompt = `Based on this user's request: "${transcription}, generate a list of 15 specific songs that match their request exactly, and exactly how they would appear in SPOTIFY. The songs have to be on spotify no exceptions."

Generate a list of 15 specific songs that match their request exactly. 

Important rules:
- If they ask for songs from a specific country (like Russian, French, etc.), ONLY recommend songs from that country/language
- If they ask for a specific genre, focus on that genre
- If they ask for a specific mood or theme, match that exactly
- Use real, popular songs that can be found on Spotify

Format your response as a JSON array:
[
  {
    "song": "Song Title",
    "artist": "Artist Name", 
    "reason": "Brief reason why this song fits their request"
  }
]

Focus on giving them exactly what they asked for - no exceptions.`;
console.log('🤖 Sending prompt to OpenAI...');
    console.log('📤 Prompt preview:', prompt.substring(0, 200) + '...');

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are a world music expert who has deep knowledge of songs from every culture and language. You never recommend songs that don't authentically belong to the requested culture or language. When users ask for songs from a specific country or in a specific language, you are extremely strict about cultural authenticity and language accuracy. You always verify that each song genuinely belongs to the requested category."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.1,
      max_tokens: 1500, 
    });

     const responseText = completion.choices[0].message.content;
    
    console.log(`\n📥 Raw OpenAI Response [${new Date().toLocaleTimeString()}]:`);
    console.log('─'.repeat(80));
    console.log(responseText);
    console.log('─'.repeat(80));
    
    // Try to extract JSON from the response
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsedRecommendations = JSON.parse(jsonMatch[0]);
       console.log(`\n🎵 Parsed Recommendations [${new Date().toLocaleTimeString()}]:`);
      parsedRecommendations.forEach((rec, index) => {
        console.log(`${index + 1}. "${rec.song}" by ${rec.artist}`);
        console.log(`   Reason: ${rec.reason}`);
        console.log('');
      });
      
      console.log(`✅ Successfully generated ${parsedRecommendations.length} recommendations`);
      console.log('=== END SONG GENERATION DEBUG ===\n');
      
      return parsedRecommendations;
    } else {
      throw new Error('Failed to parse song recommendations');
    }
  } catch (error) {
    console.error('Error generating song recommendations:', error);
    throw new Error('Failed to generate song recommendations');
  }
}

async function validateCulturalRecommendations(transcription, recommendations) {
  // Extract cultural requirements from transcription
  const culturalKeywords = {
    israeli: ['israeli', 'israel', 'hebrew', 'ivrit'],
    arabic: ['arabic', 'arab', 'middle east'],
    russian: ['russian', 'russia', 'russian language'],
    french: ['french', 'france', 'français'],
    spanish: ['spanish', 'spain', 'español', 'latino'],
    // Add more as needed
  };

  const lowerTranscription = transcription.toLowerCase();
  let detectedCulture = null;
  
  // Detect what culture was requested
  for (const [culture, keywords] of Object.entries(culturalKeywords)) {
    if (keywords.some(keyword => lowerTranscription.includes(keyword))) {
      detectedCulture = culture;
      break;
    }
  }

  // If no specific culture detected, return original recommendations
  if (!detectedCulture) {
    return recommendations;
  }

  console.log(`🔍 Detected cultural requirement: ${detectedCulture}`);

  // Validate each recommendation using AI
  const validationPrompt = `
  The user requested ${detectedCulture} songs. Please validate if these song recommendations are authentic to ${detectedCulture} culture:

  ${recommendations.map((r, i) => `${i+1}. "${r.song}" by ${r.artist}`).join('\n')}

  For each song, respond with ONLY "VALID" or "INVALID" based on whether it authentically belongs to ${detectedCulture} culture.
  
  Format: Just list the numbers and VALID/INVALID, like:
  1. VALID
  2. INVALID
  3. VALID
  etc.`;

  try {
    const validation = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system", 
          content: `You are a cultural music expert. You know exactly which songs belong to which cultures and languages. Be strict - only mark songs as VALID if they are authentically from the requested culture.`
        },
        {
          role: "user",
          content: validationPrompt
        }
      ],
      temperature: 0.1,
      max_tokens: 500
    });

    const validationResponse = validation.choices[0].message.content;
    const validationLines = validationResponse.split('\n').filter(line => line.trim());
    
    // Filter out invalid recommendations
    const validRecommendations = recommendations.filter((rec, index) => {
      const validationLine = validationLines[index];
      return validationLine && validationLine.includes('VALID');
    });

    console.log(`✅ Cultural validation: ${validRecommendations.length}/${recommendations.length} songs validated`);
    
    // If too many songs were filtered out, generate additional ones
    if (validRecommendations.length < 10) {
      console.log(`🔄 Only ${validRecommendations.length} valid songs, generating more...`);
      const additionalRecommendations = await generateMoreCulturalSongs(detectedCulture, 15 - validRecommendations.length);
      return [...validRecommendations, ...additionalRecommendations];
    }

    return validRecommendations;
    
  } catch (error) {
    console.error('Error validating cultural recommendations:', error);
    return recommendations; // Return original if validation fails
  }
}

async function generateMoreCulturalSongs(culture, count) {
  const culturalPrompts = {
    israeli: `Generate ${count} authentic Israeli/Hebrew songs. Include classics like "Hava Nagila", "Jerusalem of Gold", and modern Israeli artists like Idan Raichel, Sarit Hadad, Static & Ben El Tavori.`,
    arabic: `Generate ${count} authentic Arabic songs from various Arab countries. Include classics and modern hits.`,
    russian: `Generate ${count} authentic Russian songs sung in Russian language.`,
    // Add more cultures as needed
  };

  const specificPrompt = culturalPrompts[culture] || `Generate ${count} authentic songs from ${culture} culture.`;
  
  const prompt = `${specificPrompt}

Format as JSON array:
[
  {
    "song": "Song Title",
    "artist": "Artist Name",
    "reason": "Brief reason (include cultural authenticity)"
  }
]

CRITICAL: Every song must be authentically from ${culture} culture. No exceptions.`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are a ${culture} music expert. You only recommend songs that are 100% authentic to ${culture} culture and language.`
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.1,
      max_tokens: 1000
    });

    const responseText = completion.choices[0].message.content;
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    } else {
      return [];
    }
  } catch (error) {
    console.error('Error generating additional cultural songs:', error);
    return [];
  }
}
function deduplicateTracks(tracks) {
  const seen = new Map(); // Use Map to store both key and first occurrence
  const deduplicated = [];
  
  console.log(`\n🔄 DEDUPLICATION DEBUG [${new Date().toLocaleTimeString()}]`);
  console.log(`📊 Input: ${tracks.length} tracks`);
  
  for (const track of tracks) {
    // Create unique key based on track name + first artist (normalized)
    const normalizedTrackName = track.name.toLowerCase().trim();
    const normalizedArtistName = track.artists[0].name.toLowerCase().trim();
    const key = `${normalizedTrackName}___${normalizedArtistName}`;
    
    if (!seen.has(key)) {
      seen.set(key, track);
      deduplicated.push(track);
      console.log(`✅ Added: "${track.name}" by ${track.artists[0].name}`);
    } else {
      const existing = seen.get(key);
      console.log(`🔄 DUPLICATE DETECTED:`);
      console.log(`   Existing: "${existing.name}" by ${existing.artists[0].name}`);
      console.log(`   Duplicate: "${track.name}" by ${track.artists[0].name}`);
      console.log(`   Skipping duplicate...`);
    }
  }
  
  console.log(`📊 Deduplication result: ${tracks.length} → ${deduplicated.length} tracks`);
  console.log(`🔄 Removed ${tracks.length - deduplicated.length} duplicates\n`);
  
  return deduplicated;
}

// Enhanced song filtering based on user intent
function filterSongsByIntent(track, originalRecommendation, userTranscription) {
  const trackName = track.name.toLowerCase();
  const albumName = (track.album?.name || '').toLowerCase();
  const userIntent = userTranscription.toLowerCase();
  
  console.log(`🎯 INTENT FILTERING: "${track.name}" by ${track.artists[0].name}`);
  console.log(`   Original request: "${originalRecommendation.song}"`);
  console.log(`   User context: "${userTranscription}"`);
  
  // Define inappropriate content for party/drinking context
  const partyContext = userIntent.includes('party') || userIntent.includes('drink') || userIntent.includes('club') || userIntent.includes('dance');
  
  if (partyContext) {
    // Filter out inappropriate content for party context
    const inappropriateKeywords = [
      'lullaby', 'baby', 'sleep', 'children', 'kids', 'bedtime', 'nursery',
      'infant', 'toddler', 'peaceful', 'calm', 'meditation', 'relaxing'
    ];
    
    const hasInappropriateContent = inappropriateKeywords.some(keyword => 
      trackName.includes(keyword) || albumName.includes(keyword)
    );
    
    if (hasInappropriateContent) {
      console.log(`   ❌ FILTERED OUT: Inappropriate for party context (contains baby/lullaby content)`);
      return false;
    }
  }
  
  // Add more intent-based filtering here as needed
  console.log(`   ✅ PASSED: Appropriate for user context`);
  return true;
}

async function findBestMatch(searchResults, recommendation, userTranscription = '') {
  const searchSong = recommendation.song.toLowerCase();
  const searchArtist = recommendation.artist.toLowerCase();
  
  console.log(`🔍 Looking for best match among ${searchResults.length} results`);
  console.log(`🎯 Target: "${recommendation.song}" by "${recommendation.artist}"`);
  
  // Filter results by intent first
  const intentFilteredResults = searchResults.filter(track => 
    filterSongsByIntent(track, recommendation, userTranscription)
  );
  
  console.log(`🎯 After intent filtering: ${intentFilteredResults.length}/${searchResults.length} tracks remain`);
  
  if (intentFilteredResults.length === 0) {
    console.log(`❌ All tracks filtered out by intent filtering`);
    return null;
  }
  
  // PHASE 1: Look for exact or very close song matches
  for (const track of intentFilteredResults) {
    const trackName = track.name.toLowerCase();
    const artistName = track.artists[0].name.toLowerCase();
    
    // Clean names for comparison
    const cleanSearchArtist = searchArtist.replace(/\s*(ft\.?|feat\.?|featuring|&|and)\s*.*/i, '').trim();
    const cleanTrackName = trackName.replace(/\s*\([^)]*\)\s*/g, '').trim();
    const cleanSearchSong = searchSong.replace(/\s*\([^)]*\)\s*/g, '').trim();
    
    const artistWords = cleanSearchArtist.split(' ').filter(word => word.length > 1);
    const songWords = cleanSearchSong.split(' ').filter(word => word.length > 2);
    
    const foundArtistWords = artistWords.filter(word => artistName.includes(word));
    const artistMatchScore = artistWords.length > 0 ? foundArtistWords.length / artistWords.length : 0;
    
    const foundSongWords = songWords.filter(word => cleanTrackName.includes(word));
    const songMatchScore = songWords.length > 0 ? foundSongWords.length / songWords.length : 0;
    
    // High-confidence matches
    const isExcellentMatch = artistMatchScore >= 0.8 && songMatchScore >= 0.5;
    const isGoodMatch = artistMatchScore >= 0.6 && songMatchScore >= 0.3;
    
    if (isExcellentMatch || isGoodMatch) {
      console.log(`    ✅ ${isExcellentMatch ? 'EXCELLENT' : 'GOOD'} MATCH! "${track.name}" by ${track.artists[0].name}`);
      return track;
    }
  }
  
  // PHASE 2: Find most popular appropriate song by the correct artist
  console.log(`🔄 No exact song matches. Looking for MOST POPULAR appropriate song by "${recommendation.artist}"`);
  
  const artistMatches = [];
  
  for (const track of intentFilteredResults) {
    const artistName = track.artists[0].name.toLowerCase();
    const cleanSearchArtist = searchArtist.replace(/\s*(ft\.?|feat\.?|featuring|&|and)\s*.*/i, '').trim();
    
    const artistWords = cleanSearchArtist.split(' ').filter(word => word.length > 1);
    const foundArtistWords = artistWords.filter(word => artistName.includes(word));
    const artistMatchScore = artistWords.length > 0 ? foundArtistWords.length / artistWords.length : 0;
    
    if (artistMatchScore >= 0.7) {
      artistMatches.push({
        track,
        artistMatchScore,
        popularity: track.popularity || 0
      });
    }
  }
  
  if (artistMatches.length > 0) {
    // Sort by popularity (highest first), then by artist match score
    artistMatches.sort((a, b) => {
      if (b.popularity !== a.popularity) {
        return b.popularity - a.popularity;
      }
      return b.artistMatchScore - a.artistMatchScore;
    });
    
    const mostPopular = artistMatches[0];
    console.log(`    🏆 MOST POPULAR APPROPRIATE: "${mostPopular.track.name}" by "${mostPopular.track.artists[0].name}"`);
    console.log(`       📈 Popularity: ${mostPopular.popularity}, Artist match: ${mostPopular.artistMatchScore.toFixed(2)}`);
    console.log(`    📝 Note: Using most popular appropriate song by this artist`);
    
    return mostPopular.track;
  }
  
  console.log(`  ❌ No suitable artist matches found`);
  return null;
}


async function searchSingleTrack(recommendation, accessToken, userTranscription = '') {
  console.log(`\n🔍 SPOTIFY SEARCH DEBUG [${new Date().toLocaleTimeString()}]`);
  console.log(`🎵 Searching for: "${recommendation.song}" by "${recommendation.artist}"`);
  console.log(`🎯 User context: "${userTranscription}"`);
  
  try {
    // STRATEGY 1: Combined artist + song search
    const combinedQuery = `${recommendation.artist} ${recommendation.song}`;
    console.log(`📤 Combined search: "${combinedQuery}"`);
    
    const combinedResults = await searchSpotifyTracks(combinedQuery, accessToken, 10);
    console.log(`📥 Combined search returned ${combinedResults.length} results`);
    
    if (combinedResults.length > 0) {
      const combinedMatch = await findBestMatch(combinedResults, recommendation, userTranscription);
      if (combinedMatch) {
        console.log(`✅ FOUND with combined search: "${combinedMatch.name}" by ${combinedMatch.artists[0].name}`);
        return {
          ...combinedMatch,
          recommendation: recommendation,
          searchSuccess: true,
          searchMethod: 'combined'
        };
      }
    }
    
    // STRATEGY 2: Artist-first search
    console.log(`📤 Artist-first search: "${recommendation.artist}"`);
    const artistResults = await searchSpotifyTracks(recommendation.artist, accessToken, 50);
    console.log(`📥 Artist search returned ${artistResults.length} results`);
    
    if (artistResults.length > 0) {
      const artistMatch = await findBestMatch(artistResults, recommendation, userTranscription);
      if (artistMatch) {
        console.log(`✅ FOUND with artist search: "${artistMatch.name}" by ${artistMatch.artists[0].name}`);
        return {
          ...artistMatch,
          recommendation: recommendation,
          searchSuccess: true,
          searchMethod: 'artist-first'
        };
      }
    }
    
    console.log(`❌ NO APPROPRIATE MATCHES FOUND for "${recommendation.song}" by "${recommendation.artist}"`);
    return {
      recommendation: recommendation,
      searchSuccess: false,
      error: 'No appropriate matches found'
    };
    
  } catch (error) {
    console.error(`❌ Error finding track for "${recommendation.song}" by "${recommendation.artist}":`, error.message);
    return {
      recommendation: recommendation,
      searchSuccess: false,
      error: error.message
    };
  }
}

// Find tracks on Spotify based on AI recommendations
async function findSpotifyTracks(songRecommendations, accessToken, userTranscription = '') {
  console.log(`🔍 Starting parallel Spotify search for ${songRecommendations.length} songs...`);
  console.log(`🎯 User context: "${userTranscription}"`);
  const startTime = Date.now();
  
  // Create promise for each track search - pass userTranscription
  const searchPromises = songRecommendations.map(recommendation => 
    searchSingleTrack(recommendation, accessToken, userTranscription)
  );
  
  // Execute all searches in parallel with graceful error handling
  const results = await Promise.allSettled(searchPromises);
  
  // Process results and extract successful tracks
  const foundTracks = [];
  const stats = {
    successful: 0,
    failed: 0,
    exactMatches: 0,
    fallbackMatches: 0
  };
  
  results.forEach((result, index) => {
    if (result.status === 'fulfilled' && result.value.searchSuccess) {
      foundTracks.push(result.value);
      stats.successful++;
      
      if (result.value.searchMethod === 'exact') {
        stats.exactMatches++;
      } else {
        stats.fallbackMatches++;
      }
    } else {
      stats.failed++;
      const recommendation = songRecommendations[index];
      console.warn(`❌ Failed to find: "${recommendation.song}" by "${recommendation.artist}"`);
    }
  });
  
  const endTime = Date.now();
  const duration = endTime - startTime;
  
  console.log(`✅ Parallel Spotify search completed in ${duration}ms`);
  console.log(`📊 Raw results: ${stats.successful}/${songRecommendations.length} found`);
  
  // CRITICAL: Apply deduplication here
  const deduplicatedTracks = deduplicateTracks(foundTracks);
  
  console.log(`📊 Final results after deduplication: ${deduplicatedTracks.length} unique tracks`);
  console.log(`   • Exact matches: ${stats.exactMatches}`);
  console.log(`   • Fallback matches: ${stats.fallbackMatches}`);
  console.log(`   • Failed: ${stats.failed}`);
  console.log(`   • Duplicates removed: ${foundTracks.length - deduplicatedTracks.length}`);
  
  return deduplicatedTracks;
}

// ENHANCED: Rate-limited parallel search (optional - use if hitting rate limits)
async function findSpotifyTracksWithRateLimit(songRecommendations, accessToken, concurrency = 5) {
  console.log(`🔍 Starting rate-limited parallel search (concurrency: ${concurrency})...`);
  const startTime = Date.now();
  
  const foundTracks = [];
  const chunks = [];
  
  // Split recommendations into chunks for controlled concurrency
  for (let i = 0; i < songRecommendations.length; i += concurrency) {
    chunks.push(songRecommendations.slice(i, i + concurrency));
  }
  
  // Process each chunk in parallel, chunks sequentially
  for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
    const chunk = chunks[chunkIndex];
    console.log(`Processing chunk ${chunkIndex + 1}/${chunks.length} (${chunk.length} tracks)`);
    
    const chunkPromises = chunk.map(recommendation => 
      searchSingleTrack(recommendation, accessToken)
    );
    
    const chunkResults = await Promise.allSettled(chunkPromises);
    
    // Add successful results
    chunkResults.forEach(result => {
      if (result.status === 'fulfilled' && result.value.searchSuccess) {
        foundTracks.push(result.value);
      }
    });
    
    // Small delay between chunks if needed (only for rate limiting)
    if (chunkIndex < chunks.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  const endTime = Date.now();
  console.log(`✅ Rate-limited search completed in ${endTime - startTime}ms`);
  console.log(`📊 Found ${foundTracks.length}/${songRecommendations.length} tracks`);
  
  return foundTracks;
}

// BONUS: Token caching for additional performance
let cachedSpotifyToken = null;
let tokenExpiryTime = null;

async function getCachedSpotifyAccessToken() {
  const now = Date.now();
  
  // Return cached token if still valid (with 5-minute buffer)
  if (cachedSpotifyToken && tokenExpiryTime && now < tokenExpiryTime - 300000) {
    console.log('✅ Using cached Spotify token');
    return cachedSpotifyToken;
  }
  
  console.log('🔄 Fetching new Spotify token');
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
    
    cachedSpotifyToken = response.data.access_token;
    // Spotify tokens expire in 3600 seconds (1 hour)
    tokenExpiryTime = now + (response.data.expires_in * 1000);
    
    console.log('✅ New Spotify token cached');
    return cachedSpotifyToken;
    
  } catch (error) {
    console.error('Error getting Spotify token:', error);
    throw new Error('Failed to authenticate with Spotify');
  }
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

  
      fs.unlinkSync(audioPath);


      console.log('Generating song recommendations...');
      const initialRecommendations = await generateSongRecommendations(transcriptionText);
      console.log(`Generated ${initialRecommendations.length} song recommendations`);

      console.log('Validating cultural authenticity...');
    const validatedRecommendations = await validateCulturalRecommendations(transcriptionText, initialRecommendations);
    console.log(`Validated ${validatedRecommendations.length} culturally authentic recommendations`);

  
      console.log('Getting Spotify access token...');
      const spotifyToken = await getCachedSpotifyAccessToken();

 
      console.log('Searching for tracks on Spotify...');
      const spotifyTracks = await findSpotifyTracks(validatedRecommendations, spotifyToken, transcriptionText);
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
      const enhancedTracks = await enhanceTracksWithYouTube(spotifyTracks, 3);

      const spotifyPreviews = enhancedTracks.filter(t => t.preview_url).length;
      const youtubePreviews = enhancedTracks.filter(t => t.youtube_preview).length;
      console.log(`Preview availability: ${spotifyPreviews} Spotify, ${youtubePreviews} YouTube`);

      // FIXED: Prepare response with enhanced tracks
      const response = {
        transcription: transcriptionText,
        aiRecommendations: validatedRecommendations,
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
          totalRecommended: validatedRecommendations.length,
          foundOnSpotify: enhancedTracks.length,
          spotifyPreviews: spotifyPreviews,
          youtubePreviews: youtubePreviews,
          totalPreviews: spotifyPreviews + youtubePreviews,
          culturalValidation: true, 
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