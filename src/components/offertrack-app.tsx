"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { AuthUser } from "../modules/auth/auth-types";
import type { WorkspaceScopedData } from "../modules/workspace/workspace-types";
import { AccountMenu } from "./auth/account-menu";
import { DashboardView } from "./dashboard/dashboard-view";
import { JobListView } from "./job/job-list-view";
import { KanbanBoard } from "./kanban/kanban-board";
import { readApiError } from "./shared/api-client";
import { SettingsView } from "./settings/settings-view";
import { JobDetailView } from "./timeline/job-detail-view";
import { WorkspaceSelector } from "./workspace/workspace-selector";
import { useWorkspace } from "./workspace/workspace-provider";

type View = "dashboard" | "kanban" | "jobs" | "settings" | "job-detail";

const navigationItems = [
  { id: "dashboard", label: "Dashboard" },
  { id: "kanban", label: "Kanban" },
  { id: "jobs", label: "岗位列表" },
  { id: "settings", label: "设置" },
] as const satisfies ReadonlyArray<{ id: Exclude<View, "job-detail">; label: string }>;

function EmptyState(): ReactNode {
  return (
    <section className="empty-state">
      <span className="empty-state-mark" aria-hidden="true">O</span>
      <h1>还没有 Workspace</h1>
      <p>从右上角的 Workspace 选择器新建一个招聘周期。</p>
    </section>
  );
}

function LoadingState(): ReactNode {
  return (
    <section className="page-skeleton" aria-label="正在加载 Workspace 数据" aria-live="polite">
      <div className="skeleton-metrics" aria-hidden="true">
        {Array.from({ length: 6 }, (_, index) => <span key={index} />)}
      </div>
      <div className="skeleton-panels" aria-hidden="true"><span /><span /></div>
      <p><span className="loading-spinner" aria-hidden="true" />正在加载 Workspace 数据…</p>
    </section>
  );
}

export function OfferTrackApp({ currentUser }: { currentUser: AuthUser }): ReactNode {
  const { currentWorkspace, currentWorkspaceId } = useWorkspace();
  const [view, setView] = useState<View>("dashboard");
  const [data, setData] = useState<WorkspaceScopedData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dataVersion, setDataVersion] = useState(0);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  useEffect(() => {
    setSelectedJobId(null);
    setView((currentView) => currentView === "job-detail" ? "jobs" : currentView);
  }, [currentWorkspaceId]);

  useEffect(() => {
    if (!currentWorkspaceId) {
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetch(`/api/workspaces/${currentWorkspaceId}/data`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(await readApiError(response, "无法读取当前 Workspace 数据。"));
        }
        return (await response.json()) as { data: WorkspaceScopedData };
      })
      .then((body) => setData(body.data))
      .catch((requestError: unknown) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") {
          return;
        }
        setError(requestError instanceof Error ? requestError.message : "数据加载失败。");
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [currentWorkspaceId, dataVersion]);

  const selectedJob =
    data?.workspaceId === currentWorkspaceId
      ? data.jobs.find((job) => job.id === selectedJobId) ?? null
      : null;
  const visibleData = data?.workspaceId === currentWorkspaceId ? data : null;

  function openJob(jobId: string): void {
    setSelectedJobId(jobId);
    setView("job-detail");
  }

  function refreshData(): void {
    setDataVersion((version) => version + 1);
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark">O</span><span>OfferTrack</span></div>
        <nav aria-label="主要导航">
          {navigationItems.map((item) => (
            <button
              aria-current={view === item.id ? "page" : undefined}
              className={view === item.id ? "active" : ""}
              key={item.id}
              onClick={() => {
                setSelectedJobId(null);
                setView(item.id);
              }}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="topbar-actions">
          <WorkspaceSelector />
          <AccountMenu user={currentUser} />
        </div>
      </header>

      <main aria-busy={loading} className="main-content">
        {loading && visibleData ? <div className="data-refresh-bar" role="status"><span />正在同步最新数据…</div> : null}
        {error && visibleData ? (
          <div className="inline-error-banner" role="alert">
            <span>{error}</span>
            <button onClick={refreshData} type="button">重试</button>
          </div>
        ) : null}
        {view === "settings" ? (
          <div className="page-heading">
            <div><span className="eyebrow">Account & Data</span><h1>账户与数据管理</h1><p>管理密码和个人空间；管理员还可以维护团队账号与全库备份。</p></div>
            <span className="local-badge"><span aria-hidden="true" /> {currentUser.displayName}</span>
          </div>
        ) : currentWorkspace ? (
          <div className="page-heading">
            <div><span className="eyebrow">当前 Workspace</span><h1>{currentWorkspace.name}</h1><p>{currentWorkspace.description ?? "管理本轮招聘进度与结果。"}</p></div>
            <span className="local-badge"><span aria-hidden="true" /> 本地数据</span>
          </div>
        ) : null}

        {view === "settings" ? (
          <SettingsView
            currentUser={currentUser}
            workspaceId={currentWorkspaceId}
            workspaceName={currentWorkspace?.name ?? null}
          />
        ) : !currentWorkspaceId ? <EmptyState /> : loading && !visibleData ? (
          <LoadingState />
        ) : error && !visibleData ? (
          <section className="error-state" role="alert"><span className="error-state-mark" aria-hidden="true">!</span><h2>数据加载失败</h2><p>{error}</p><button className="primary-button state-action" onClick={refreshData} type="button">重新加载</button></section>
        ) : visibleData ? (
          view === "job-detail" && selectedJob ? (
            <JobDetailView
              job={selectedJob}
              onBack={() => {
                setSelectedJobId(null);
                setView("jobs");
              }}
              onChanged={refreshData}
              workspaceId={currentWorkspaceId!}
            />
          ) : view === "dashboard" ? <DashboardView data={visibleData} /> : view === "kanban" ? (
            <KanbanBoard
              data={visibleData}
              onChanged={refreshData}
              onOpenJob={openJob}
              workspaceId={currentWorkspaceId!}
            />
          ) : (
            <JobListView
              data={visibleData}
              onChanged={refreshData}
              onOpenJob={openJob}
              workspaceId={currentWorkspaceId!}
              workspaceName={currentWorkspace!.name}
            />
          )
        ) : null}
      </main>
    </div>
  );
}
