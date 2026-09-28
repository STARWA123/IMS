"use client";

import { useRef, useState, type ChangeEvent, type ReactNode } from "react";
import type { AuthUser } from "../../modules/auth/auth-types";
import { readApiError } from "../shared/api-client";
import { DialogShell } from "../shared/dialog-shell";
import { AccountSettings } from "./account-settings";

function RestoreDialog({
  file,
  onClose,
  onRestored,
}: {
  file: File;
  onClose: () => void;
  onRestored: () => void;
}): ReactNode {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function restore(): Promise<void> {
    setSubmitting(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("database", file);
      const response = await fetch("/api/data/restore", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        throw new Error(await readApiError(response));
      }
      onRestored();
    } catch (restoreError: unknown) {
      setError(
        restoreError instanceof Error ? restoreError.message : "数据库恢复失败。",
      );
      setSubmitting(false);
    }
  }

  return (
    <DialogShell
      closeDisabled={submitting}
      description={<span className="restore-file-name">{file.name}</span>}
      onClose={onClose}
      role="alertdialog"
      title="恢复 SQLite 备份"
    >
        <div className="restore-warning">
          <p>恢复后，当前所有 Workspace、岗位和 Timeline 数据将被备份内容替换。</p>
          <p>该操作不可撤销，请确认已选择正确的 OfferTrack 备份文件。</p>
        </div>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <div className="dialog-actions">
          <button className="secondary-button" disabled={submitting} onClick={onClose} type="button">取消</button>
          <button className="danger-button" disabled={submitting} onClick={restore} type="button">
            {submitting ? "正在恢复…" : "确认恢复"}
          </button>
        </div>
    </DialogShell>
  );
}

export function SettingsView({
  currentUser,
  workspaceId,
  workspaceName,
}: {
  currentUser: AuthUser;
  workspaceId: string | null;
  workspaceName: string | null;
}): ReactNode {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restoreComplete, setRestoreComplete] = useState(false);

  function chooseBackup(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0] ?? null;
    setRestoreFile(file);
    event.target.value = "";
  }

  function finishRestore(): void {
    setRestoreComplete(true);
    setRestoreFile(null);
    window.localStorage.removeItem("offertrack.currentWorkspaceId");
    window.setTimeout(() => window.location.reload(), 700);
  }

  return (
    <div className="settings-view">
      <AccountSettings currentUser={currentUser} />
      {restoreComplete ? (
        <div className="settings-success" role="status">数据库恢复成功，正在重新加载 OfferTrack…</div>
      ) : null}

      <section className="content-card settings-section">
        <div className="settings-section-copy">
          <span className="eyebrow">Excel</span>
          <h2>导出当前 Workspace</h2>
          <p>
            导出“{workspaceName ?? "暂无 Workspace"}”的岗位信息和 Timeline，生成两个 Sheet。
          </p>
        </div>
        {workspaceId ? (
          <a
            className="primary-button settings-action"
            href={`/api/workspaces/${workspaceId}/export`}
          >
            导出 Excel
          </a>
        ) : (
          <button className="primary-button settings-action" disabled type="button">导出 Excel</button>
        )}
      </section>

      {currentUser.role === "ADMIN" ? <section className="content-card settings-section">
        <div className="settings-section-copy">
          <span className="eyebrow">SQLite</span>
          <h2>数据库备份</h2>
          <p>导出包含全部 Workspace、岗位和 Timeline 的 SQLite 数据库文件。</p>
        </div>
        <a className="secondary-button settings-action" href="/api/data/backup">导出备份</a>
      </section> : null}

      {currentUser.role === "ADMIN" ? <section className="content-card settings-section settings-danger-section">
        <div className="settings-section-copy">
          <span className="eyebrow danger-eyebrow">Restore</span>
          <h2>恢复备份</h2>
          <p>选择 OfferTrack SQLite 备份文件，验证通过后替换当前数据库。</p>
        </div>
        <input
          accept=".db,application/vnd.sqlite3,application/x-sqlite3"
          className="sr-only"
          onChange={chooseBackup}
          ref={fileInputRef}
          type="file"
        />
        <button
          className="danger-outline-button settings-action"
          onClick={() => fileInputRef.current?.click()}
          type="button"
        >
          恢复备份
        </button>
      </section> : null}

      {restoreFile ? (
        <RestoreDialog
          file={restoreFile}
          onClose={() => setRestoreFile(null)}
          onRestored={finishRestore}
        />
      ) : null}
    </div>
  );
}
