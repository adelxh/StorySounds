const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const transcribeRoute = require('./routes/transcribe');
const authRoutes = require('./routes/auth');

dotenv.config();

require('./config/database'); 

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/transcribe', transcribeRoute);
app.use('/api/spotify', require('./routes/spotify-auth'));

app.use('/api/feedback', require('./routes/feedback'));
app.use('/api/auth', authRoutes);

app.get('/api/health', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Server is running',
    timestamp: new Date().toISOString()
  });
});
app.use((err, req, res, next) => {
  console.error('❌ Server error:', err.stack);
  res.status(500).json({
    success: false,
    error: 'Something went wrong!'
  });
});
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found'
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));

