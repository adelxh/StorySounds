// backend/test-auth.js
// Run this with: node test-auth.js

const axios = require('axios');

const API_BASE = 'http://localhost:5000/api';

async function testAuth() {
  try {
    console.log('🧪 Testing Authentication Endpoints...\n');

    // Test 1: Health check
    console.log('1. Testing health check...');
    const health = await axios.get(`${API_BASE}/health`);
    console.log('✅ Health:', health.data.message);

    // Test 2: Sign up
    console.log('\n2. Testing sign up...');
    const signupData = {
      name: 'Test User',
      email: 'test@example.com',
      password: 'password123'
    };
    
    const signup = await axios.post(`${API_BASE}/auth/signup`, signupData);
    console.log('✅ Signup successful:', signup.data.user.name);
    const token = signup.data.token;

    // Test 3: Get profile (protected route)
    console.log('\n3. Testing protected profile route...');
    const profile = await axios.get(`${API_BASE}/auth/profile`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('✅ Profile:', profile.data.user.name, profile.data.user.plan);

    // Test 4: Sign in
    console.log('\n4. Testing sign in...');
    const signin = await axios.post(`${API_BASE}/auth/signin`, {
      email: 'test@example.com',
      password: 'password123'
    });
    console.log('✅ Signin successful:', signin.data.user.name);

    console.log('\n🎉 All tests passed!');

  } catch (error) {
    if (error.response) {
      console.error('❌ Test failed:', error.response.data.error);
    } else {
      console.error('❌ Test error:', error.message);
    }
  }
}

testAuth();