// Vercel entry point: every request is rewritten to this function (see vercel.json)
// and handled by the normal Express app.
//
// On the first request of each cold start the database tables are created if they
// are missing (idempotent, one round trip). Set AUTO_MIGRATE=false to turn this off.
const app = require('../app');
const { ensureDatabase } = require('../database/ensure');

let ready;
function ensureOnce() {
  if (!ready) ready = process.env.AUTO_MIGRATE === 'false' ? Promise.resolve(true) : ensureDatabase();
  return ready;
}

module.exports = async (req, res) => {
  await ensureOnce();
  return app(req, res);
};
