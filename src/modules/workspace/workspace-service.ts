import type { EventType, Prisma, Stage } from "../../generated/prisma/client";
import { db } from "../../db/client";
import type {
  WorkspaceDeletionSummary,
  WorkspaceItem,
  WorkspaceScopedData,
} from "./workspace-types";

export class WorkspaceNotFoundError extends Error {
  constructor(workspaceId: string) {
    super(`Workspace not found: ${workspaceId}`);
    this.name = "WorkspaceNotFoundError";
  }
}

function normalizeName(name: string): string {
  const normalized = name.trim();
  if (!normalized) {
    throw new TypeError("Workspace 名称不能为空。");
  }
  return normalized;
}

function normalizeDescription(description?: string | null): string | null {
  const normalized = description?.trim();
  return normalized ? normalized : null;
}

function serializeWorkspace(workspace: {
  id: string;
  name: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}): WorkspaceItem {
  return {
    ...workspace,
    createdAt: workspace.createdAt.toISOString(),
    updatedAt: workspace.updatedAt.toISOString(),
  };
}

export async function listWorkspaces(ownerId: string): Promise<WorkspaceItem[]> {
  const workspaces = await db.workspace.findMany({
    where: { ownerId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  return workspaces.map(serializeWorkspace);
}

export async function createWorkspace(input: {
  ownerId: string;
  name: string;
  description?: string | null;
}): Promise<WorkspaceItem> {
  const workspace = await db.workspace.create({
    data: {
      ownerId: input.ownerId,
      name: normalizeName(input.name),
      description: normalizeDescription(input.description),
    },
  });
  return serializeWorkspace(workspace);
}

export async function renameWorkspace(
  ownerId: string,
  workspaceId: string,
  name: string,
): Promise<WorkspaceItem> {
  const existing = await db.workspace.findUnique({
    where: { id: workspaceId, ownerId },
    select: { id: true },
  });
  if (!existing) {
    throw new WorkspaceNotFoundError(workspaceId);
  }

  const workspace = await db.workspace.update({
    where: { id: workspaceId },
    data: { name: normalizeName(name) },
  });
  return serializeWorkspace(workspace);
}

export async function getWorkspaceDeletionSummary(
  ownerId: string,
  workspaceId: string,
): Promise<WorkspaceDeletionSummary> {
  const workspace = await db.workspace.findUnique({
    where: { id: workspaceId, ownerId },
    select: { id: true, name: true },
  });
  if (!workspace) {
    throw new WorkspaceNotFoundError(workspaceId);
  }

  const [jobCount, timelineEventCount] = await Promise.all([
    db.job.count({ where: { workspaceId } }),
    db.timelineEvent.count({ where: { job: { workspaceId } } }),
  ]);

  return {
    workspaceId,
    workspaceName: workspace.name,
    jobCount,
    timelineEventCount,
  };
}

export async function deleteWorkspace(
  ownerId: string,
  workspaceId: string,
): Promise<WorkspaceDeletionSummary> {
  return db.$transaction(async (transaction) => {
    const workspace = await transaction.workspace.findUnique({
      where: { id: workspaceId, ownerId },
      select: { id: true, name: true },
    });
    if (!workspace) {
      throw new WorkspaceNotFoundError(workspaceId);
    }

    const [jobCount, timelineEventCount] = await Promise.all([
      transaction.job.count({ where: { workspaceId } }),
      transaction.timelineEvent.count({ where: { job: { workspaceId } } }),
    ]);

    await transaction.workspace.delete({ where: { id: workspaceId } });

    return {
      workspaceId,
      workspaceName: workspace.name,
      jobCount,
      timelineEventCount,
    };
  });
}

const interviewStages = [
  "FIRST_INTERVIEW",
  "SECOND_INTERVIEW",
  "THIRD_INTERVIEW",
  "HR_INTERVIEW",
  "OFFER",
] as const;

const secondInterviewStages = [
  "SECOND_INTERVIEW",
  "THIRD_INTERVIEW",
  "HR_INTERVIEW",
  "OFFER",
] as const;

type DurationTimelineEvent = {
  eventType: EventType;
  eventDate: Date;
};

function isStageIn(
  stage: Stage,
  stages: readonly Stage[],
): boolean {
  return stages.includes(stage);
}

function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

function calculateAverageDuration(
  jobs: { timelineEvents: DurationTimelineEvent[] }[],
  startType: EventType,
  endType: EventType,
): { averageHours: number | null; sampleSize: number } {
  const durations = jobs.flatMap((job) => {
    const startDates = job.timelineEvents
      .filter((event) => event.eventType === startType)
      .map((event) => event.eventDate.getTime());
    const endDates = job.timelineEvents
      .filter((event) => event.eventType === endType)
      .map((event) => event.eventDate.getTime());

    if (!startDates.length || !endDates.length) {
      return [];
    }

    const start = Math.min(...startDates);
    const validEndDates = endDates.filter((date) => date >= start);
    if (!validEndDates.length) {
      return [];
    }
    return [Math.min(...validEndDates) - start];
  });

  if (!durations.length) {
    return { averageHours: null, sampleSize: 0 };
  }

  const averageMilliseconds =
    durations.reduce((total, duration) => total + duration, 0) /
    durations.length;

  return {
    averageHours: roundToOneDecimal(averageMilliseconds / (60 * 60 * 1000)),
    sampleSize: durations.length,
  };
}

export async function getWorkspaceScopedData(
  ownerId: string,
  workspaceId: string,
): Promise<WorkspaceScopedData> {
  const workspace = await db.workspace.findUnique({
    where: { id: workspaceId, ownerId },
    select: { id: true },
  });
  if (!workspace) {
    throw new WorkspaceNotFoundError(workspaceId);
  }

  const jobInclude = {
    company: { select: { id: true, name: true } },
    timelineEvents: {
      select: { eventType: true, eventDate: true },
    },
  } satisfies Prisma.JobInclude;

  const [companyCount, jobs, recentActivity] = await Promise.all([
    db.company.count({ where: { workspaceId, jobs: { some: {} } } }),
    db.job.findMany({
      where: { workspaceId },
      include: jobInclude,
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    }),
    db.timelineEvent.findMany({
      where: { job: { workspaceId } },
      include: {
        job: {
          select: {
            id: true,
            jobName: true,
            company: { select: { name: true } },
          },
        },
      },
      orderBy: [{ eventDate: "desc" }, { createdAt: "desc" }, { id: "asc" }],
      take: 10,
    }),
  ]);

  const interviewEntryCount = jobs.filter((job) =>
    isStageIn(job.stage, interviewStages),
  ).length;
  const secondInterviewCount = jobs.filter((job) =>
    isStageIn(job.stage, secondInterviewStages),
  ).length;
  const offerJobs = jobs.filter((job) => job.stage === "OFFER");
  const offerCompanyCount = new Set(offerJobs.map((job) => job.companyId)).size;

  return {
    workspaceId,
    metrics: {
      companyCount,
      jobCount: jobs.length,
      interviewEntryCount,
      interviewEntryRate: jobs.length
        ? roundToOneDecimal((interviewEntryCount / jobs.length) * 100)
        : 0,
      offerCount: offerJobs.length,
      offerCompanyConversionRate: companyCount
        ? roundToOneDecimal((offerCompanyCount / companyCount) * 100)
        : 0,
    },
    funnel: {
      applied: jobs.length,
      firstInterview: interviewEntryCount,
      secondInterview: secondInterviewCount,
      offer: offerJobs.length,
    },
    processDurations: {
      appliedToFirstInterview: calculateAverageDuration(
        jobs,
        "APPLIED",
        "FIRST_INTERVIEW_COMPLETED",
      ),
      firstToSecondInterview: calculateAverageDuration(
        jobs,
        "FIRST_INTERVIEW_COMPLETED",
        "SECOND_INTERVIEW_COMPLETED",
      ),
      secondInterviewToOffer: calculateAverageDuration(
        jobs,
        "SECOND_INTERVIEW_COMPLETED",
        "OFFER_RECEIVED",
      ),
    },
    jobs: jobs.map((job) => ({
      id: job.id,
      companyId: job.companyId,
      companyName: job.company.name,
      jobName: job.jobName,
      baseLocation: job.baseLocation,
      jobUrl: job.jobUrl,
      stage: job.stage,
      status: job.status,
      remark: job.remark,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
    })),
    recentActivity: recentActivity.map((event) => ({
      id: event.id,
      jobId: event.jobId,
      companyName: event.job.company.name,
      jobName: event.job.jobName,
      eventType: event.eventType,
      eventDate: event.eventDate.toISOString(),
      remark: event.remark,
    })),
  };
}
