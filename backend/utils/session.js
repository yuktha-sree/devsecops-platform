const jwt = require('jsonwebtoken');

// One place that creates the login token, used by email/password login and GitHub login.
function signSession(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '1d' }
  );
}

module.exports = { signSession };
