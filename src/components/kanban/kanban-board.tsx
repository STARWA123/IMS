"use client";

import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Stage } from "../../generated/prisma/client";
import type { JobItem } from "../../modules/job/job-types";
import {
  stageLabels,
  stages,
} from "../../modules/job/recruitment-presentation";
import type { WorkspaceScopedData } from "../../modules/workspace/workspace-types";
import { readApiError } from "../shared/api-client";
import { DialogShell } from "../shared/dialog-shell";

type PendingMove = {
  job: JobItem;
  targetStage: Stage;
};

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function KanbanCardContent({
  job,
  onOpenJob,
}: {
  job: JobItem;
  onOpenJob?: (jobId: string) => void;
}): ReactNode {
  return (
    <>
      <div className="job-card-company">{job.companyName}</div>
      <h3>{job.jobName}</h3>
      <div className="job-card-meta">
        <span className="job-location">{job.baseLocation}</span>
        <time dateTime={job.updatedAt}>更新 {formatDate(job.updatedAt)}</time>
      </div>
      {onOpenJob ? (
        <div className={`job-card-actions${job.jobUrl ? " has-link" : ""}`}>
          <button
            className="job-card-detail"
            onClick={() => onOpenJob(job.id)}
            onKeyDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            type="button"
          >
            查看详情
          </button>
          {job.jobUrl ? (
            <a
              className="job-card-link"
              href={job.jobUrl}
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => event.stopPropagation()}
              onPointerDown={(event) => event.stopPropagation()}
              rel="noreferrer"
              target="_blank"
            >
              访问岗位 ↗
            </a>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

function DraggableJobCard({
  job,
  onOpenJob,
}: {
  job: JobItem;
  onOpenJob: (jobId: string) => void;
}): ReactNode {
  const { attributes, isDragging, listeners, setNodeRef } = useDraggable({
    id: job.id,
    data: { job },
  });
  return (
    <article
      aria-label={`${job.companyName} ${job.jobName}，当前阶段${stageLabels[job.stage]}`}
      className={`job-card draggable-job-card${isDragging ? " is-dragging" : ""}`}
      ref={setNodeRef}
      {...listeners}
      {...attributes}
    >
      <KanbanCardContent job={job} onOpenJob={onOpenJob} />
    </article>
  );
}

function KanbanColumn({
  stage,
  jobs,
  onOpenJob,
  scrollResetKey,
}: {
  stage: Stage;
  jobs: JobItem[];
  onOpenJob: (jobId: string) => void;
  scrollResetKey: string;
}): ReactNode {
  const { isOver, setNodeRef } = useDroppable({
    id: stage,
    data: { stage },
  });
  const cardsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (cardsRef.current) {
      cardsRef.current.scrollTop = 0;
    }
  }, [scrollResetKey]);

  return (
    <section
      aria-label={`${stageLabels[stage]}阶段`}
      className={`kanban-column${isOver ? " is-over" : ""}`}
      data-stage={stage}
      ref={setNodeRef}
    >
      <div className="kanban-column-heading">
        <h2><span className="kanban-stage-dot" aria-hidden="true" />{stageLabels[stage]}</h2><span>{jobs.length}</span>
      </div>
      <div
        aria-label={`${stageLabels[stage]}岗位列表，共 ${jobs.length} 个岗位`}
        className="kanban-cards"
        ref={cardsRef}
        role="region"
        tabIndex={jobs.length > 5 ? 0 : undefined}
      >
        {jobs.map((job) => <DraggableJobCard job={job} key={job.id} onOpenJob={onOpenJob} />)}
        {!jobs.length ? <div className="kanban-empty">拖拽岗位至此</div> : null}
      </div>
    </section>
  );
}

function MoveConfirmationDialog({
  move,
  workspaceId,
  onClose,
  onMoved,
}: {
  move: PendingMove;
  workspaceId: string;
  onClose: () => void;
  onMoved: () => void;
}): ReactNode {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm(): Promise<void> {
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/workspaces/${workspaceId}/jobs/${move.job.id}/stage`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stage: move.targetStage }),
        },
      );
      if (!response.ok) {
        throw new Error(await readApiError(response));
      }
      onMoved();
      onClose();
    } catch (requestError: unknown) {
      setError(
        requestError instanceof Error ? requestError.message : "岗位移动失败。",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DialogShell
      closeDisabled={submitting}
      description={`${move.job.companyName} · ${move.job.jobName}`}
      onClose={onClose}
      title="确认移动岗位"
    >
        <div className="move-stage-flow" aria-label="Stage 变化">
          <div><span>原 Stage</span><strong>{stageLabels[move.job.stage]}</strong></div>
          <span aria-hidden="true">→</span>
          <div><span>目标 Stage</span><strong>{stageLabels[move.targetStage]}</strong></div>
        </div>
        <p className="move-rule-note">
          确认后将自动生成对应 Timeline；目标列表示该阶段已经完成。
        </p>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <div className="dialog-actions">
          <button className="secondary-button" disabled={submitting} onClick={onClose} type="button">取消</button>
          <button className="primary-button" disabled={submitting} onClick={handleConfirm} type="button">
            {submitting ? "移动中…" : "确认移动"}
          </button>
        </div>
    </DialogShell>
  );
}

export function KanbanBoard({
  data,
  workspaceId,
  onChanged,
  onOpenJob,
}: {
  data: WorkspaceScopedData;
  workspaceId: string;
  onChanged: () => void;
  onOpenJob: (jobId: string) => void;
}): ReactNode {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );
  const [search, setSearch] = useState("");
  const [activeJob, setActiveJob] = useState<JobItem | null>(null);
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);
  const filteredJobs = useMemo(() => {
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

  useEffect(() => {
    setSearch("");
    setActiveJob(null);
    setPendingMove(null);
  }, [workspaceId]);

  function handleDragStart(event: DragStartEvent): void {
    const job = data.jobs.find((item) => item.id === event.active.id) ?? null;
    setActiveJob(job);
  }

  function handleDragEnd(event: DragEndEvent): void {
    const job = data.jobs.find((item) => item.id === event.active.id) ?? null;
    const targetStage = event.over?.data.current?.stage as Stage | undefined;
    setActiveJob(null);
    if (!job || !targetStage || job.stage === targetStage) {
      return;
    }
    setPendingMove({ job, targetStage });
  }

  return (
    <section className="kanban-view">
      <div className="kanban-toolbar">
        <div>
          <span className="eyebrow">Kanban</span>
          <h2>招聘看板</h2>
          <span className="section-count">
            {search.trim()
              ? `${filteredJobs.length} 个匹配岗位`
              : `${filteredJobs.length} 个岗位`}
          </span>
        </div>
        <label className="job-search kanban-search">
          <span aria-hidden="true">⌕</span>
          <input
            aria-label="搜索看板岗位"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="搜索公司、岗位或 Base"
            type="search"
            value={search}
          />
        </label>
      </div>
      <DndContext
        collisionDetection={closestCenter}
        onDragCancel={() => setActiveJob(null)}
        onDragEnd={handleDragEnd}
        onDragStart={handleDragStart}
        sensors={sensors}
      >
        <div className="kanban-board" aria-label="招聘看板 Stage 列">
          {stages.map((stage) => (
            <KanbanColumn
              jobs={filteredJobs.filter((job) => job.stage === stage)}
              key={stage}
              onOpenJob={onOpenJob}
              scrollResetKey={`${workspaceId}:${search}`}
              stage={stage}
            />
          ))}
        </div>
        <DragOverlay>
          {activeJob ? (
            <article className="job-card drag-overlay-card">
              <KanbanCardContent job={activeJob} />
            </article>
          ) : null}
        </DragOverlay>
      </DndContext>
      {pendingMove ? (
        <MoveConfirmationDialog
          key={`${pendingMove.job.id}-${pendingMove.targetStage}`}
          move={pendingMove}
          onClose={() => setPendingMove(null)}
          onMoved={onChanged}
          workspaceId={workspaceId}
        />
      ) : null}
    </section>
  );
}
