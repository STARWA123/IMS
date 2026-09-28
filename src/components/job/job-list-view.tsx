"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { JobItem } from "../../modules/job/job-types";
import { stageLabels } from "../../modules/job/recruitment-presentation";
import type { WorkspaceScopedData } from "../../modules/workspace/workspace-types";
import { JobDeleteDialog } from "./job-delete-dialog";
import { JobDialog } from "./job-dialog";
import { JobImportDialog } from "./job-import-dialog";

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function JobListView({
  data,
  workspaceId,
  workspaceName,
  onChanged,
  onOpenJob,
}: {
  data: WorkspaceScopedData;
  workspaceId: string;
  workspaceName: string;
  onChanged: () => void;
  onOpenJob: (jobId: string) => void;
}): ReactNode {
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [editingJob, setEditingJob] = useState<JobItem | null>(null);
  const [deletingJob, setDeletingJob] = useState<JobItem | null>(null);

  useEffect(() => {
    setSearch("");
    setCreating(false);
    setImporting(false);
    setEditingJob(null);
    setDeletingJob(null);
  }, [workspaceId]);

  const jobs = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("zh-CN");
    if (!query) {
      return data.jobs;
    }
    return data.jobs.filter((job) =>
      [job.companyName, job.jobName, job.baseLocation].some((value) =>
        value.toLocaleLowerCase("zh-CN").includes(query),
      ),
    );
  }, [data.jobs, search]);

  return (
    <>
      <section className="content-card jobs-table-card">
        <div className="jobs-toolbar">
          <div>
            <span className="eyebrow">Jobs</span>
            <h2>岗位列表</h2>
            <span className="section-count">
              {search.trim() ? `${jobs.length} 个匹配岗位` : `${jobs.length} 个岗位`}
            </span>
          </div>
          <div className="jobs-toolbar-actions">
            <label className="job-search">
              <span aria-hidden="true">⌕</span>
              <input
                aria-label="搜索岗位"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="搜索公司、岗位或 Base"
                type="search"
                value={search}
              />
            </label>
            <button className="secondary-button import-job-button" onClick={() => setImporting(true)} type="button">导入 Excel</button>
            <button className="primary-button add-job-button" onClick={() => setCreating(true)} type="button">＋ 新增岗位</button>
          </div>
        </div>
        {jobs.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>公司</th><th>岗位</th><th>Base</th><th>Stage</th><th>更新时间</th><th><span className="sr-only">操作</span></th></tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.id}>
                    <td>{job.companyName}</td>
                    <td className="job-name-cell"><button className="job-name-link" onClick={() => onOpenJob(job.id)} type="button">{job.jobName}</button></td>
                    <td>{job.baseLocation}</td>
                    <td>{stageLabels[job.stage]}</td>
                    <td><time dateTime={job.updatedAt}>{formatDate(job.updatedAt)}</time></td>
                    <td>
                      <div className="row-actions">
                        {job.jobUrl ? (
                          <a href={job.jobUrl} rel="noreferrer" target="_blank">打开链接 ↗</a>
                        ) : null}
                        <button onClick={() => setEditingJob(job)} type="button">编辑</button>
                        <button className="row-delete" onClick={() => setDeletingJob(job)} type="button">删除</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="section-empty">
            <span className="section-empty-mark" aria-hidden="true">{search.trim() ? "⌕" : "＋"}</span>
            <strong>{search.trim() ? "没有匹配的岗位" : "当前 Workspace 暂无岗位"}</strong>
            <small>{search.trim() ? "尝试调整公司、岗位或 Base 关键词。" : "点击“新增岗位”录入第一条申请记录。"}</small>
          </div>
        )}
      </section>
      {creating ? (
        <JobDialog
          key="create-job"
          onClose={() => setCreating(false)}
          onSaved={onChanged}
          workspaceId={workspaceId}
        />
      ) : null}
      {importing ? (
        <JobImportDialog
          onClose={() => setImporting(false)}
          onImported={onChanged}
          workspaceId={workspaceId}
          workspaceName={workspaceName}
        />
      ) : null}
      {editingJob ? (
        <JobDialog
          job={editingJob}
          key={editingJob.id}
          onClose={() => setEditingJob(null)}
          onSaved={onChanged}
          workspaceId={workspaceId}
        />
      ) : null}
      {deletingJob ? (
        <JobDeleteDialog
          job={deletingJob}
          onClose={() => setDeletingJob(null)}
          onDeleted={onChanged}
          workspaceId={workspaceId}
        />
      ) : null}
    </>
  );
}
