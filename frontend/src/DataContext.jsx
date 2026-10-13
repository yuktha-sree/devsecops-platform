import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "./api";
import { isActive } from "./util";

const DataContext = createContext(null);
export const useData = () => useContext(DataContext);

export function DataProvider({ children }) {
  const [user, setUser] = useState(null);
  const [github, setGithub] = useState(null);
  const [projects, setProjects] = useState(null);
  const [error, setError] = useState("");

  const refreshProjects = useCallback(async () => {
    try {
      const data = await api.projects();
      setProjects(data.projects);
      setError("");
    } catch (err) {
      setError(err.message);
      setProjects((current) => current || []);
    }
  }, []);

  const refreshGithub = useCallback(async () => {
    try { setGithub(await api.githubStatus()); } catch { setGithub({ connected: false, oauthAvailable: false }); }
  }, []);

  useEffect(() => {
    api.me().then((d) => setUser(d.user)).catch(() => {});
    refreshGithub();
    refreshProjects();
  }, [refreshGithub, refreshProjects]);

  // While a scan is queued or running, ask the backend for progress every 5 seconds.
  const scanning = Boolean(projects && projects.some((p) => isActive(p.latestScan)));
  useEffect(() => {
    if (!scanning) return undefined;
    const timer = setInterval(refreshProjects, 5000);
    return () => clearInterval(timer);
  }, [scanning, refreshProjects]);

  const value = useMemo(
    () => ({ user, github, projects, error, refreshProjects, refreshGithub }),
    [user, github, projects, error, refreshProjects, refreshGithub]
  );
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

// Picks the project named in ?project=<id>, else the last one used, else the first.
export function useSelectedProject() {
  const { projects } = useData();
  const [params] = useSearchParams();
  const wanted = params.get("project") || localStorage.getItem("selectedProject");
  const project = useMemo(() => {
    if (!projects || !projects.length) return null;
    return projects.find((p) => String(p.id) === String(wanted)) || projects[0];
  }, [projects, wanted]);
  useEffect(() => { if (project) localStorage.setItem("selectedProject", String(project.id)); }, [project]);
  return { project, projects, loading: projects === null };
}
