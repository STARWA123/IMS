import type { EventType } from "../../generated/prisma/client";
import { db } from "../../db/client";
import {
  CompanyOfferConflictError,
  JobNotFoundError,
} from "../job/job-service";
import { stageByTimelineEvent, statusForStage } from "../job/stage-rules";
import type {
  CreateTimelineEventResult,
  TimelineEventInput,
  TimelineEventItem,
} from "./timeline-types";

export class TimelineEventNotFoundError extends Error {
  constructor(timelineEventId: string) {
    super(`TimelineEvent not found: ${timelineEventId}`);
    this.name = "TimelineEventNotFoundError";
  }
}

function normalizeEventDate(value: string | Date): Date {
  const eventDate = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(eventDate.getTime())) {
    throw new TypeError("Timeline 日期无效。");
  }
  return eventDate;
}

function normalizeRemark(value?: string | null): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function serializeTimelineEvent(event: {
  id: string;
  jobId: string;
  eventType: EventType;
  eventDate: Date;
  remark: string | null;
  createdAt: Date;
}): TimelineEventItem {
  return {
    id: event.id,
    jobId: event.jobId,
    eventType: event.eventType,
    eventDate: event.eventDate.toISOString(),
    remark: event.remark,
    createdAt: event.createdAt.toISOString(),
  };
}

export async function listTimelineEvents(
  workspaceId: string,
  jobId: string,
): Promise<TimelineEventItem[]> {
  const job = await db.job.findFirst({
    where: { id: jobId, workspaceId },
    select: { id: true },
  });
  if (!job) {
    throw new JobNotFoundError(jobId);
  }
  const events = await db.timelineEvent.findMany({
    where: { jobId },
    orderBy: [
      { eventDate: "desc" },
      { createdAt: "desc" },
      { id: "asc" },
    ],
  });
  return events.map(serializeTimelineEvent);
}

export async function createTimelineEvent(
  workspaceId: string,
  jobId: string,
  input: TimelineEventInput,
  syncStage: boolean,
): Promise<CreateTimelineEventResult> {
  const eventDate = normalizeEventDate(input.eventDate);
  const remark = normalizeRemark(input.remark);
  const targetStage = stageByTimelineEvent[input.eventType];

  return db.$transaction(async (transaction) => {
    const job = await transaction.job.findFirst({
      where: { id: jobId, workspaceId },
      include: { company: { select: { name: true } } },
    });
    if (!job) {
      throw new JobNotFoundError(jobId);
    }

    if (syncStage && targetStage === "OFFER") {
      const existingOffer = await transaction.job.findFirst({
        where: {
          workspaceId,
          companyId: job.companyId,
          stage: "OFFER",
          id: { not: jobId },
        },
        select: { id: true },
      });
      if (existingOffer) {
        throw new CompanyOfferConflictError(job.company.name);
      }
    }

    const timelineEvent = await transaction.timelineEvent.create({
      data: {
        jobId,
        eventType: input.eventType,
        eventDate,
        remark,
      },
    });
    const jobStatus = syncStage ? statusForStage(targetStage) : null;
    if (syncStage) {
      await transaction.job.update({
        where: { id: jobId },
        data: { stage: targetStage, status: jobStatus! },
      });
    }

    return {
      timelineEvent: serializeTimelineEvent(timelineEvent),
      syncedStage: syncStage ? targetStage : null,
      jobStatus,
    };
  });
}

export async function updateTimelineEvent(
  workspaceId: string,
  jobId: string,
  timelineEventId: string,
  input: TimelineEventInput,
): Promise<TimelineEventItem> {
  const eventDate = normalizeEventDate(input.eventDate);
  const remark = normalizeRemark(input.remark);
  return db.$transaction(async (transaction) => {
    const existingEvent = await transaction.timelineEvent.findFirst({
      where: {
        id: timelineEventId,
        jobId,
        job: { workspaceId },
      },
      select: { id: true },
    });
    if (!existingEvent) {
      throw new TimelineEventNotFoundError(timelineEventId);
    }
    const timelineEvent = await transaction.timelineEvent.update({
      where: { id: timelineEventId },
      data: {
        eventType: input.eventType,
        eventDate,
        remark,
      },
    });
    return serializeTimelineEvent(timelineEvent);
  });
}

export async function deleteTimelineEvent(
  workspaceId: string,
  jobId: string,
  timelineEventId: string,
): Promise<TimelineEventItem> {
  return db.$transaction(async (transaction) => {
    const existingEvent = await transaction.timelineEvent.findFirst({
      where: {
        id: timelineEventId,
        jobId,
        job: { workspaceId },
      },
    });
    if (!existingEvent) {
      throw new TimelineEventNotFoundError(timelineEventId);
    }
    await transaction.timelineEvent.delete({ where: { id: timelineEventId } });
    return serializeTimelineEvent(existingEvent);
  });
}
