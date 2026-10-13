// Turns raw PostgreSQL / network errors into messages a person can act on.
// Returns null for errors that are not database-connection problems.
function dbErrorCode(err) {
  if (!err) return undefined;
  if (err.code) return err.code;
  // Node tries IPv4 and IPv6 for "localhost" and wraps both failures.
  if (Array.isArray(err.errors) && err.errors[0]) return err.errors[0].code;
  return undefined;
}

function describeDbError(err) {
  const code = dbErrorCode(err);
  const host = process.env.DB_HOST || 'localhost';
  const port = process.env.DB_PORT || '5432';
  const name = process.env.DB_NAME || 'devsecops';

  switch (code) {
    case '28P01':
    case '28000':
      return 'Database login failed: DB_USER / DB_PASSWORD in backend/.env do not match your PostgreSQL account. Fix .env, save it and restart the backend.';
    case '3D000':
      return `Database "${name}" does not exist. Create it (or restart the backend, which creates it automatically in development).`;
    case '42P01':
      return 'Database tables are missing. Run "npm run migrate" in the backend folder (or restart the backend, which does it automatically in development).';
    case 'ECONNREFUSED':
    case 'ENOTFOUND':
    case 'ETIMEDOUT':
      return `Cannot reach PostgreSQL at ${host}:${port}. Make sure the PostgreSQL service is running.`;
    default:
      return null;
  }
}

module.exports = { describeDbError, dbErrorCode };
