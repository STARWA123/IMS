"use client";

import { useState, type ReactNode } from "react";
import { stageLabels, timelineEventLabels } from "../../modules/job/recruitment-presentation";
import { stageByTimelineEvent } from "../../modules/job/stage-rules";
import type { TimelineEventInput } from "../../modules/timeline/timeline-types";
import { DialogShell } from "../shared/dialog-shell";

export function TimelineSyncDialog({
  input,
  onBack,
  onSave,
}: {
  input: TimelineEventInput;
  onBack: () => void;
  onSave: (syncStage: boolean) => Promise<void>;
}): ReactNode {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const targetStage = stageByTimelineEvent[input.eventType];

  async function handleSave(syncStage: boolean): Promise<void> {
    setSubmitting(true);
    setError(null);
    try {
      await onSave(syncStage);
    } catch (saveError: unknown) {
      setError(
        saveError instanceof Error ? saveError.message : "Timeline 保存失败。",
      );
      setSubmitting(false);
    }
  }

  return (
    <DialogShell
      closeDisabled={submitting}
      description={`Timeline 将新增“${timelineEventLabels[input.eventType]}”。`}
      onClose={onBack}
      showClose={false}
      title="是否同步更新岗位 Stage？"
    >
        <div className="timeline-sync-target">
          <span>对应 Stage</span>
          <strong>{stageLabels[targetStage]}</strong>
        </div>
        <p className="move-rule-note">
          同步后，岗位所在列将表示对应阶段已经完成。
        </p>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <div className="dialog-actions timeline-sync-actions">
          <button className="secondary-button" disabled={submitting} onClick={onBack} type="button">返回编辑</button>
          <button className="secondary-button" disabled={submitting} onClick={() => handleSave(false)} type="button">仅新增 Timeline</button>
          <button className="primary-button" disabled={submitting} onClick={() => handleSave(true)} type="button">
            {submitting ? "保存中…" : "新增并同步 Stage"}
          </button>
        </div>
    </DialogShell>
  );
}
