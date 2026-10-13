const app = require('./app');

const required = ['JWT_SECRET', 'TOKEN_ENC_KEY', 'SCAN_SECRET'];
const missing = required.filter((k) => !process.env[k] || process.env[k].length < 16);
if (missing.length) {
  console.warn(`WARNING: set these in .env (min 16 characters): ${missing.join(', ')}`);
}

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);

  // Local development: create the database/tables automatically.
  // Set AUTO_MIGRATE=false to turn this off (e.g. on a managed production database).
  if (process.env.AUTO_MIGRATE !== 'false' && process.env.NODE_ENV !== 'production') {
    require('./database/ensure').ensureDatabase();
  }
});
