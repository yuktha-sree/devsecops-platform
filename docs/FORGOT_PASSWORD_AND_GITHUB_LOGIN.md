# Forgot password and "Continue with GitHub"

## Implemented
- **Forgot password**: "Forgot password?" on the login page -> enter email -> reset link by email (valid 30 minutes, works once) -> choose a new password.
  Only a SHA-256 hash of the link token is stored. The reply is the same whether or not the email is registered.
- **Continue with GitHub**: one click signs the user in (an account is created on the first time) and stores their
  GitHub access token encrypted, so they can scan their own repositories immediately. No token to paste.
  Accounts are matched by the permanent GitHub id, then by the verified GitHub email.
- Both use the existing GitHub OAuth app; the callback URL does not change.

## Not part of this change
- Admin role / admin pages (the `role` column exists but nothing uses it).
- Scanning itself still runs in GitHub Actions in your scanner repository (see docs/SETUP.md).

## One-time setup (admin)
1. `npm --prefix backend install nodemailer`
2. GitHub > Settings > Developer settings > OAuth Apps > New OAuth App
   - Homepage URL: `http://localhost:5173`
   - Callback URL: `http://localhost:5000/api/github/oauth/callback`
3. In `backend/.env` set `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`.
4. Optional, real emails: set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`
   (Gmail needs an "App password"). Leave them empty in development: the reset link is then printed in the backend terminal.
5. Restart the backend (`Ctrl + C`, `npm run dev`). The tables are created automatically.

## Deploying later
Create a second OAuth app (or edit this one) with your deployed frontend as Homepage URL and
`<backend-url>/api/github/oauth/callback` as Callback URL. Set `FRONTEND_URL` to your frontend address
and use SMTP (the terminal fallback is disabled when `NODE_ENV=production`).
