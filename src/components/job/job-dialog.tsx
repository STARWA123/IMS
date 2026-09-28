"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import type { JobItem } from "../../modules/job/job-types";
import { readApiError } from "../shared/api-client";
import { DialogShell } from "../shared/dialog-shell";

type JobDialogProps = {
  workspaceId: string;
  job?: JobItem;
  onClose: () => void;
  onSaved: () => void;
};

export function JobDialog({
  workspaceId,
  job,
  onClose,
  onSaved,
}: JobDialogProps): ReactNode {
  const editing = Boolean(job);
  const [companyName, setCompanyName] = useState(job?.companyName ?? "");
  const [jobName, setJobName] = useState(job?.jobName ?? "");
  const [baseLocation, setBaseLocation] = useState(job?.baseLocation ?? "");
  const [jobUrl, setJobUrl] = useState(job?.jobUrl ?? "");
  const [remark, setRemark] = useState(job?.remark ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(
        editing
          ? `/api/workspaces/${workspaceId}/jobs/${job!.id}`
          : `/api/workspaces/${workspaceId}/jobs`,
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(editing ? {} : { companyName }),
            jobName,
            baseLocation,
            jobUrl,
            remark,
          }),
        },
      );
      if (!response.ok) {
        throw new Error(await readApiError(response));
      }
      onSaved();
      onClose();
    } catch (requestError: unknown) {
      setError(
        requestError instanceof Error ? requestError.message : "岗位保存失败。",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DialogShell
      className="job-dialog-card"
      closeDisabled={submitting}
      description={editing
        ? "更新岗位信息，公司、阶段和状态保持不变。"
        : "保存后会自动记录一条当前时间的“投递提交”Timeline。"}
      onClose={onClose}
      title={editing ? "编辑岗位" : "新增岗位"}
    >
        <form className="job-form" onSubmit={handleSubmit}>
          {!editing ? (
            <label>
              公司名称
              <input
                autoFocus
                onChange={(event) => setCompanyName(event.target.value)}
                required
                value={companyName}
              />
            </label>
          ) : (
            <div className="readonly-field">
              <span>公司名称</span>
              <strong>{job!.companyName}</strong>
            </div>
          )}
          <label>
            岗位名称
            <input
              autoFocus={editing}
              onChange={(event) => setJobName(event.target.value)}
              required
              value={jobName}
            />
          </label>
          <label>
            Base 地点
            <input
              onChange={(event) => setBaseLocation(event.target.value)}
              required
              value={baseLocation}
            />
          </label>
          <label>
            岗位链接 <em>可选</em>
            <input
              onChange={(event) => setJobUrl(event.target.value)}
              placeholder="https://"
              type="url"
              value={jobUrl}
            />
          </label>
          <label>
            备注 <em>可选</em>
            <textarea
              onChange={(event) => setRemark(event.target.value)}
              rows={4}
              value={remark}
            />
          </label>
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <div className="dialog-actions">
            <button className="secondary-button" disabled={submitting} onClick={onClose} type="button">取消</button>
            <button className="primary-button" disabled={submitting} type="submit">
              {submitting ? "保存中…" : editing ? "保存修改" : "创建岗位"}
            </button>
          </div>
        </form>
    </DialogShell>
  );
}
