import type { Prisma, Stage } from "../../generated/prisma/client";
import { db } from "../../db/client";
import { WorkspaceNotFoundError } from "../workspace/workspace-service";
import type {
  CreateJobInput,
  CreatedTimelineEvent,
  JobDeletionSummary,
  JobItem,
  MoveJobStageResult,
  UpdateJobInput,
} from "./job-types";
import { statusForStage, timelineEventByStage } from "./stage-rules";

export class JobNotFoundError extends Error {
  constructor(jobId: string) {
    super(`Job not found: ${jobId}`);
    this.name = "JobNotFoundError";
  }
}

export class CompanyOfferConflictError extends Error {
  constructor(companyName: string) {
    super(`${companyName} 已有一个 Offer 岗位，不能重复进入 Offer。`);
    this.name = "CompanyOfferConflictError";
  }
}

function normalizeRequired(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new TypeError(`${label}不能为空。`);
  }
  return normalized;
}

function normalizeOptional(value?: string | null): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function serializeJob(job: {
  id: string;
  companyId: string;
  jobName: string;
  baseLocation: string;
  jobUrl: string | null;
  stage: JobItem["stage"];
  status: JobItem["status"];
  remark: string | null;
  createdAt: Date;
  updatedAt: Date;
  company: { name: string };
}): JobItem {
  return {
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
  };
}

async function ensureWorkspaceExists(workspaceId: string): Promise<void> {
  const workspace = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: { id: true },
  });
  if (!workspace) {
    throw new WorkspaceNotFoundError(workspaceId);
  }
}

export async function listJobs(
  workspaceId: string,
  search = "",
): Promise<JobItem[]> {
  await ensureWorkspaceExists(workspaceId);
  const query = search.trim();
  const where: Prisma.JobWhereInput = {
    workspaceId,
    ...(query
      ? {
          OR: [
            { company: { name: { contains: query } } },
            { jobName: { contains: query } },
            { baseLocation: { contains: query } },
          ],
        }
      : {}),
  };
  const jobs = await db.job.findMany({
    where,
    include: { company: { select: { name: true } } },
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
  });
  return jobs.map(serializeJob);
}

export async function createJob(
  workspaceId: string,
  input: CreateJobInput,
): Promise<{ job: JobItem; timelineEvent: CreatedTimelineEvent }> {
  const companyName = normalizeRequired(input.companyName, "公司名称");
  const jobName = normalizeRequired(input.jobName, "岗位名称");
  const baseLocation = normalizeRequired(input.baseLocation, "Base 地点");
  const jobUrl = normalizeOptional(input.jobUrl);
  const remark = normalizeOptional(input.remark);

  return db.$transaction(async (transaction) => {
    const workspace = await transaction.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true },
    });
    if (!workspace) {
      throw new WorkspaceNotFoundError(workspaceId);
    }

    const existingCompany = await transaction.company.findFirst({
      where: { workspaceId, name: companyName },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    const company =
      existingCompany ??
      (await transaction.company.create({
        data: { workspaceId, name: companyName },
      }));
    const eventDate = new Date();
    const job = await transaction.job.create({
      data: {
        workspaceId,
        companyId: company.id,
        jobName,
        baseLocation,
        jobUrl,
        remark,
        stage: "APPLIED",
        status: "PENDING",
      },
      include: { company: { select: { name: true } } },
    });
    const timelineEvent = await transaction.timelineEvent.create({
      data: {
        jobId: job.id,
        eventType: "APPLIED",
        eventDate,
      },
    });

    return {
      job: serializeJob(job),
      timelineEvent: {
        id: timelineEvent.id,
        jobId: timelineEvent.jobId,
        eventType: timelineEvent.eventType,
        eventDate: timelineEvent.eventDate.toISOString(),
      },
    };
  });
}

export async function updateJob(
  workspaceId: string,
  jobId: string,
  input: UpdateJobInput,
): Promise<JobItem> {
  const data = {
    jobName: normalizeRequired(input.jobName, "岗位名称"),
    baseLocation: normalizeRequired(input.baseLocation, "Base 地点"),
    jobUrl: normalizeOptional(input.jobUrl),
    remark: normalizeOptional(input.remark),
  };

  return db.$transaction(async (transaction) => {
    const existingJob = await transaction.job.findFirst({
      where: { id: jobId, workspaceId },
      select: { id: true },
    });
    if (!existingJob) {
      throw new JobNotFoundError(jobId);
    }
    const job = await transaction.job.update({
      where: { id: jobId },
      data,
      include: { company: { select: { name: true } } },
    });
    return serializeJob(job);
  });
}

export async function moveJobToStage(
  workspaceId: string,
  jobId: string,
  targetStage: Stage,
): Promise<MoveJobStageResult> {
  return db.$transaction(async (transaction) => {
    const existingJob = await transaction.job.findFirst({
      where: { id: jobId, workspaceId },
      include: { company: { select: { name: true } } },
    });
    if (!existingJob) {
      throw new JobNotFoundError(jobId);
    }

    if (existingJob.stage === targetStage) {
      return {
        job: serializeJob(existingJob),
        previousStage: existingJob.stage,
        timelineEvent: null,
      };
    }

    if (targetStage === "OFFER") {
      const existingOffer = await transaction.job.findFirst({
        where: {
          workspaceId,
          companyId: existingJob.companyId,
          stage: "OFFER",
          id: { not: jobId },
        },
        select: { id: true },
      });
      if (existingOffer) {
        throw new CompanyOfferConflictError(existingJob.company.name);
      }
    }

    const updatedJob = await transaction.job.update({
      where: { id: jobId },
      data: {
        stage: targetStage,
        status: statusForStage(targetStage),
      },
      include: { company: { select: { name: true } } },
    });
    const timelineEvent = await transaction.timelineEvent.create({
      data: {
        jobId,
        eventType: timelineEventByStage[targetStage],
        eventDate: new Date(),
      },
    });

    return {
      job: serializeJob(updatedJob),
      previousStage: existingJob.stage,
      timelineEvent: {
        id: timelineEvent.id,
        jobId: timelineEvent.jobId,
        eventType: timelineEvent.eventType,
        eventDate: timelineEvent.eventDate.toISOString(),
      },
    };
  });
}

export async function getJobDeletionSummary(
  workspaceId: string,
  jobId: string,
): Promise<JobDeletionSummary> {
  const job = await db.job.findFirst({
    where: { id: jobId, workspaceId },
    select: {
      id: true,
      jobName: true,
      company: { select: { name: true } },
      _count: { select: { timelineEvents: true } },
    },
  });
  if (!job) {
    throw new JobNotFoundError(jobId);
  }
  return {
    workspaceId,
    jobId: job.id,
    companyName: job.company.name,
    jobName: job.jobName,
    timelineEventCount: job._count.timelineEvents,
  };
}

export async function deleteJob(
  workspaceId: string,
  jobId: string,
): Promise<JobDeletionSummary> {
  return db.$transaction(async (transaction) => {
    const job = await transaction.job.findFirst({
      where: { id: jobId, workspaceId },
      select: {
        id: true,
        jobName: true,
        company: { select: { name: true } },
        _count: { select: { timelineEvents: true } },
      },
    });
    if (!job) {
      throw new JobNotFoundError(jobId);
    }
    const summary: JobDeletionSummary = {
      workspaceId,
      jobId: job.id,
      companyName: job.company.name,
      jobName: job.jobName,
      timelineEventCount: job._count.timelineEvents,
    };
    await transaction.job.delete({ where: { id: jobId } });
    return summary;
  });
}
