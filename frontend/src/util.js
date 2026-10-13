export const SEVERITIES = ["Critical", "High", "Medium", "Low"];

export function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const date = d.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });
  const time = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  return `${date} · ${time}`;
}

export function timeAgo(iso) {
  if (!iso) return "";
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hr ago`;
  return `${Math.floor(seconds / 86400)} d ago`;
}

export function initials(name = "") {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export const isActive = (scan) => Boolean(scan) && (scan.status === "pending" || scan.status === "running");

// One label per project, used by badges and tables.
export function verdict(project) {
  const s = project && project.latestScan;
  if (!s) return "Not scanned";
  if (s.status === "pending") return "Queued";
  if (s.status === "running") return "Running";
  if (s.status === "failed") return "Failed";
  return s.gateStatus === "PASS" ? "Pass" : "Fail";
}

export function deploymentLabel(project) {
  const s = project && project.latestScan;
  if (!s || s.status !== "completed") return "—";
  const d = s.deployment;
  if (s.gateStatus === "FAIL") return "Blocked";
  if (!d) return "—";
  if (d.status === "deployed") return "Deployed";
  if (d.status === "failed") return "Deploy failed";
  return project.deployEnabled ? "Deploying…" : "Allowed";
}

export const TYPE_LABEL = { sast: "SAST", dependency: "Dependency", secret: "Secrets", container: "Container" };
export const TABS = [["all", "All"], ["sast", "SAST"], ["dependency", "Dependency"], ["secret", "Secrets"], ["container", "Container"]];
