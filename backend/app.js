require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/authRoutes');
const githubRoutes = require('./routes/githubRoutes');
const projectRoutes = require('./routes/projectRoutes');
const scanRoutes = require('./routes/scanRoutes');
const vulnerabilityRoutes = require('./routes/vulnerabilityRoutes');
const deploymentRoutes = require('./routes/deploymentRoutes');
const errorHandler = require('./middleware/errorHandler');
const { parseOrigins, buildOriginMatcher } = require('./utils/origins');

const app = express();

// Vercel / most hosts sit behind a proxy; needed for correct client IPs.
app.set('trust proxy', 1);

app.use(helmet());

// FRONTEND_ORIGIN may hold several comma-separated origins (wildcards such as
// https://*.vercel.app are allowed). Empty = allow every origin.
const allowedOrigins = parseOrigins(process.env.FRONTEND_ORIGIN);
const isAllowedOrigin = buildOriginMatcher(allowedOrigins);
app.use(
  cors({
    origin(origin, cb) {
      // No Origin header = server-to-server call (GitHub Actions, curl).
      if (!origin || allowedOrigins.length === 0 || isAllowedOrigin(origin)) return cb(null, true);
      const err = new Error('Origin not allowed by CORS');
      err.status = 403;
      return cb(err);
    },
  })
);

// Scan results can hold a few thousand findings.
app.use(express.json({ limit: '5mb' }));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Slow down password guessing.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.AUTH_RATE_LIMIT || 50),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Try again in a few minutes.' },
});

// Stricter limit for reset e-mails so nobody can use the form to spam an inbox.
const forgotLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: Number(process.env.FORGOT_RATE_LIMIT || 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many reset requests. Try again later.' },
});

app.use('/api/auth/forgot-password', forgotLimiter);
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/github', githubRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/scans', scanRoutes);
app.use('/api/vulnerabilities', vulnerabilityRoutes);
app.use('/api/deployments', deploymentRoutes);

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.use(errorHandler);

module.exports = app;
