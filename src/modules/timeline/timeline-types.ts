import type { EventType, Stage, Status } from "../../generated/prisma/client";

export type TimelineEventItem = {
  id: string;
  jobId: string;
  eventType: EventType;
  eventDate: string;
  remark: string | null;
  createdAt: string;
};

export type TimelineEventInput = {
  eventType: EventType;
  eventDate: string | Date;
  remark?: string | null;
};

export type CreateTimelineEventResult = {
  timelineEvent: TimelineEventItem;
  syncedStage: Stage | null;
  jobStatus: Status | null;
};
