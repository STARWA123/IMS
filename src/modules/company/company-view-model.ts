import type { Stage } from "../../generated/prisma/client";
import type { JobItem } from "../job/job-types";

const activeStages = new Set<Stage>([
  "APPLIED",
  "ASSESSMENT",
  "FIRST_INTERVIEW",
  "SECOND_INTERVIEW",
  "THIRD_INTERVIEW",
  "HR_INTERVIEW",
]);

const stageRank: Record<Exclude<Stage, "REJECTED">, number> = {
  APPLIED: 0,
  ASSESSMENT: 1,
  FIRST_INTERVIEW: 2,
  SECOND_INTERVIEW: 3,
  THIRD_INTERVIEW: 4,
  HR_INTERVIEW: 5,
  OFFER: 6,
};

export type CompanyViewItem = {
  companyId: string;
  companyName: string;
  jobs: JobItem[];
  jobCount: number;
  inProgressCount: number;
  highestStage: Exclude<Stage, "REJECTED"> | null;
  allRejected: boolean;
  updatedAt: string;
};

export type CompanyViewSearchResult = CompanyViewItem & {
  visibleJobs: JobItem[];
  matchedByJob: boolean;
};

function compareUpdatedAt(left: { updatedAt: string; id?: string }, right: { updatedAt: string; id?: string }): number {
  const byDate = right.updatedAt.localeCompare(left.updatedAt);
  return byDate || (left.id ?? "").localeCompare(right.id ?? "");
}

function getHighestStage(jobs: JobItem[]): Exclude<Stage, "REJECTED"> | null {
  return jobs.reduce<Exclude<Stage, "REJECTED"> | null>((highest, job) => {
    if (job.stage === "REJECTED") {
      return highest;
    }
    if (!highest || stageRank[job.stage] > stageRank[highest]) {
      return job.stage;
    }
    return highest;
  }, null);
}

export function buildCompanyView(jobs: JobItem[]): CompanyViewItem[] {
  const grouped = new Map<string, { companyName: string; jobs: JobItem[] }>();

  for (const job of jobs) {
    const company = grouped.get(job.companyId);
    if (company) {
      company.jobs.push(job);
    } else {
      grouped.set(job.companyId, { companyName: job.companyName, jobs: [job] });
    }
  }

  return Array.from(grouped, ([companyId, company]) => {
    const sortedJobs = [...company.jobs].sort(compareUpdatedAt);
    const highestStage = getHighestStage(sortedJobs);
    return {
      companyId,
      companyName: company.companyName,
      jobs: sortedJobs,
      jobCount: sortedJobs.length,
      inProgressCount: sortedJobs.filter((job) => activeStages.has(job.stage)).length,
      highestStage,
      allRejected: highestStage === null,
      updatedAt: sortedJobs[0]!.updatedAt,
    };
  }).sort((left, right) => {
    const byDate = right.updatedAt.localeCompare(left.updatedAt);
    const byName = left.companyName.localeCompare(right.companyName, "zh-CN");
    return byDate || byName || left.companyId.localeCompare(right.companyId);
  });
}

export function searchCompanyView(
  companies: CompanyViewItem[],
  search: string,
): CompanyViewSearchResult[] {
  const query = search.trim().toLocaleLowerCase("zh-CN");

  if (!query) {
    return companies.map((company) => ({
      ...company,
      visibleJobs: company.jobs,
      matchedByJob: false,
    }));
  }

  return companies.flatMap<CompanyViewSearchResult>((company) => {
    if (company.companyName.toLocaleLowerCase("zh-CN").includes(query)) {
      return [{ ...company, visibleJobs: company.jobs, matchedByJob: false }];
    }

    const visibleJobs = company.jobs.filter((job) =>
      job.jobName.toLocaleLowerCase("zh-CN").includes(query),
    );
    return visibleJobs.length
      ? [{ ...company, visibleJobs, matchedByJob: true }]
      : [];
  });
}
