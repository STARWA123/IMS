"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { JobDeletionSummary, JobItem } from "../../modules/job/job-types";
import { readApiError } from "../shared/api-client";
import { DialogShell } from "../shared/dialog-shell";

type JobDeleteDialogProps = {
  workspaceId: string;
  job: JobItem;
  onClose: () => void;
  onDeleted: () => void;
};

export function JobDeleteDialog({
  workspaceId,
  job,
  onClose,
  onDeleted,
}: JobDeleteDialogProps): ReactNode {
  const [summary, setSummary] = useState<JobDeletionSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/workspaces/${workspaceId}/jobs/${job.id}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(await readApiError(response));
        }
        return (await response.json()) as { summary: JobDeletionSummary };
      })
      .then((body) => setSummary(body.summary))
      .catch((requestError: unknown) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") {
          return;
        }
        setError(
          requestError instanceof Error
            ? requestError.message
            : "无法读取岗位删除信息。",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [job.id, workspaceId]);

  async function handleDelete(): Promise<void> {
    setDeleting(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/workspaces/${workspaceId}/jobs/${job.id}`,
        { method: "DELETE" },
      );
      if (!response.ok) {
        throw new Error(await readApiError(response));
      }
      onDeleted();
      onClose();
    } catch (requestError: unknown) {
      setError(
        requestError instanceof Error ? requestError.message : "岗位删除失败。",
      );
    } finally {
      setDeleting(false);
    }
  }

  return (
    <DialogShell
      closeDisabled={deleting}
      description={`${job.companyName} · ${job.jobName}`}
      onClose={onClose}
      role="alertdialog"
      title="删除岗位"
    >
        {loading ? <p className="loading-copy">正在统计 Timeline 记录…</p> : null}
        {summary ? (
          <div className="job-delete-summary">
            <p>该岗位包含 <strong>{summary.timelineEventCount}</strong> 条 Timeline 记录。</p>
            <p className="irreversible-warning">删除后不可恢复。</p>
          </div>
        ) : null}
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <div className="dialog-actions">
          <button className="secondary-button" disabled={deleting} onClick={onClose} type="button">取消</button>
          <button className="danger-button" disabled={!summary || deleting} onClick={handleDelete} type="button">
            {deleting ? "删除中…" : "确认删除"}
          </button>
        </div>
    </DialogShell>
  );
}
