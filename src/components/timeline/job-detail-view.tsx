"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { JobItem } from "../../modules/job/job-types";
import {
  stageLabels,
  timelineEventLabels,
} from "../../modules/job/recruitment-presentation";
import type {
  TimelineEventInput,
  TimelineEventItem,
} from "../../modules/timeline/timeline-types";
import { readApiError } from "../shared/api-client";
import { DialogShell } from "../shared/dialog-shell";
import { TimelineEventDialog } from "./timeline-event-dialog";
import { TimelineSyncDialog } from "./timeline-sync-dialog";

function formatEventDate(value: string): { date: string; time: string } {
  const date = new Date(value);
  return {
    date: new Intl.DateTimeFormat("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date),
    time: new Intl.DateTimeFormat("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(date),
  };
}

function DeleteTimelineDialog({
  timelineEvent,
  onClose,
  onDeleted,
}: {
  timelineEvent: TimelineEventItem;
  onClose: () => void;
  onDeleted: () => Promise<void>;
}): ReactNode {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete(): Promise<void> {
    setSubmitting(true);
    setError(null);
    try {
      await onDeleted();
      onClose();
    } catch (deleteError: unknown) {
      setError(
        deleteError instanceof Error ? deleteError.message : "Timeline 删除失败。",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DialogShell
      closeDisabled={submitting}
      description={timelineEventLabels[timelineEvent.eventType]}
      onClose={onClose}
      role="alertdialog"
      title="删除 Timeline"
    >
        <div className="job-delete-summary">
          <p>该 Timeline 记录将被删除。</p>
          <p className="irreversible-warning">删除后不可恢复，岗位 Stage 不会回滚。</p>
        </div>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <div className="dialog-actions">
          <button className="secondary-button" disabled={submitting} onClick={onClose} type="button">取消</button>
          <button className="danger-button" disabled={submitting} onClick={handleDelete} type="button">{submitting ? "删除中…" : "确认删除"}</button>
        </div>
    </DialogShell>
  );
}

export function JobDetailView({
  job,
  workspaceId,
  backLabel = "返回岗位列表",
  onBack,
  onChanged,
}: {
  job: JobItem;
  workspaceId: string;
  backLabel?: string;
  onBack: () => void;
  onChanged: () => void;
}): ReactNode {
  const [timeline, setTimeline] = useState<TimelineEventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [creating, setCreating] = useState(false);
  const [editingEvent, setEditingEvent] = useState<TimelineEventItem | null>(null);
  const [deletingEvent, setDeletingEvent] = useState<TimelineEventItem | null>(null);
  const [pendingCreate, setPendingCreate] = useState<TimelineEventInput | null>(null);
  const endpoint = `/api/workspaces/${workspaceId}/jobs/${job.id}/timeline`;

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetch(endpoint, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(await readApiError(response));
        }
        return (await response.json()) as { timeline: TimelineEventItem[] };
      })
      .then((body) => setTimeline(body.timeline))
      .catch((requestError: unknown) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") {
          return;
        }
        setError(
          requestError instanceof Error ? requestError.message : "Timeline 加载失败。",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [endpoint, version]);

  function refreshAll(): void {
    setVersion((current) => current + 1);
    onChanged();
  }

  async function saveNewTimeline(syncStage: boolean): Promise<void> {
    if (!pendingCreate) {
      return;
    }
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...pendingCreate, syncStage }),
    });
    if (!response.ok) {
      throw new Error(await readApiError(response));
    }
    setPendingCreate(null);
    refreshAll();
  }

  async function updateEvent(input: TimelineEventInput): Promise<void> {
    if (!editingEvent) {
      return;
    }
    const response = await fetch(`${endpoint}/${editingEvent.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!response.ok) {
      throw new Error(await readApiError(response));
    }
    refreshAll();
  }

  async function deleteEvent(timelineEventId: string): Promise<void> {
    const response = await fetch(`${endpoint}/${timelineEventId}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      throw new Error(await readApiError(response));
    }
    refreshAll();
  }

  return (
    <div className="job-detail-view">
      <button className="back-button" onClick={onBack} type="button">← {backLabel}</button>
      <section className="job-detail-header">
        <div>
          <span className="eyebrow">{job.companyName}</span>
          <h2>{job.jobName}</h2>
          <p>{job.baseLocation}{job.remark ? ` · ${job.remark}` : ""}</p>
        </div>
        <div className="job-detail-badges">
          <span>{stageLabels[job.stage]}</span>
          {job.jobUrl ? <a href={job.jobUrl} rel="noreferrer" target="_blank">岗位链接 ↗</a> : null}
        </div>
      </section>
      <section className="content-card timeline-card">
        <div className="section-heading timeline-heading">
          <div><span className="eyebrow">Timeline</span><h2>招聘进程</h2></div>
          <div><span className="section-count">{timeline.length} 条记录</span><button className="primary-button add-timeline-button" onClick={() => setCreating(true)} type="button">＋ 新增 Timeline</button></div>
        </div>
        {loading ? (
          <div className="timeline-loading"><span className="loading-spinner" aria-hidden="true" />正在加载 Timeline…</div>
        ) : error ? (
          <div className="timeline-error" role="alert"><span>{error}</span><button className="secondary-button state-action" onClick={() => setVersion((current) => current + 1)} type="button">重试</button></div>
        ) : timeline.length ? (
          <ol className="timeline-list">
            {timeline.map((event) => {
              const formatted = formatEventDate(event.eventDate);
              return (
                <li key={event.id}>
                  <div className="timeline-date"><strong>{formatted.date}</strong><span>{formatted.time}</span></div>
                  <span className="timeline-node" data-event-type={event.eventType} aria-hidden="true" />
                  <div className="timeline-content">
                    <strong>{timelineEventLabels[event.eventType]}</strong>
                    <p>{event.remark ?? "无备注"}</p>
                  </div>
                  <div className="timeline-actions">
                    <button onClick={() => setEditingEvent(event)} type="button">编辑</button>
                    <button className="row-delete" onClick={() => setDeletingEvent(event)} type="button">删除</button>
                  </div>
                </li>
              );
            })}
          </ol>
        ) : (
          <div className="section-empty">
            <span className="section-empty-mark" aria-hidden="true">＋</span>
            <strong>该岗位暂无 Timeline 记录</strong>
            <small>新增事件后，将按日期倒序展示完整招聘进程。</small>
          </div>
        )}
      </section>
      {creating ? (
        <TimelineEventDialog
          key="create-timeline"
          onClose={() => setCreating(false)}
          onSubmit={async (input) => setPendingCreate(input)}
        />
      ) : null}
      {pendingCreate ? (
        <TimelineSyncDialog
          input={pendingCreate}
          onBack={() => {
            setPendingCreate(null);
            setCreating(true);
          }}
          onSave={saveNewTimeline}
        />
      ) : null}
      {editingEvent ? (
        <TimelineEventDialog
          key={editingEvent.id}
          onClose={() => setEditingEvent(null)}
          onSubmit={updateEvent}
          timelineEvent={editingEvent}
        />
      ) : null}
      {deletingEvent ? (
        <DeleteTimelineDialog
          key={deletingEvent.id}
          onClose={() => setDeletingEvent(null)}
          onDeleted={() => deleteEvent(deletingEvent.id)}
          timelineEvent={deletingEvent}
        />
      ) : null}
    </div>
  );
}
