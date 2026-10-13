import { useEffect, useRef, useState } from "react";
import { Routes, Route, Navigate, NavLink, Outlet, useLocation, useNavigate, Link } from "react-router-dom";
import {
  Activity, ArrowRight, Bell, ChevronDown, CircleUserRound, Github, History as HistoryIcon,
  KeyRound, LayoutDashboard, Lock, LogOut, Menu, PackageCheck, Search, Settings, Shield, ShieldCheck,
  Sparkles, X, Zap
} from "lucide-react";
import { api, auth, githubLoginUrl } from "./api";
import { DataProvider, useData } from "./DataContext";
import { initials, isActive, timeAgo, verdict } from "./util";
import {
  ConnectRepository, Dashboard, HistoryPage, Projects, ScanResults, SecurityGate, SecurityScore, SettingsPage
} from "./pages";

function App() {
  return (
    <Routes>
      <Route path="/login" element={<AuthPage />} />
      <Route path="/register" element={<AuthPage register />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route element={<ProtectedLayout />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/projects" element={<Projects />} />
        <Route path="/connect" element={<ConnectRepository />} />
        <Route path="/scan-results" element={<ScanResults />} />
        <Route path="/security-score" element={<SecurityScore />} />
        <Route path="/security-gate" element={<SecurityGate />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        {/* old bookmarks */}
        <Route path="/profile" element={<Navigate to="/settings" replace />} />
        <Route path="/account-settings" element={<Navigate to="/settings" replace />} />
        <Route path="/security-preferences" element={<Navigate to="/security-gate" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

// Redirects to /login when there is no session, and wraps every page in the
// data provider + app shell.
function ProtectedLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [signedIn, setSignedIn] = useState(auth.isLoggedIn);

  useEffect(() => {
    const out = () => setSignedIn(false);
    window.addEventListener("techshield-signed-out", out);
    return () => window.removeEventListener("techshield-signed-out", out);
  }, []);
  useEffect(() => { if (!signedIn || !auth.isLoggedIn) navigate("/login", { replace: true }); }, [signedIn, navigate, location.pathname]);

  if (!auth.isLoggedIn) return null;
  return <DataProvider><Shell /></DataProvider>;
}

function Shell() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();
  const { projects } = useData();
  const [query, setQuery] = useState("");

  const searchItems = [
    ...(projects || []).map((p) => ({ type: "Project", title: p.name, detail: `${p.fullName} · ${p.latestScan?.score ?? "–"}/100`, to: `/scan-results?project=${p.id}` })),
    { type: "Page", title: "Dashboard", detail: "Project overview and latest security status", to: "/dashboard" },
    { type: "Page", title: "Projects", detail: "Scanned repositories", to: "/projects" },
    { type: "Page", title: "Scan Results", detail: "Security findings", to: "/scan-results" },
    { type: "Page", title: "Security Score", detail: "Score and findings summary", to: "/security-score" },
    { type: "Page", title: "Security Gate", detail: "Gate rules and deployment status", to: "/security-gate" },
    { type: "Page", title: "History", detail: "Scan and deployment history", to: "/history" },
    { type: "Page", title: "Settings", detail: "Account and GitHub connection", to: "/settings" },
    { type: "Page", title: "Connect GitHub", detail: "Connect and scan a repository", to: "/connect" }
  ];
  const q = query.trim().toLowerCase();
  const results = q ? searchItems.filter((i) => `${i.title} ${i.detail} ${i.type}`.toLowerCase().includes(q)) : [];

  return (
    <div className="app-shell">
      <Sidebar mobileOpen={mobileOpen} closeMobile={() => setMobileOpen(false)} />
      <div className="main-area">
        <header className="topbar">
          <button className="icon-button mobile-menu" onClick={() => setMobileOpen(true)} aria-label="Open menu"><Menu size={21} /></button>
          <div className="topbar-search-wrap">
            <div className="topbar-search">
              <Search size={17} />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search projects and pages..." />
              {query && <button className="search-clear" onClick={() => setQuery("")}><X size={14} /></button>}
            </div>
            {query && (
              <div className="search-results">
                {results.length ? results.map((item) => (
                  <button key={`${item.type}-${item.title}-${item.to}`} onClick={() => { setQuery(""); navigate(item.to); }}>
                    <div className="search-result-icon">{item.type === "Project" ? <Github size={16} /> : <Search size={16} />}</div>
                    <div><strong>{item.title}</strong><span>{item.detail}</span></div>
                    <ArrowRight size={14} />
                  </button>
                )) : <div className="search-empty">Nothing matches “{query}”.</div>}
              </div>
            )}
          </div>
          <TopbarActions />
        </header>
        <main className="page-content"><Outlet /></main>
      </div>
    </div>
  );
}


function signOut(navigate) {
  auth.token = null;
  localStorage.removeItem("selectedProject");
  navigate("/login", { replace: true });
}

function TopbarActions() {
  const navigate = useNavigate();
  const { user, projects } = useData();
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const wrapperRef = useRef(null);

  useEffect(() => {
    const handleOutside = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) { setNotificationOpen(false); setProfileOpen(false); }
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  // Notifications are real: one entry per project, based on its latest scan.
  const notifications = (projects || []).filter((p) => p.latestScan).map((p) => {
    const s = p.latestScan;
    const when = s.completedAt || s.startedAt;
    const v = verdict(p);
    let title = "Security scan completed";
    let text = `${p.name} scored ${s.score}/100.`;
    let tone = "success";
    if (isActive(s)) { title = "Scan in progress"; text = `${p.name} is being scanned on GitHub Actions.`; tone = "info"; }
    else if (s.status === "failed") { title = "Scan failed"; text = `${p.name}: ${s.error || "the scan could not finish."}`; tone = "warning"; }
    else if (v === "Fail") { title = "Security gate blocked"; text = `${p.name} scored ${s.score}/100 and deployment was blocked.`; tone = "warning"; }
    else if (s.deployment?.status === "deployed") { title = "Deployment completed"; text = `${p.name} is live on Vercel.`; }
    return { id: p.id, title, text, tone, time: timeAgo(when), when, to: `/security-gate?project=${p.id}` };
  }).sort((a, b) => new Date(b.when) - new Date(a.when)).slice(0, 6);

  const name = user?.name || "…";
  return (
    <div className="topbar-actions" ref={wrapperRef}>
      <div className="topbar-popover-wrap">
        <button className="icon-button notification" aria-label="Notifications" aria-expanded={notificationOpen} onClick={() => { setNotificationOpen((o) => !o); setProfileOpen(false); }}>
          <Bell size={19} />{notifications.some((n) => n.tone !== "success") && <span />}
        </button>
        {notificationOpen && (
          <div className="topbar-popover notification-popover">
            <div className="popover-header"><div><strong>Notifications</strong><span>Latest scan of each project</span></div></div>
            <div className="notification-list">
              {notifications.length ? notifications.map((item) => (
                <button className="notification-item" key={item.id} onClick={() => { setNotificationOpen(false); navigate(item.to); }}>
                  <span className={`notification-dot ${item.tone}`}><Bell size={13} /></span>
                  <span className="notification-copy"><strong>{item.title}</strong><span>{item.text}</span><small>{item.time}</small></span>
                </button>
              )) : <div className="search-empty">No scans yet.</div>}
            </div>
            <button className="popover-footer" onClick={() => { setNotificationOpen(false); navigate("/history"); }}>View all activity <ArrowRight size={14} /></button>
          </div>
        )}
      </div>

      <div className="topbar-popover-wrap">
        <button className="profile-chip profile-trigger" onClick={() => { setProfileOpen((o) => !o); setNotificationOpen(false); }} aria-expanded={profileOpen}>
          <div className="avatar">{initials(name)}</div><span>{name}</span><ChevronDown size={15} className={profileOpen ? "chevron-up" : ""} />
        </button>
        {profileOpen && (
          <div className="topbar-popover profile-popover">
            <div className="profile-summary">
              <div className="avatar large">{initials(name)}</div>
              <div><strong>{name}</strong><span>{user?.email}</span><small>{user?.github_login ? `GitHub · ${user.github_login}` : "GitHub not connected"}</small></div>
            </div>
            <div className="profile-menu">
              <Link to="/settings" onClick={() => setProfileOpen(false)}><CircleUserRound size={16} /> Profile & settings</Link>
              <Link to="/connect" onClick={() => setProfileOpen(false)}><Github size={16} /> GitHub connection</Link>
            </div>
            <div className="profile-divider" />
            <button className="profile-logout" onClick={() => signOut(navigate)}><LogOut size={16} /> Sign out</button>
          </div>
        )}
      </div>
    </div>
  );
}

function Sidebar({ mobileOpen, closeMobile }) {
  const navigate = useNavigate();
  const links = [
    ["/dashboard", "Dashboard", LayoutDashboard],
    ["/projects", "Projects", PackageCheck],
    ["/scan-results", "Scan Results", Shield],
    ["/security-score", "Security Score", Activity],
    ["/security-gate", "Security Gate", ShieldCheck],
    ["/history", "History", HistoryIcon]
  ];
  return (
    <>
      {mobileOpen && <div className="mobile-overlay" onClick={closeMobile} />}
      <aside className={`sidebar ${mobileOpen ? "mobile-visible" : ""}`}>
        <div className="brand">
          <div className="brand-icon"><ShieldCheck size={23} /></div>
          <div><strong>TechShield</strong><span>DevSecOps Platform</span></div>
          <button className="icon-button mobile-close" onClick={closeMobile}><X size={19} /></button>
        </div>
        <nav className="nav-list">
          {links.map(([to, label, Icon]) => (
            <NavLink key={to} to={to} onClick={closeMobile} className={({ isActive: a }) => `nav-item ${a ? "active" : ""}`}><Icon size={18} /><span>{label}</span></NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <NavLink to="/settings" className="nav-item" onClick={closeMobile}><Settings size={18} /><span>Settings</span></NavLink>
          <button className="nav-item" style={{ background: "transparent", border: 0, textAlign: "left", width: "100%" }} onClick={() => signOut(navigate)}><LogOut size={18} /><span>Logout</span></button>
        </div>
      </aside>
    </>
  );
}

// Shown on the sign-in page: the four scanners and the pipeline described in docs/ABSTRACT.md.
const AUTH_SCANNERS = [
  ["Semgrep", "Insecure source code", Shield],
  ["Dependency-Check", "Vulnerable libraries", PackageCheck],
  ["Gitleaks", "Exposed secrets", KeyRound],
  ["Trivy", "Container risks", Zap]
];
const AUTH_FLOW = ["Connect GitHub", "Scan", "Score", "Security gate", "Deploy to Vercel"];

function AuthPage({ register = false }) {
  const navigate = useNavigate();
  const [mode, setMode] = useState(register ? "register" : "login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(() => {
    const q = new URLSearchParams(window.location.search);
    return q.get("github") === "error" ? (q.get("message") || "GitHub sign-in failed.") : "";
  });
  const [busy, setBusy] = useState(false);
  const [githubAvailable, setGithubAvailable] = useState(false);

  useEffect(() => {
    // Coming back from "Sign in with GitHub": the session token arrives in the URL fragment.
    const match = window.location.hash.match(/github_token=([^&]+)/);
    if (match) {
      auth.token = decodeURIComponent(match[1]);
      window.history.replaceState(null, "", window.location.pathname);
    }
    if (auth.isLoggedIn) navigate("/dashboard", { replace: true });
  }, [navigate]);

  useEffect(() => { api.authProviders().then((p) => setGithubAvailable(Boolean(p.github))).catch(() => {}); }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (mode === "register") await api.register(name, email, password);
      const result = await api.login(email, password);
      auth.token = result.token;
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const switchMode = (next) => { setMode(next); setError(""); navigate(next === "login" ? "/login" : "/register"); };

  return (
    <div className="auth-page">
      <div className="auth-brand-panel">
        <div className="brand auth-brand"><div className="brand-icon"><ShieldCheck size={26} /></div><div><strong>TechShield</strong><span>DevSecOps Platform</span></div></div>
        <div className="auth-copy">
          <div className="eyebrow"><Sparkles size={15} /> Automated security gate</div>
          <h1>Secure code.<br />Safe deployments.</h1>
          <p>Connect a GitHub repository, scan it with four security tools, get a security score from 0 to 100 and deploy to Vercel only when the security gate passes.</p>
          <div className="auth-scanners">
            {AUTH_SCANNERS.map(([name, text, Icon]) => (
              <div key={name} className="auth-scanner"><Icon size={17} /><div><strong>{name}</strong><span>{text}</span></div></div>
            ))}
          </div>
          <ol className="auth-flow">
            {AUTH_FLOW.map((step) => <li key={step}>{step}</li>)}
          </ol>
          <p className="auth-rule"><ShieldCheck size={15} /> Default gate: no Critical findings, no exposed secrets, at most 5 High findings and a score of 70 or more.</p>
        </div>
      </div>
      <div className="auth-card-wrap">
        <form className="auth-card" onSubmit={submit}>
          <div className="auth-card-icon"><Lock size={22} /></div>
          <h2>{mode === "login" ? "Welcome Back" : "Create Account"}</h2>
          <p>{mode === "login" ? "Sign in to scan, score and deploy securely" : "Register to connect GitHub and start scanning"}</p>
          <div className="auth-tabs">
            <button type="button" className={mode === "login" ? "selected" : ""} onClick={() => switchMode("login")}>Login</button>
            <button type="button" className={mode === "register" ? "selected" : ""} onClick={() => switchMode("register")}>Register</button>
          </div>
          {error && <div className="form-error" role="alert">{error}</div>}
          {githubAvailable && (
            <>
              <a className="secondary-button wide" href={githubLoginUrl} style={{ textDecoration: "none", marginBottom: 14, width: "100%" }}><Github size={17} /> Continue with GitHub</a>
              <p className="muted" style={{ textAlign: "center", fontSize: 10, margin: "0 0 14px" }}>or use your email</p>
            </>
          )}
          {mode === "register" && (
            <label className="field"><span>Full name</span><div className="input-wrap"><CircleUserRound size={17} /><input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" autoComplete="name" /></div></label>
          )}
          <label className="field"><span>Email address</span><div className="input-wrap"><CircleUserRound size={17} /><input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" /></div></label>
          <label className="field"><span>Password</span><div className="input-wrap"><KeyRound size={17} /><input type="password" required minLength={mode === "register" ? 8 : undefined} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={mode === "register" ? "At least 8 characters" : "••••••••"} autoComplete={mode === "login" ? "current-password" : "new-password"} /></div></label>
          {mode === "login" && <div style={{ textAlign: "right", margin: "-6px 0 14px" }}><Link to="/forgot-password" className="text-button">Forgot password?</Link></div>}
          <button className="primary-button wide" type="submit" disabled={busy}>{busy ? "Please wait…" : mode === "login" ? "Login" : "Create Account"} <ArrowRight size={17} /></button>
          <p className="auth-footer">{mode === "login" ? "Don't have an account? " : "Already have an account? "}<button type="button" className="text-button" onClick={() => switchMode(mode === "login" ? "register" : "login")}>{mode === "login" ? "Register" : "Login"}</button></p>
          <p className="auth-note"><Lock size={13} /> Your GitHub token is stored encrypted and is only used to run your scans.</p>
        </form>
      </div>
    </div>
  );
}

// Shared frame for the small "forgot / reset password" pages.
function PasswordCard({ title, subtitle, children }) {
  return (
    <div className="auth-page" style={{ gridTemplateColumns: "1fr" }}>
      <div className="auth-card-wrap" style={{ minHeight: "100vh" }}>
        <div className="auth-card">
          <div className="auth-card-icon"><KeyRound size={22} /></div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
          {children}
        </div>
      </div>
    </div>
  );
}

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(""); setBusy(true);
    try { await api.forgotPassword(email.trim()); setSent(true); } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  return (
    <PasswordCard title="Forgot password?" subtitle="Enter your account email and we will send you a link to choose a new password.">
      {sent ? (
        <>
          <div className="form-error" style={{ background: "#effaf3", color: "#1f7a46" }} role="status">If {email.trim()} is registered, a reset link has been sent. It stays valid for 30 minutes. Check your spam folder too.</div>
          <Link to="/login" className="primary-button wide" style={{ textDecoration: "none", justifyContent: "center" }}>Back to login <ArrowRight size={17} /></Link>
        </>
      ) : (
        <form onSubmit={submit}>
          {error && <div className="form-error" role="alert">{error}</div>}
          <label className="field"><span>Email address</span><div className="input-wrap"><CircleUserRound size={17} /><input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" /></div></label>
          <button className="primary-button wide" type="submit" disabled={busy}>{busy ? "Please wait…" : "Send reset link"} <ArrowRight size={17} /></button>
          <p className="auth-footer"><Link to="/login" className="text-button">Back to login</Link></p>
        </form>
      )}
    </PasswordCard>
  );
}

function ResetPasswordPage() {
  const navigate = useNavigate();
  const token = new URLSearchParams(window.location.search).get("token") || "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (password !== confirm) { setError("The two passwords do not match."); return; }
    setBusy(true);
    try {
      await api.resetPassword(token, password);
      setDone(true);
      setTimeout(() => navigate("/login", { replace: true }), 2000);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  if (!token) {
    return (
      <PasswordCard title="Reset link missing" subtitle="Open the link from your email, or request a new one.">
        <Link to="/forgot-password" className="primary-button wide" style={{ textDecoration: "none", justifyContent: "center" }}>Request a new link <ArrowRight size={17} /></Link>
      </PasswordCard>
    );
  }

  return (
    <PasswordCard title="Choose a new password" subtitle="Use at least 8 characters.">
      {done ? (
        <div className="form-error" style={{ background: "#effaf3", color: "#1f7a46" }} role="status">Password updated. Taking you to the login page…</div>
      ) : (
        <form onSubmit={submit}>
          {error && <div className="form-error" role="alert">{error}</div>}
          <label className="field"><span>New password</span><div className="input-wrap"><KeyRound size={17} /><input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" autoComplete="new-password" /></div></label>
          <label className="field"><span>Confirm new password</span><div className="input-wrap"><KeyRound size={17} /><input type="password" required minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Type it again" autoComplete="new-password" /></div></label>
          <button className="primary-button wide" type="submit" disabled={busy}>{busy ? "Saving…" : "Update password"} <ArrowRight size={17} /></button>
          <p className="auth-footer"><Link to="/login" className="text-button">Back to login</Link></p>
        </form>
      )}
    </PasswordCard>
  );
}

export default App;
