import type { JobItem } from "../src/modules/job/job-types";
import {
  buildCompanyView,
  searchCompanyView,
} from "../src/modules/company/company-view-model";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function job(input: Partial<JobItem> & Pick<JobItem, "id" | "companyId" | "companyName" | "jobName" | "stage" | "updatedAt">): JobItem {
  return {
    baseLocation: "深圳",
    jobUrl: null,
    status: input.stage === "REJECTED" ? "FAILED" : "PENDING",
    remark: null,
    createdAt: input.updatedAt,
    ...input,
  };
}

function run(): void {
  const jobs: JobItem[] = [
    job({ id: "job-a-offer", companyId: "company-a", companyName: "星河科技", jobName: "产品经理", stage: "OFFER", updatedAt: "2026-09-01T08:00:00.000Z" }),
    job({ id: "job-a-active", companyId: "company-a", companyName: "星河科技", jobName: "前端工程师", stage: "APPLIED", updatedAt: "2026-09-03T08:00:00.000Z" }),
    job({ id: "job-b-rejected-2", companyId: "company-b", companyName: "云图数据", jobName: "Data Analyst", stage: "REJECTED", updatedAt: "2026-09-04T08:00:00.000Z" }),
    job({ id: "job-b-rejected-1", companyId: "company-b", companyName: "云图数据", jobName: "数据开发", stage: "REJECTED", updatedAt: "2026-09-02T08:00:00.000Z" }),
    job({ id: "job-c-active", companyId: "company-c", companyName: "星河科技", jobName: "算法工程师", stage: "ASSESSMENT", updatedAt: "2026-09-02T12:00:00.000Z" }),
  ];

  const companies = buildCompanyView(jobs);
  assert(companies.length === 3, "应按 companyId 聚合，同名公司不得被错误合并。");
  assert(companies[0]?.companyId === "company-b", "公司应按最近岗位更新时间倒序排列。");

  const companyA = companies.find((company) => company.companyId === "company-a");
  assert(companyA?.jobCount === 2, "岗位数应统计当前仍存在的岗位。");
  assert(companyA?.inProgressCount === 1, "进行中不得包含 Offer 或淘汰岗位。");
  assert(companyA?.highestStage === "OFFER", "当前最高阶段应忽略淘汰并取最高有效阶段。");
  assert(companyA?.jobs[0]?.id === "job-a-active", "公司内岗位应按更新时间倒序排列。");

  const companyB = companies.find((company) => company.companyId === "company-b");
  assert(companyB?.allRejected && companyB.highestStage === null, "全部淘汰的公司应返回独立状态。");
  assert(companyB?.inProgressCount === 0, "全部淘汰的公司进行中数量应为 0。");

  const companyMatches = searchCompanyView(companies, "星河");
  assert(companyMatches.length === 2, "公司搜索应返回所有同名但不同 ID 的公司。");
  assert(companyMatches.every((company) => company.visibleJobs.length === company.jobCount), "命中公司名称时应展示该公司的全部岗位。");

  const jobMatches = searchCompanyView(companies, "前端");
  assert(jobMatches.length === 1 && jobMatches[0]?.matchedByJob, "命中岗位名称时应标记公司自动展开。");
  assert(jobMatches[0]?.visibleJobs.length === 1 && jobMatches[0]?.visibleJobs[0]?.id === "job-a-active", "岗位搜索只应展示匹配岗位。");
  assert(searchCompanyView(companies, "data")[0]?.companyId === "company-b", "英文岗位搜索应忽略大小写。");
  assert(searchCompanyView(companies, "深圳").length === 0, "公司视图不应使用 Base 参与搜索。");

  console.info("Company view module tests passed:");
  console.info("- Company aggregation and same-name isolation");
  console.info("- Company and job sorting");
  console.info("- Active count, highest stage and all-rejected state");
  console.info("- Company and job search semantics");
}

run();
