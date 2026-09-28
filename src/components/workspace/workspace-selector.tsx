"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import type { WorkspaceDeletionSummary } from "../../modules/workspace/workspace-types";
import { readApiError } from "../shared/api-client";
import { useWorkspace } from "./workspace-provider";
import { WorkspaceDialog } from "./workspace-dialog";

type DialogMode = "create" | "rename" | "delete" | null;

export function WorkspaceSelector(): ReactNode {
  const {
    workspaces,
    currentWorkspace,
    currentWorkspaceId,
    selectWorkspace,
    createWorkspace,
    renameCurrentWorkspace,
    deleteCurrentWorkspace,
  } = useWorkspace();
  const containerRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<DialogMode>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [summary, setSummary] = useState<WorkspaceDeletionSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent): void => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const closeDialog = useCallback((): void => {
    if (busy) {
      return;
    }
    setDialogMode(null);
    setError(null);
    setSummary(null);
  }, [busy]);

  const openCreate = (): void => {
    setMenuOpen(false);
    setName("");
    setDescription("");
    setError(null);
    setDialogMode("create");
  };

  const openRename = (): void => {
    if (!currentWorkspace) {
      return;
    }
    setMenuOpen(false);
    setName(currentWorkspace.name);
    setError(null);
    setDialogMode("rename");
  };

  const openDelete = async (): Promise<void> => {
    if (!currentWorkspaceId) {
      return;
    }
    setMenuOpen(false);
    setDialogMode("delete");
    setSummary(null);
    setError(null);
    try {
      const response = await fetch(
        `/api/workspaces/${currentWorkspaceId}/delete-summary`,
        { cache: "no-store" },
      );
      if (!response.ok) {
        throw new Error(await readApiError(response, "无法读取删除信息。"));
      }
      const body = (await response.json()) as {
        summary: WorkspaceDeletionSummary;
      };
      setSummary(body.summary);
    } catch (requestError: unknown) {
      setError(
        requestError instanceof Error ? requestError.message : "无法读取删除信息。",
      );
    }
  };

  const handleWorkspaceForm = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (dialogMode === "create") {
        await createWorkspace({ name, description });
      } else if (dialogMode === "rename") {
        await renameCurrentWorkspace(name);
      }
      setDialogMode(null);
    } catch (requestError: unknown) {
      setError(
        requestError instanceof Error ? requestError.message : "操作失败。",
      );
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await deleteCurrentWorkspace();
      setDialogMode(null);
      setSummary(null);
    } catch (requestError: unknown) {
      setError(
        requestError instanceof Error ? requestError.message : "删除失败。",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="workspace-selector" ref={containerRef}>
        <span className="workspace-selector-label">Workspace</span>
        <button
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          className="workspace-trigger"
          onClick={() => setMenuOpen((open) => !open)}
          type="button"
        >
          <span className="workspace-mark" aria-hidden="true" />
          <span>{currentWorkspace?.name ?? "选择 Workspace"}</span>
          <span className="chevron" aria-hidden="true">⌄</span>
        </button>

        {menuOpen ? (
          <div className="workspace-menu" role="menu">
            <div className="workspace-menu-title">切换 Workspace</div>
            <div className="workspace-options">
              {workspaces.length ? (
                workspaces.map((workspace) => (
                  <button
                    className="workspace-option"
                    key={workspace.id}
                    onClick={() => {
                      selectWorkspace(workspace.id);
                      setMenuOpen(false);
                    }}
                    role="menuitemradio"
                    aria-checked={workspace.id === currentWorkspaceId}
                    type="button"
                  >
                    <span className="workspace-option-name">{workspace.name}</span>
                    {workspace.id === currentWorkspaceId ? (
                      <span className="checkmark" aria-hidden="true">✓</span>
                    ) : null}
                  </button>
                ))
              ) : (
                <p className="workspace-empty-menu">暂无 Workspace</p>
              )}
            </div>
            <div className="workspace-menu-actions">
              <button onClick={openCreate} role="menuitem" type="button">
                ＋ 新建 Workspace
              </button>
              <button
                disabled={!currentWorkspace}
                onClick={openRename}
                role="menuitem"
                type="button"
              >
                重命名当前 Workspace
              </button>
              <button
                className="danger-menu-action"
                disabled={!currentWorkspace}
                onClick={() => void openDelete()}
                role="menuitem"
                type="button"
              >
                删除当前 Workspace
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {dialogMode === "create" || dialogMode === "rename" ? (
        <WorkspaceDialog
          closeDisabled={busy}
          description={
            dialogMode === "create"
              ? "创建一个独立的招聘周期。"
              : "修改当前招聘周期的显示名称。"
          }
          onClose={closeDialog}
          title={dialogMode === "create" ? "新建 Workspace" : "重命名 Workspace"}
        >
          <form className="workspace-form" onSubmit={handleWorkspaceForm}>
            <label>
              <span>名称</span>
              <input
                autoFocus
                disabled={busy}
                onChange={(event) => setName(event.target.value)}
                placeholder="例如：2027 秋招"
                required
                value={name}
              />
            </label>
            {dialogMode === "create" ? (
              <label>
                <span>描述 <em>可选</em></span>
                <textarea
                  disabled={busy}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="记录本轮招聘的目标或时间范围"
                  rows={3}
                  value={description}
                />
              </label>
            ) : null}
            {error ? <p className="form-error" role="alert">{error}</p> : null}
            <div className="dialog-actions">
              <button className="secondary-button" disabled={busy} onClick={closeDialog} type="button">
                取消
              </button>
              <button className="primary-button" disabled={busy} type="submit">
                {busy ? "处理中…" : dialogMode === "create" ? "创建" : "保存"}
              </button>
            </div>
          </form>
        </WorkspaceDialog>
      ) : null}

      {dialogMode === "delete" ? (
        <WorkspaceDialog
          closeDisabled={busy}
          description={`你正在删除 ${currentWorkspace?.name ?? "当前 Workspace"}。`}
          onClose={closeDialog}
          title="删除 Workspace"
        >
          {summary ? (
            <div className="delete-summary">
              <p>该 Workspace 包含：</p>
              <div className="delete-counts">
                <div><strong>{summary.jobCount}</strong><span>个岗位</span></div>
                <div><strong>{summary.timelineEventCount}</strong><span>条 Timeline 记录</span></div>
              </div>
              <p className="irreversible-warning">删除后不可恢复。</p>
            </div>
          ) : error ? (
            <p className="form-error" role="alert">{error}</p>
          ) : (
            <p className="loading-copy">正在统计 Workspace 数据…</p>
          )}
          <div className="dialog-actions">
            <button className="secondary-button" disabled={busy} onClick={closeDialog} type="button">
              取消
            </button>
            <button
              className="danger-button"
              disabled={!summary || busy}
              onClick={() => void handleDelete()}
              type="button"
            >
              {busy ? "删除中…" : "确认删除"}
            </button>
          </div>
        </WorkspaceDialog>
      ) : null}
    </>
  );
}
