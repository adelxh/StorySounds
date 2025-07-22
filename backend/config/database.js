const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'storysounds_db',
  password: process.env.DB_PASSWORD || '',
  port: process.env.DB_PORT || 5432,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// Test the connection
pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Error acquiring client:', err.stack);
  } else {
    console.log('✅ Connected to PostgreSQL database');
    release();
  }
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('🔄 Closing database connections...');
  pool.end().then(() => {
    console.log('✅ Database connections closed');
    process.exit(0);
  });
});

module.exports = pool;