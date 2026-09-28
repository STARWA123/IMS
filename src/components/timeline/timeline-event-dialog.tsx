"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import type { EventType } from "../../generated/prisma/client";
import {
  eventTypes,
  timelineEventLabels,
} from "../../modules/job/recruitment-presentation";
import type {
  TimelineEventInput,
  TimelineEventItem,
} from "../../modules/timeline/timeline-types";
import { DialogShell } from "../shared/dialog-shell";

function toDateTimeLocal(value?: string): string {
  const date = value ? new Date(value) : new Date();
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 16);
}

export function TimelineEventDialog({
  timelineEvent,
  onClose,
  onSubmit,
}: {
  timelineEvent?: TimelineEventItem;
  onClose: () => void;
  onSubmit: (input: TimelineEventInput) => Promise<void>;
}): ReactNode {
  const editing = Boolean(timelineEvent);
  const [eventType, setEventType] = useState<EventType>(
    timelineEvent?.eventType ?? "APPLIED",
  );
  const [eventDate, setEventDate] = useState(
    toDateTimeLocal(timelineEvent?.eventDate),
  );
  const [remark, setRemark] = useState(timelineEvent?.remark ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        eventType,
        eventDate: new Date(eventDate).toISOString(),
        remark,
      });
      onClose();
    } catch (submitError: unknown) {
      setError(
        submitError instanceof Error ? submitError.message : "Timeline 保存失败。",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DialogShell
      closeDisabled={submitting}
      description={editing ? "修改事件日期、类型或备注。" : "保存前将询问是否同步更新岗位 Stage。"}
      onClose={onClose}
      title={editing ? "编辑 Timeline" : "新增 Timeline"}
    >
        <form className="timeline-form" onSubmit={handleSubmit}>
          <label>
            事件类型
            <select
              autoFocus
              onChange={(event) => setEventType(event.target.value as EventType)}
              value={eventType}
            >
              {eventTypes.map((type) => (
                <option key={type} value={type}>{timelineEventLabels[type]}</option>
              ))}
            </select>
          </label>
          <label>
            日期
            <input
              onChange={(event) => setEventDate(event.target.value)}
              required
              type="datetime-local"
              value={eventDate}
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
              {submitting ? "处理中…" : editing ? "保存修改" : "下一步"}
            </button>
          </div>
        </form>
    </DialogShell>
  );
}

export { timelineEventLabels };
