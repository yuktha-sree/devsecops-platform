// PostgreSQL connection pool.
// Works with either DATABASE_URL (Neon / Supabase / Render - recommended for
// Vercel) or the individual DB_* variables (local PostgreSQL).
require('dotenv').config();
const { Pool } = require('pg');
const { sanitizeDatabaseUrl } = require('../utils/dbUrl');

function buildConfig() {
  const onServerless = Boolean(process.env.VERCEL);
  const common = {
    // Serverless functions open many short-lived instances, so keep the pool tiny.
    max: Number(process.env.DB_POOL_MAX || (onServerless ? 2 : 10)),
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 10000,
  };

  if (process.env.DATABASE_URL) {
    const useSsl = process.env.DB_SSL !== 'false';
    return {
      ...common,
      connectionString: sanitizeDatabaseUrl(process.env.DATABASE_URL),
      ssl: useSsl ? { rejectUnauthorized: false } : false,
    };
  }

  return {
    ...common,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  };
}

const pool = new Pool(buildConfig());

// An idle client erroring must not kill the whole API process.
pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client:', err.message);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};
