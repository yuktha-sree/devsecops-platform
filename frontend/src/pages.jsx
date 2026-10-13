import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  Activity, ArrowRight, CheckCircle2, ChevronDown, CircleAlert, CircleUserRound, Cloud, Code2, ExternalLink,
  Github, Lock, LogOut, PackageCheck, Play, RefreshCw, Search, Shield, ShieldCheck, ShieldX, Trash2, XCircle
} from "lucide-react";
import { api, auth } from "./api";
import { useData, useSelectedProject } from "./DataContext";
import { SEVERITIES, TABS, deploymentLabel, fmtDate, initials, isActive, verdict } from "./util";

/* ------------------------------------------------------------------ shared */
function PageHeading({ eyebrow, title, description, action }) {
  return (
    <div className="page-heading">
      <div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>
      {action && <div>{action}</div>}
    </div>
  );
}

const StatCard = ({ icon: Icon, label, value, tone = "blue" }) => (
  <div className="stat-card"><div className={`stat-icon ${tone}`}><Icon size={19} /></div><div><span>{label}</span><strong>{value}</strong></div></div>
);
const FindingStat = ({ label, value, icon: Icon, tone = "blue" }) => (
  <div className={`finding-stat ${tone}`}><Icon size={18} /><div><span>{label}</span><strong>{value}</strong></div></div>
);
const SeverityLine = ({ label, value, width }) => (
  <div className="severity-line"><span>{label}</span><div className="progress"><span style={{ width }} /></div><strong>{value}</strong></div>
);
const Rule = ({ children, ok, note }) => (
  <div className="rule">{ok ? <CheckCircle2 size={17} className="green-icon" /> : <XCircle size={17} className="red-icon" />}<span>{children}{note && <small className="muted"> {note}</small>}</span></div>
);
const TimelineItem = ({ title, time, ok = true }) => (
  <div className="timeline-item">{ok ? <CheckCircle2 size={18} className="green-icon" /> : <XCircle size={18} className="red-icon" />}<div><strong>{title}</strong><span>{time}</span></div></div>
);
const StatusBadge = ({ status }) => {
  const cls = String(status).toLowerCase().replace(/[^a-z]+/g, "-");
  const good = ["pass", "success", "deployed"].includes(cls);
  return <span className={`status-badge ${cls}`}>{good ? <CheckCircle2 size={12} /> : <XCircle size={12} />}{status}</span>;
};
const SeverityBadge = ({ severity }) => <span className={`severity-badge ${severity.toLowerCase()}`}><span />{severity}</span>;
const ScorePill = ({ score }) => (score === null || score === undefined
  ? <span className="muted">—</span>
  : <span className={`score-pill ${score >= 70 ? "good" : "bad"}`}>{score}/100</span>);

function Loading({ text = "Loading…" }) {
  return <div className="card empty-workspace"><div className="empty-icon"><RefreshCw size={26} /></div><p>{text}</p></div>;
}
function ErrorNote({ children }) { return children ? <div className="form-error" role="alert">{children}</div> : null; }

function EmptyWorkspace({ onConnect, title = "No scanned projects yet", text = "Connect GitHub first, choose a repository and branch, then run your first security scan." }) {
  return (
    <div className="empty-workspace">
      <div className="empty-icon"><Github size={28} /></div><h3>{title}</h3><p>{text}</p>
      <button className="primary-button" onClick={onConnect}><Github size={17} /> Connect GitHub</button>
    </div>
  );
}

function useRescan() {
  const { refreshProjects } = useData();
  const navigate = useNavigate();
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");
  const rescan = async (project) => {
    setBusyId(project.id); setError("");
    try {
      await api.startScan(project.id, project.branch);
      await refreshProjects();
      navigate(`/scan-results?project=${project.id}`);
    } catch (err) { setError(err.message); } finally { setBusyId(null); }
  };
  return { rescan, busyId, error };
}

function ProjectSelector({ project, projects, to }) {
  const navigate = useNavigate();
  return (
    <div className="project-context card">
      <div><span>Selected repository</span><strong>{project.name}</strong><small>{project.fullName} · {project.latestScan?.branch || project.branch}</small></div>
      <div className="select-wrap compact-select">
        <select value={project.id} onChange={(e) => navigate(`${to}?project=${e.target.value}`)}>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select><ChevronDown size={15} />
      </div>
    </div>
  );
}

// What to show instead of results while a scan is queued/running/failed.
function ScanProgress({ project, onRescan, busy }) {
  const s = project.latestScan;
  if (!s) return null;
  if (isActive(s)) {
    return (
      <section className="card empty-workspace">
        <div className="empty-icon"><RefreshCw size={26} /></div>
        <h3>{s.status === "pending" ? "Scan queued…" : "Scanning on GitHub Actions…"}</h3>
        <p>Semgrep, Dependency-Check, Gitleaks and Trivy are checking {project.fullName}. This page updates by itself; the first run can take several minutes while scanner databases download.</p>
        {s.runUrl && <a className="outline-button" href={s.runUrl} target="_blank" rel="noreferrer"><ExternalLink size={15} /> View the GitHub Actions run</a>}
      </section>
    );
  }
  if (s.status === "failed") {
    return (
      <section className="card empty-workspace">
        <div className="empty-icon"><XCircle size={26} /></div>
        <h3>The scan could not finish</h3>
        <p>{s.error || "The scan workflow failed."}</p>
        <div>
          {s.runUrl && <a className="outline-button" href={s.runUrl} target="_blank" rel="noreferrer"><ExternalLink size={15} /> View the run</a>}{" "}
          <button className="primary-button" disabled={busy} onClick={onRescan}><Activity size={16} /> Try again</button>
        </div>
      </section>
    );
  }
  return null;
}

const finished = (project) => project.latestScan && project.latestScan.status === "completed";

/* --------------------------------------------------------------- dashboard */
export function Dashboard() {
  const navigate = useNavigate();
  const { user, projects, github, error } = useData();
  if (projects === null) return <Loading />;

  const totalScans = projects.reduce((sum, p) => sum + (p.scanCount || 0), 0);
  const deployed = projects.filter((p) => p.latestScan?.deployment?.status === "deployed").length;
  const blocked = projects.filter((p) => p.latestScan?.status === "completed" && p.latestScan.gateStatus === "FAIL").length;
  const latest = projects.find((p) => finished(p));
  const connectLabel = github?.connected ? "Scan Another Repository" : "Connect GitHub";

  return (
    <>
      <PageHeading eyebrow="Overview" title={`Welcome, ${user?.name || ""}!`} description="Only repositories you have connected and scanned appear in your workspace."
        action={<button className="primary-button" onClick={() => navigate("/connect")}><Github size={17} /> {connectLabel}</button>} />
      <ErrorNote>{error}</ErrorNote>
      <div className="stats-grid">
        <StatCard icon={PackageCheck} label="Total Projects" value={String(projects.length)} />
        <StatCard icon={Activity} label="Total Scans" value={String(totalScans)} tone="green" />
        <StatCard icon={CheckCircle2} label="Live Deployments" value={String(deployed)} tone="green" />
        <StatCard icon={XCircle} label="Blocked by Gate" value={String(blocked)} tone="red" />
      </div>
      <section className="card">
        <div className="section-header"><div><h3>Scanned Projects</h3><p>Latest scan of each connected repository.</p></div><Link className="link-button" to="/projects">View All <ArrowRight size={15} /></Link></div>
        {projects.length ? <ProjectTable projects={projects} /> : <EmptyWorkspace onConnect={() => navigate("/connect")} />}
      </section>
      {latest && (
        <div className="dashboard-grid">
          <section className="card callout-card">
            <div className="callout-icon"><Github size={23} /></div>
            <div><h3>Scan another repository</h3><p>Pick any repository from your GitHub account. It is added to your projects when the scan starts.</p></div>
            <button className="primary-button" onClick={() => navigate("/connect")}>New Scan <ArrowRight size={16} /></button>
          </section>
          <section className="card mini-score">
            <div className="section-header"><div><h3>Latest Security Score</h3><p>{latest.name} · {latest.latestScan.branch}</p></div><ShieldCheck size={23} className={latest.latestScan.score >= 70 ? "green-icon" : "red-icon"} /></div>
            <div className="mini-score-row"><strong>{latest.latestScan.score}</strong><span>/100</span><StatusBadge status={verdict(latest)} /></div>
            <div className="progress"><span style={{ width: `${latest.latestScan.score}%` }} /></div>
          </section>
        </div>
      )}
    </>
  );
}

export function Projects() {
  const navigate = useNavigate();
  const { projects, github, error } = useData();
  if (projects === null) return <Loading />;
  return (
    <>
      <PageHeading eyebrow="Projects" title="Projects" description="Repositories you connected from GitHub."
        action={<button className="primary-button" onClick={() => navigate("/connect")}><Github size={17} /> {github?.connected ? "Scan Another Repository" : "Connect GitHub"}</button>} />
      <ErrorNote>{error}</ErrorNote>
      <section className="card">{projects.length ? <ProjectTable projects={projects} /> : <EmptyWorkspace onConnect={() => navigate("/connect")} />}</section>
    </>
  );
}

function ProjectTable({ projects }) {
  const navigate = useNavigate();
  const { refreshProjects } = useData();
  const { rescan, busyId, error } = useRescan();
  const [deleteError, setDeleteError] = useState("");

  const remove = async (p) => {
    if (!window.confirm(`Delete ${p.name}? Its scans, findings and deployment records are removed from TechShield. The GitHub repository itself is not touched.`)) return;
    try { await api.deleteProject(p.id); await refreshProjects(); } catch (err) { setDeleteError(err.message); }
  };

  return (
    <>
      <ErrorNote>{error || deleteError}</ErrorNote>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Project</th><th>Repository</th><th>Last Scan</th><th>Security Score</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>
            {projects.map((p) => (
              <tr key={p.id}>
                <td><strong>{p.name}</strong></td>
                <td className="muted">{p.fullName} · {p.branch}</td>
                <td className="muted">{p.latestScan ? fmtDate(p.latestScan.completedAt || p.latestScan.startedAt) : "Not scanned yet"}</td>
                <td><ScorePill score={finished(p) ? p.latestScan.score : null} /></td>
                <td><StatusBadge status={verdict(p)} /></td>
                <td>
                  <div className="table-actions">
                    <button className="small-button" onClick={() => navigate(`/scan-results?project=${p.id}`)}>View Scan</button>
                    <button className="small-button" disabled={busyId === p.id || isActive(p.latestScan)} onClick={() => rescan(p)}><RefreshCw size={13} /> Re-scan</button>
                    <button className="small-button danger-button" title={`Delete ${p.name}`} onClick={() => remove(p)}><Trash2 size={14} /> Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ------------------------------------------------- connect GitHub + scan */
export function ConnectRepository() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { github, refreshGithub, refreshProjects } = useData();
  const [repos, setRepos] = useState(null);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState(null);
  const [branches, setBranches] = useState([]);
  const [branch, setBranch] = useState("");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(params.get("github") === "error" ? (params.get("message") || "GitHub connection failed.") : "");

  const loadRepos = () => {
    setRepos(null); setError("");
    api.githubRepos().then((d) => setRepos(d.repositories)).catch((err) => { setRepos([]); setError(err.message); });
  };
  useEffect(() => { if (github?.connected) loadRepos(); }, [github?.connected]);

  const pick = (repo) => {
    setSelected(repo); setBranch(repo.defaultBranch); setBranches([repo.defaultBranch]);
    api.githubBranches(repo.owner, repo.name)
      .then((d) => setBranches(d.branches.includes(repo.defaultBranch) ? d.branches : [repo.defaultBranch, ...d.branches]))
      .catch(() => {});
  };

  const connectOAuth = async () => {
    setError("");
    try { const { url } = await api.githubOAuthUrl(); window.location.href = url; } catch (err) { setError(err.message); }
  };
  const connectToken = async (e) => {
    e.preventDefault(); setBusy(true); setError("");
    try { await api.githubConnectToken(token.trim()); setToken(""); await refreshGithub(); } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  const disconnect = async () => {
    if (!window.confirm("Disconnect GitHub? Scans of your repositories stop working until you reconnect.")) return;
    await api.githubDisconnect(); setRepos(null); setSelected(null); await refreshGithub();
  };
  const scan = async () => {
    setBusy(true); setError("");
    try {
      const { project } = await api.createProject(selected.owner, selected.name, branch);
      await api.startScan(project.id, branch);
      await refreshProjects();
      navigate(`/scan-results?project=${project.id}`);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  const visible = (repos || []).filter((r) => r.fullName.toLowerCase().includes(filter.trim().toLowerCase()));

  return (
    <>
      <PageHeading eyebrow="Repository" title="Connect GitHub Repository" description="Connect your GitHub account, choose a repository and branch, and TechShield scans it for vulnerabilities." />
      <section className="connect-card card">
        <ErrorNote>{error}</ErrorNote>
        {github === null ? <Loading /> : !github.connected ? (
          <div className="connect-intro">
            <div className="github-large"><Github size={56} /></div>
            <h2>Connect with GitHub</h2>
            <p>TechShield reads your repositories only to scan them. Your GitHub token is stored encrypted and is used by the scan workflow to download the code.</p>
            {github.oauthAvailable && <button className="primary-button" onClick={connectOAuth}><Github size={18} /> Connect with GitHub</button>}
            <form onSubmit={connectToken} style={{ marginTop: 18, width: "100%", maxWidth: 420, textAlign: "left" }}>
              <label className="field"><span>{github.oauthAvailable ? "…or use a personal access token" : "GitHub personal access token"}</span>
                <div className="input-wrap"><Lock size={17} /><input type="password" required minLength={20} value={token} onChange={(e) => setToken(e.target.value)} placeholder="ghp_… or github_pat_…" autoComplete="off" /></div>
              </label>
              <p className="muted" style={{ fontSize: 11, lineHeight: 1.6 }}>Create one at <a href="https://github.com/settings/tokens" target="_blank" rel="noreferrer" style={{ textDecoration: "underline" }}>github.com/settings/tokens</a>. A classic token needs the <strong>repo</strong> scope (or <strong>public_repo</strong> for public repositories only).</p>
              <button className="primary-button wide" type="submit" disabled={busy}>{busy ? "Checking token…" : "Connect GitHub"}</button>
            </form>
          </div>
        ) : (
          <div className="repo-selector">
            <div className="connected-banner">
              <div className="connected-left"><Github size={27} /><div><strong>Connected to GitHub</strong><span>{github.login}</span></div></div>
              <button className="text-button" onClick={disconnect}>Disconnect</button>
            </div>
            <div className="selector-heading">
              <div><h2>Select Repository & Branch</h2><p>The repository becomes a project when the scan starts.</p></div>
              <button className="small-button" onClick={loadRepos}><RefreshCw size={15} /> Refresh</button>
            </div>
            <div className="topbar-search" style={{ width: "100%", marginBottom: 12 }}><Search size={16} /><input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter repositories…" /></div>
            {repos === null ? <Loading text="Loading your repositories…" /> : (
              <div className="repo-grid">
                {visible.length === 0 && <p className="muted">No repositories found.</p>}
                {visible.slice(0, 40).map((repo) => (
                  <button key={repo.id} className={`repo-option ${selected?.fullName === repo.fullName ? "selected" : ""}`} onClick={() => pick(repo)}>
                    <div className="repo-icon"><Code2 size={18} /></div>
                    <div className="repo-copy"><strong>{repo.fullName}{repo.private ? " 🔒" : ""}</strong><span>{repo.description || repo.language || "No description"}</span></div>
                    {selected?.fullName === repo.fullName ? <CheckCircle2 className="repo-check" size={19} /> : <span className="select-text">Select</span>}
                  </button>
                ))}
              </div>
            )}
            {selected && (
              <>
                <div className="selector-fields">
                  <label className="field"><span>Repository</span><div className="input-wrap"><Github size={16} /><input value={selected.fullName} readOnly /></div></label>
                  <label className="field"><span>Branch</span><div className="select-wrap"><select value={branch} onChange={(e) => setBranch(e.target.value)}>{branches.map((b) => <option key={b}>{b}</option>)}</select><ChevronDown size={16} /></div></label>
                </div>
                <div className="selected-summary">
                  <div className="repo-icon"><Github size={20} /></div>
                  <div><strong>{selected.name}</strong><span>{selected.fullName} · {branch}</span></div>
                  <button className="primary-button" disabled={busy} onClick={scan}><Activity size={16} /> {busy ? "Starting scan…" : "Scan Repository"} <ArrowRight size={16} /></button>
                </div>
              </>
            )}
          </div>
        )}
      </section>
    </>
  );
}

/* ------------------------------------------------------------ scan results */
export function ScanResults() {
  const navigate = useNavigate();
  const { project, projects, loading } = useSelectedProject();
  const { rescan, busyId, error } = useRescan();
  const [tab, setTab] = useState("all");
  const [findings, setFindings] = useState(null);
  const [findingsError, setFindingsError] = useState("");
  const scanId = project?.latestScan?.status === "completed" ? project.latestScan.id : null;

  useEffect(() => {
    setFindings(null); setFindingsError("");
    if (!scanId) return;
    api.findings(scanId).then((d) => setFindings(d.vulnerabilities)).catch((err) => setFindingsError(err.message));
  }, [scanId]);

  if (loading) return <Loading />;
  if (!project) return <EmptyWorkspace onConnect={() => navigate("/connect")} />;
  const s = project.latestScan;
  const counts = s?.counts || { Critical: 0, High: 0, Medium: 0, Low: 0 };
  const rows = (findings || []).filter((f) => tab === "all" || f.type === tab);
  const countFor = (t) => (findings || []).filter((f) => t === "all" || f.type === t).length;

  return (
    <>
      <PageHeading eyebrow="Security" title="Scan Results" description={`Findings from the latest scan of ${project.name}.`}
        action={<button className="outline-button" disabled={busyId === project.id || isActive(s)} onClick={() => rescan(project)}><Activity size={16} /> Run New Scan</button>} />
      <ProjectSelector project={project} projects={projects} to="/scan-results" />
      <ErrorNote>{error}</ErrorNote>
      {!s ? (
        <section className="card empty-workspace"><h3>Not scanned yet</h3><p>Run a scan to detect vulnerabilities in {project.fullName}.</p><button className="primary-button" onClick={() => rescan(project)}><Activity size={16} /> Scan now</button></section>
      ) : s.status !== "completed" ? (
        <ScanProgress project={project} onRescan={() => rescan(project)} busy={busyId === project.id} />
      ) : (
        <>
          <div className="finding-summary">
            <FindingStat label="Total Findings" value={SEVERITIES.reduce((n, k) => n + (counts[k] || 0), 0)} icon={Shield} />
            {SEVERITIES.map((k) => <FindingStat key={k} label={k} value={counts[k] || 0} icon={CircleAlert} tone={k.toLowerCase()} />)}
          </div>
          <section className="card">
            <div className="filter-row">
              <div className="tabs">{TABS.map(([key, label]) => <button key={key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}>{label}{findings ? ` (${countFor(key)})` : ""}</button>)}</div>
              <span className="muted">Scanned {fmtDate(s.completedAt)}{s.commit ? ` · commit ${s.commit.slice(0, 7)}` : ""}</span>
            </div>
            <ErrorNote>{findingsError}</ErrorNote>
            {findings === null && !findingsError ? <Loading /> : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Vulnerability</th><th>Scanner</th><th>Severity</th><th>File / Component</th><th>Status</th></tr></thead>
                  <tbody>
                    {rows.map((f) => (
                      <tr key={f.id}>
                        <td><strong>{f.title}</strong>{f.description && <div className="muted" style={{ fontSize: 10, marginTop: 3, maxWidth: 420 }}>{f.description.slice(0, 160)}</div>}</td>
                        <td className="muted">{f.tool}</td>
                        <td><SeverityBadge severity={f.severity} /></td>
                        <td className="muted">{f.file}{f.line ? `:${f.line}` : ""}</td>
                        <td><StatusBadge status={f.status === "open" ? "Open" : "Suppressed"} /></td>
                      </tr>
                    ))}
                    {!rows.length && <tr><td colSpan={5} className="muted">No findings in this category.</td></tr>}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}

/* ----------------------------------------------------------- security score */
export function SecurityScore() {
  const navigate = useNavigate();
  const { project, projects, loading } = useSelectedProject();
  const { rescan, busyId, error } = useRescan();
  if (loading) return <Loading />;
  if (!project) return <EmptyWorkspace onConnect={() => navigate("/connect")} />;
  const s = project.latestScan;
  const w = project.weights;

  return (
    <>
      <PageHeading eyebrow="Security" title="Security Score" description={`Security score generated from the latest scan of ${project.name}.`} />
      <ProjectSelector project={project} projects={projects} to="/security-score" />
      <ErrorNote>{error}</ErrorNote>
      {!finished(project) ? <ScanProgress project={project} onRescan={() => rescan(project)} busy={busyId === project.id} /> : (() => {
        const c = s.counts;
        const ok = s.score >= project.gate.min_score;
        return (
          <>
            <div className="score-layout">
              <section className="card score-card">
                <div className={`score-ring ${ok ? "" : "score-ring-fail"}`} style={{ background: `conic-gradient(${ok ? "#19a77a" : "#dc444c"} ${s.score}%, #edf0f6 0)` }}><div><strong>{s.score}</strong><span>/100</span></div></div>
                <h2>{ok ? "Good Security Posture" : "Security Risks Detected"}</h2>
                <p>Latest scan of {project.name} · {s.branch}</p>
              </section>
              <section className="card">
                <div className="section-header"><div><h3>Findings Summary</h3><p>Severity distribution</p></div>{s.gateStatus === "PASS" ? <ShieldCheck className="green-icon" /> : <ShieldX className="red-icon" />}</div>
                <div className="severity-list">{SEVERITIES.map((k) => <SeverityLine key={k} label={k} value={String(c[k])} width={`${Math.min(100, c[k] * 20)}%`} />)}</div>
              </section>
            </div>
            <section className="card">
              <div className="section-header"><div><h3>Score Calculation</h3><p>100 minus a penalty per open finding</p></div><ScorePill score={s.score} /></div>
              <div className="score-breakdown">
                <div><span>Base score</span><strong>100</strong></div>
                {SEVERITIES.map((k) => <div key={k}><span>{k} findings ({c[k]} × {w[k]})</span><strong>-{c[k] * w[k]}</strong></div>)}
                <div className="total"><span>Final security score</span><strong>{s.score}</strong></div>
              </div>
            </section>
          </>
        );
      })()}
    </>
  );
}

/* ------------------------------------------------------------ security gate */
function GateSettings({ project }) {
  const { refreshProjects } = useData();
  const [form, setForm] = useState(project.gate);
  const [deploy, setDeploy] = useState(project.deployEnabled);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { setForm(project.gate); setDeploy(project.deployEnabled); }, [project.id]);

  const set = (key, value) => { setSaved(false); setForm((f) => ({ ...f, [key]: value })); };
  const save = async (e) => {
    e.preventDefault(); setBusy(true); setError("");
    try {
      await api.updateSettings(project.id, { gate: { min_score: Number(form.min_score), max_high: Number(form.max_high), block_on_critical: form.block_on_critical, block_on_secrets: form.block_on_secrets, require_all_scanners: form.require_all_scanners }, deployEnabled: deploy });
      await refreshProjects(); setSaved(true);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  const toggle = (key, title, text, value, onChange) => (
    <div className="preference-row" key={key}><div><strong>{title}</strong><span>{text}</span></div>
      <button type="button" className={`toggle ${value ? "on" : ""}`} aria-pressed={value} onClick={() => onChange(!value)}><span /></button></div>
  );

  return (
    <section className="card settings-card">
      <div className="section-header"><div><h3>Gate Settings</h3><p>Decide when a release is blocked. Changes apply from the next scan.</p></div>{saved && <span className="save-message"><CheckCircle2 size={14} /> Saved</span>}</div>
      <ErrorNote>{error}</ErrorNote>
      <form onSubmit={save} className="settings-form">
        <label className="field"><span>Minimum security score (0–100)</span><div className="input-wrap"><Shield size={17} /><input type="number" min={0} max={100} required value={form.min_score} onChange={(e) => set("min_score", e.target.value)} /></div></label>
        <label className="field"><span>Maximum number of High findings</span><div className="input-wrap"><CircleAlert size={17} /><input type="number" min={0} max={1000} required value={form.max_high} onChange={(e) => set("max_high", e.target.value)} /></div></label>
        <div className="preference-list">
          {toggle("c", "Block on any Critical finding", "One Critical issue stops the release.", form.block_on_critical, (v) => set("block_on_critical", v))}
          {toggle("s", "Block on exposed secrets", "Any leaked key, token or password stops the release.", form.block_on_secrets, (v) => set("block_on_secrets", v))}
          {toggle("a", "Require every scanner to finish", "If a scanner fails, the gate fails (it never treats “not checked” as “safe”).", form.require_all_scanners, (v) => set("require_all_scanners", v))}
          {toggle("d", "Deploy to Vercel when the gate passes", "Turn off to only get the security verdict.", deploy, (v) => { setSaved(false); setDeploy(v); })}
        </div>
        <div className="settings-actions"><button className="primary-button" type="submit" disabled={busy}>{busy ? "Saving…" : "Save gate settings"}</button></div>
      </form>
    </section>
  );
}

export function SecurityGate() {
  const navigate = useNavigate();
  const { project, projects, loading } = useSelectedProject();
  const { rescan, busyId, error } = useRescan();
  if (loading) return <Loading />;
  if (!project) return <EmptyWorkspace onConnect={() => navigate("/connect")} />;
  const s = project.latestScan;
  const done = finished(project);
  const passed = done && s.gateStatus === "PASS";
  const d = s?.deployment;
  const g = project.gate;
  const c = s?.counts || {};
  const scannerList = Object.entries(s?.scanners || {});
  const scannersOk = scannerList.length > 0 && scannerList.every(([, info]) => info.status === "ok");

  return (
    <>
      <PageHeading eyebrow="Security" title="Security Gate" description={`Deployment decision for ${project.name}.`} />
      <ProjectSelector project={project} projects={projects} to="/security-gate" />
      <ErrorNote>{error}</ErrorNote>
      {!done ? <ScanProgress project={project} onRescan={() => rescan(project)} busy={busyId === project.id} /> : (
        <>
          <section className={`gate-card ${passed ? "pass" : "fail"}`}>
            <div className="gate-icon">{passed ? <ShieldCheck size={42} /> : <ShieldX size={42} />}</div>
            <div className="gate-label">SECURITY GATE</div><h1>{passed ? "PASS" : "FAIL"}</h1><p>{passed ? "Deployment Allowed" : "Deployment Blocked"}</p>
          </section>
          {!passed && s.reasons?.length > 0 && <div className="form-error"><strong>Why it was blocked</strong><ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>{s.reasons.map((r) => <li key={r}>{r}</li>)}</ul></div>}
          <div className="gate-grid">
            <section className="card">
              <div className="section-header"><div><h3>Gate Rules</h3><p>Checked against the latest scan</p></div><Lock size={21} /></div>
              <Rule ok={s.score >= g.min_score} note={`(score ${s.score})`}>Security score ≥ {g.min_score}</Rule>
              <Rule ok={!g.block_on_critical || c.Critical === 0} note={g.block_on_critical ? `(${c.Critical} found)` : "(not enforced)"}>No Critical vulnerabilities</Rule>
              <Rule ok={c.High <= g.max_high} note={`(${c.High} found)`}>High vulnerabilities ≤ {g.max_high}</Rule>
              <Rule ok={!g.block_on_secrets || s.secrets === 0} note={g.block_on_secrets ? `(${s.secrets} found)` : "(not enforced)"}>No exposed secrets</Rule>
              <Rule ok={!g.require_all_scanners || scannersOk} note={g.require_all_scanners ? "" : "(not enforced)"}>All four scanners completed</Rule>
            </section>
            <section className="card deployment-card">
              <div className="section-header"><div><h3>Deployment Status</h3><p>Deployment to Vercel after the gate</p></div><Cloud className={passed ? "green-icon" : "red-icon"} /></div>
              <TimelineItem title="Repository scanned on GitHub Actions" time={fmtDate(s.startedAt)} />
              <TimelineItem title={passed ? "Security gate passed" : "Security gate failed"} time={fmtDate(s.completedAt)} ok={passed} />
              <TimelineItem title={!passed ? "Deployment blocked" : d?.status === "deployed" ? "Deployed to Vercel" : d?.status === "failed" ? "Deployment failed" : project.deployEnabled ? "Deploying to Vercel…" : "Automatic deployment is off"}
                time={d?.at ? fmtDate(d.at) : ""} ok={passed && d?.status !== "failed"} />
              <div className={`deploy-success ${passed && d?.status !== "failed" ? "" : "deploy-failure"}`}>
                {passed && d?.status !== "failed" ? <CheckCircle2 size={23} /> : <XCircle size={23} />}
                <div><strong>Deployment {deploymentLabel(project)}</strong><span>{d?.logs || (passed ? "Waiting for the deployment." : "The application was not deployed because the security gate failed.")}</span></div>
              </div>
              <div className="deployment-meta"><span>Environment <strong>Vercel</strong></span><span>Application <strong>{project.name}</strong></span></div>
              {project.liveUrl && passed && d?.status === "deployed"
                ? <a className="primary-button wide" href={d.url || project.liveUrl} target="_blank" rel="noreferrer"><Play size={16} /> Open live application</a>
                : <button className="primary-button wide" disabled><Play size={16} /> {passed ? "Not deployed yet" : "Deployment blocked"}</button>}
              {s.runUrl && <p style={{ textAlign: "center", marginTop: 10 }}><a className="text-button" href={s.runUrl} target="_blank" rel="noreferrer"><ExternalLink size={13} /> GitHub Actions run</a></p>}
            </section>
          </div>
        </>
      )}
      <GateSettings project={project} />
    </>
  );
}

/* ------------------------------------------------------------------ history */
export function HistoryPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState("scans");
  const [scans, setScans] = useState(null);
  const [deployments, setDeployments] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([api.history(), api.deployments()])
      .then(([h, d]) => { setScans(h.scans); setDeployments(d.deployments); })
      .catch((err) => { setError(err.message); setScans([]); setDeployments([]); });
  }, []);
  if (scans === null) return <Loading />;

  const scanStatus = (s) => (s.status === "completed" ? (s.gateStatus === "PASS" ? "Pass" : "Blocked") : s.status === "failed" ? "Failed" : s.status === "running" ? "Running" : "Queued");
  const empty = tab === "scans" ? scans.length === 0 : deployments.length === 0;

  return (
    <>
      <PageHeading eyebrow="Activity" title="Scan & Deployment History" description="Every scan and deployment of your projects." />
      <ErrorNote>{error}</ErrorNote>
      <section className="card">
        <div className="filter-row">
          <div className="tabs"><button className={tab === "scans" ? "active" : ""} onClick={() => setTab("scans")}>Scans ({scans.length})</button><button className={tab === "deployments" ? "active" : ""} onClick={() => setTab("deployments")}>Deployments ({deployments.length})</button></div>
        </div>
        {empty ? <EmptyWorkspace onConnect={() => navigate("/connect")} title={tab === "scans" ? "No scans yet" : "No deployments yet"} text="Scan a GitHub repository and its history appears here." /> : tab === "scans" ? (
          <div className="table-wrap"><table>
            <thead><tr><th>Date & Time</th><th>Project</th><th>Branch</th><th>Security Score</th><th>Status</th></tr></thead>
            <tbody>{scans.map((s) => (
              <tr key={s.id}><td>{fmtDate(s.startedAt)}</td><td><strong>{s.projectName}</strong></td><td className="muted">{s.branch}{s.commit ? ` @ ${s.commit.slice(0, 7)}` : ""}</td><td><ScorePill score={s.score} /></td><td><StatusBadge status={scanStatus(s)} /></td></tr>
            ))}</tbody></table></div>
        ) : (
          <div className="table-wrap"><table>
            <thead><tr><th>Date & Time</th><th>Project</th><th>Status</th><th>Environment</th><th>Link</th></tr></thead>
            <tbody>{deployments.map((d) => (
              <tr key={d.id}><td>{fmtDate(d.deployedAt || d.createdAt)}</td><td><strong>{d.projectName}</strong></td>
                <td><StatusBadge status={d.status === "deployed" ? "Deployed" : d.status === "blocked" ? "Blocked" : d.status === "failed" ? "Failed" : "Allowed"} /></td>
                <td className="muted">{d.environment || "—"}</td>
                <td>{d.url ? <a className="text-button" href={d.url} target="_blank" rel="noreferrer">Open <ExternalLink size={12} /></a> : <span className="muted">—</span>}</td></tr>
            ))}</tbody></table></div>
        )}
      </section>
    </>
  );
}

/* ----------------------------------------------------------------- settings */
export function SettingsPage() {
  const navigate = useNavigate();
  const { user, github, refreshGithub } = useData();
  const disconnect = async () => {
    if (!window.confirm("Disconnect GitHub?")) return;
    await api.githubDisconnect(); await refreshGithub();
  };
  return (
    <>
      <PageHeading eyebrow="Settings" title="Profile & Settings" description="Your account and GitHub connection." />
      <div className="settings-layout">
        <section className="card profile-hero-card">
          <div className="profile-hero-avatar">{initials(user?.name)}</div>
          <div className="profile-hero-copy"><h2>{user?.name}</h2><p>{user?.email}</p><span>{github?.connected ? `GitHub · ${github.login}` : "GitHub not connected"}</span></div>
        </section>
        <section className="card settings-card">
          <div className="section-header"><div><h3>GitHub connection</h3><p>TechShield uses it to list your repositories and download the code that gets scanned.</p></div><Github size={21} /></div>
          <div className="settings-actions">
            {github?.connected
              ? <button className="secondary-button danger-button" onClick={disconnect}>Disconnect {github.login}</button>
              : <button className="primary-button" onClick={() => navigate("/connect")}><Github size={15} /> Connect GitHub</button>}
          </div>
        </section>
        <section className="card settings-card danger-card">
          <div><h3>Sign out</h3><p>End this session on this device.</p></div>
          <button className="secondary-button danger-button" onClick={() => { auth.token = null; navigate("/login", { replace: true }); }}><LogOut size={15} /> Sign out</button>
        </section>
      </div>
    </>
  );
}
