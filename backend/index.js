const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const transcribeRoute = require('./routes/transcribe');

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/transcribe', transcribeRoute);
app.use('/api/spotify', require('./routes/spotify-auth'));

app.use('/api/feedback', require('./routes/feedback'));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));

