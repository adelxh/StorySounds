console.log('=== Starting Environment Debug ===');
console.log('Current working directory:', process.cwd());
console.log('__dirname:', __dirname);

// Try to load dotenv
const dotenv = require('dotenv');
const path = require('path');

console.log('\n=== Testing dotenv loading ===');
const result = dotenv.config();
console.log('Dotenv result:', result);

console.log('\n=== Checking environment variables ===');
console.log('OPENAI_API_KEY exists:', !!process.env.OPENAI_API_KEY);
console.log('OPENAI_API_KEY length:', process.env.OPENAI_API_KEY?.length || 0);

if (process.env.OPENAI_API_KEY) {
  console.log('OPENAI_API_KEY first 10 chars:', process.env.OPENAI_API_KEY.substring(0, 10));
}

console.log('SPOTIFY_CLIENT_ID exists:', !!process.env.SPOTIFY_CLIENT_ID);
console.log('SPOTIFY_CLIENT_SECRET exists:', !!process.env.SPOTIFY_CLIENT_SECRET);

console.log('\n=== All environment variables containing "API" ===');
Object.keys(process.env).filter(key => key.includes('API')).forEach(key => {
  console.log(`${key}: ${process.env[key]?.substring(0, 15)}...`);
});