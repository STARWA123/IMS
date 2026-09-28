import type { EventType, Stage } from "../../generated/prisma/client";

export type JobImportRowStatus = "ready" | "duplicate" | "error";

export type JobImportTimelinePreview = {
  eventType: EventType;
  eventDate: string;
};

export type JobImportPreviewRow = {
  rowNumber: number;
  companyName: string;
  jobName: string;
  finalStage: Stage | null;
  status: JobImportRowStatus;
  message: string;
  timelineEvents: JobImportTimelinePreview[];
  generatedAppliedDate: boolean;
};

export type JobImportPreview = {
  fileName: string;
  workspaceName: string;
  totalRows: number;
  readyRows: number;
  duplicateRows: number;
  errorRows: number;
  timelineEventCount: number;
  generatedAppliedDates: number;
  rows: JobImportPreviewRow[];
};

export type JobImportResult = {
  workspaceName: string;
  importedJobs: number;
  createdTimelineEvents: number;
  reusedCompanies: number;
  createdCompanies: number;
  skippedDuplicates: number;
  generatedAppliedDates: number;
};
