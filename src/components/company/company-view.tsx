"use client";

import { useMemo, type ReactNode } from "react";
import {
  buildCompanyView,
  searchCompanyView,
} from "../../modules/company/company-view-model";
import type { JobItem } from "../../modules/job/job-types";
import { stageLabels } from "../../modules/job/recruitment-presentation";

function formatDate(value: string, compact = false): string {
  return new Intl.DateTimeFormat("zh-CN", compact
    ? { month: "2-digit", day: "2-digit" }
    : {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(value));
}

function ResponsiveDate({ value }: { value: string }): ReactNode {
  return (
    <time dateTime={value}>
      <span className="company-date-full">{formatDate(value)}</span>
      <span className="company-date-compact">{formatDate(value, true)}</span>
    </time>
  );
}

export function CompanyView({
  jobs,
  search,
  expandedCompanyIds,
  onToggleCompany,
  onOpenJob,
  onEditJob,
  onDeleteJob,
}: {
  jobs: JobItem[];
  search: string;
  expandedCompanyIds: ReadonlySet<string>;
  onToggleCompany: (companyId: string) => void;
  onOpenJob: (jobId: string) => void;
  onEditJob: (job: JobItem) => void;
  onDeleteJob: (job: JobItem) => void;
}): ReactNode {
  const companies = useMemo(() => buildCompanyView(jobs), [jobs]);
  const results = useMemo(
    () => searchCompanyView(companies, search),
    [companies, search],
  );

  if (!results.length) {
    const hasSearch = Boolean(search.trim());
    return (
      <div className="section-empty">
        <span className="section-empty-mark" aria-hidden="true">{hasSearch ? "⌕" : "＋"}</span>
        <strong>{hasSearch ? "没有匹配的公司或岗位" : "当前 Workspace 暂无公司和岗位"}</strong>
        <small>{hasSearch ? "尝试调整公司或岗位关键词。" : "点击“新增岗位”录入第一条申请记录。"}</small>
      </div>
    );
  }

  return (
    <div className="company-list">
      {results.map((company) => {
        const isExpanded = expandedCompanyIds.has(company.companyId) || company.matchedByJob;
        const panelId = `company-jobs-${company.companyId}`;
        const highestStageLabel = company.allRejected
          ? "全部淘汰"
          : stageLabels[company.highestStage!];

        return (
          <section className="company-row" key={company.companyId}>
            <button
              aria-controls={panelId}
              aria-expanded={isExpanded}
              className="company-summary"
              onClick={() => onToggleCompany(company.companyId)}
              type="button"
            >
              <span className="company-chevron" aria-hidden="true">›</span>
              <span className="company-summary-name">
                <strong>{company.companyName}</strong>
                <small>最近更新 <ResponsiveDate value={company.updatedAt} /></small>
              </span>
              <span className="company-summary-metric"><small>岗位数</small><strong>{company.jobCount}</strong></span>
              <span className="company-summary-metric"><small>进行中</small><strong>{company.inProgressCount}</strong></span>
              <span className="company-summary-stage"><small>当前最高阶段</small><strong data-all-rejected={company.allRejected || undefined}>{highestStageLabel}</strong></span>
            </button>

            {isExpanded ? (
              <div className="company-jobs" id={panelId}>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr><th>岗位</th><th>Base</th><th>Stage</th><th>更新时间</th><th><span className="sr-only">操作</span></th></tr>
                    </thead>
                    <tbody>
                      {company.visibleJobs.map((job) => (
                        <tr key={job.id}>
                          <td className="job-name-cell"><button className="job-name-link" onClick={() => onOpenJob(job.id)} type="button">{job.jobName}</button></td>
                          <td>{job.baseLocation}</td>
                          <td>{stageLabels[job.stage]}</td>
                          <td><ResponsiveDate value={job.updatedAt} /></td>
                          <td>
                            <div className="row-actions">
                              {job.jobUrl ? <a href={job.jobUrl} rel="noreferrer" target="_blank">打开链接 ↗</a> : null}
                              <button onClick={() => onEditJob(job)} type="button">编辑</button>
                              <button className="row-delete" onClick={() => onDeleteJob(job)} type="button">删除</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
