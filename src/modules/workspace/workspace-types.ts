import type { EventType } from "../../generated/prisma/client";
import type { JobItem } from "../job/job-types";

export type WorkspaceItem = {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WorkspaceDeletionSummary = {
  workspaceId: string;
  workspaceName: string;
  jobCount: number;
  timelineEventCount: number;
};

export type WorkspaceJobItem = JobItem;

export type WorkspaceTimelineItem = {
  id: string;
  jobId: string;
  companyName: string;
  jobName: string;
  eventType: EventType;
  eventDate: string;
  remark: string | null;
};

export type DashboardDurationMetric = {
  averageHours: number | null;
  sampleSize: number;
};

export type WorkspaceScopedData = {
  workspaceId: string;
  metrics: {
    companyCount: number;
    jobCount: number;
    interviewEntryCount: number;
    interviewEntryRate: number;
    offerCount: number;
    offerCompanyConversionRate: number;
  };
  funnel: {
    applied: number;
    firstInterview: number;
    secondInterview: number;
    offer: number;
  };
  processDurations: {
    appliedToFirstInterview: DashboardDurationMetric;
    firstToSecondInterview: DashboardDurationMetric;
    secondInterviewToOffer: DashboardDurationMetric;
  };
  jobs: WorkspaceJobItem[];
  recentActivity: WorkspaceTimelineItem[];
};
