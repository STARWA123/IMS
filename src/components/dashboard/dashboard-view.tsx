import type { ReactNode } from "react";
import { timelineEventLabels } from "../../modules/job/recruitment-presentation";
import type { WorkspaceScopedData } from "../../modules/workspace/workspace-types";

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDuration(averageHours: number | null): string {
  if (averageHours === null) {
    return "暂无数据";
  }
  if (averageHours >= 24) {
    const days = Math.round((averageHours / 24) * 10) / 10;
    return `${days} 天`;
  }
  return `${averageHours} 小时`;
}

export function DashboardView({
  data,
}: {
  data: WorkspaceScopedData;
}): ReactNode {
  const metrics = [
    { label: "投递公司数量", value: data.metrics.companyCount, tone: "primary" },
    { label: "投递岗位数量", value: data.metrics.jobCount, tone: "primary" },
    { label: "进入面试岗位数量", value: data.metrics.interviewEntryCount, tone: "primary" },
    { label: "面试进入率", value: `${data.metrics.interviewEntryRate}%`, tone: "primary" },
    { label: "Offer 数量", value: data.metrics.offerCount, tone: "success" },
    { label: "Offer 公司转化率", value: `${data.metrics.offerCompanyConversionRate}%`, tone: "success" },
  ] as const;

  const funnel = [
    ["投递", data.funnel.applied],
    ["一面", data.funnel.firstInterview],
    ["二面", data.funnel.secondInterview],
    ["Offer", data.funnel.offer],
  ] as const;
  const funnelMaximum = Math.max(data.funnel.applied, 1);

  const durations = [
    ["投递 → 一面", data.processDurations.appliedToFirstInterview],
    ["一面 → 二面", data.processDurations.firstToSecondInterview],
    ["二面 → Offer", data.processDurations.secondInterviewToOffer],
  ] as const;

  return (
    <div className="dashboard-view">
      <section className="metric-grid" aria-label="招聘统计">
        {metrics.map((metric, index) => (
          <article className={`metric-card metric-card-${metric.tone}`} key={metric.label}>
            <div className="metric-card-label">
              <span className="metric-index" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
              <span>{metric.label}</span>
            </div>
            <strong>{metric.value}</strong>
          </article>
        ))}
      </section>

      {data.metrics.jobCount === 0 ? (
        <section className="dashboard-empty-note" aria-label="Dashboard 空状态">
          <span aria-hidden="true">＋</span>
          <div><strong>从第一个岗位开始</strong><p>在岗位列表中新建岗位后，Dashboard 会自动生成统计、漏斗和最近活动。</p></div>
        </section>
      ) : null}

      <div className="dashboard-panels">
        <section className="content-card dashboard-panel" aria-labelledby="funnel-title">
          <div className="section-heading">
            <div><span className="eyebrow">Funnel</span><h2 id="funnel-title">招聘漏斗</h2></div>
          </div>
          <ol className="funnel-list">
            {funnel.map(([label, count], index) => (
              <li key={label}>
                <div className="funnel-step">
                  <span>{label}</span>
                  <strong>{count}</strong>
                </div>
                <div className="funnel-track" aria-hidden="true">
                  <span style={{ width: `${(count / funnelMaximum) * 100}%` }} />
                </div>
                {index < funnel.length - 1 ? <span className="funnel-arrow" aria-hidden="true">↓</span> : null}
              </li>
            ))}
          </ol>
        </section>

        <section className="content-card dashboard-panel" aria-labelledby="duration-title">
          <div className="section-heading">
            <div><span className="eyebrow">Timeline</span><h2 id="duration-title">平均流程耗时</h2></div>
          </div>
          <div className="duration-list">
            {durations.map(([label, duration]) => (
              <article key={label}>
                <span>{label}</span>
                <strong>{formatDuration(duration.averageHours)}</strong>
                <small>{duration.sampleSize ? `${duration.sampleSize} 个岗位样本` : "暂无完整 Timeline 样本"}</small>
              </article>
            ))}
          </div>
        </section>
      </div>

      <section className="content-card recent-activity">
        <div className="section-heading">
          <div><span className="eyebrow">Timeline</span><h2>最近活动</h2></div>
          <span className="section-count">{data.recentActivity.length} 条</span>
        </div>
        {data.recentActivity.length ? (
          <ul>
            {data.recentActivity.map((event) => (
              <li key={event.id}>
                <span className="activity-dot" aria-hidden="true" />
                <div className="activity-content">
                  <div><strong>{event.companyName}</strong><span>{event.jobName} · {timelineEventLabels[event.eventType]}</span></div>
                  {event.remark ? <p>{event.remark}</p> : null}
                </div>
                <time dateTime={event.eventDate}>{formatDate(event.eventDate)}</time>
              </li>
            ))}
          </ul>
        ) : (
          <div className="section-empty">当前 Workspace 暂无 Timeline 记录。</div>
        )}
      </section>
    </div>
  );
}
