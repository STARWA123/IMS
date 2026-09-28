import type { EventType, Stage, Status } from "../../generated/prisma/client";

export type JobItem = {
  id: string;
  companyId: string;
  companyName: string;
  jobName: string;
  baseLocation: string;
  jobUrl: string | null;
  stage: Stage;
  status: Status;
  remark: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateJobInput = {
  companyName: string;
  jobName: string;
  baseLocation: string;
  jobUrl?: string | null;
  remark?: string | null;
};

export type UpdateJobInput = {
  jobName: string;
  baseLocation: string;
  jobUrl?: string | null;
  remark?: string | null;
};

export type JobDeletionSummary = {
  workspaceId: string;
  jobId: string;
  companyName: string;
  jobName: string;
  timelineEventCount: number;
};

export type CreatedTimelineEvent = {
  id: string;
  jobId: string;
  eventType: EventType;
  eventDate: string;
};

export type MoveJobStageResult = {
  job: JobItem;
  previousStage: Stage;
  timelineEvent: CreatedTimelineEvent | null;
};
