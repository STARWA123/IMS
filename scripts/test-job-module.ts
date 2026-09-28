import { db } from "../src/db/client";
import {
  createJob,
  deleteJob,
  getJobDeletionSummary,
  listJobs,
  updateJob,
} from "../src/modules/job/job-service";
import { createWorkspace } from "../src/modules/workspace/workspace-service";
import { createTestOwner } from "./test-user-helper";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function run(): Promise<void> {
  const marker = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const owner = await createTestOwner(marker);
  const workspace = await createWorkspace({ ownerId: owner.id, name: `岗位模块测试-${marker}` });
  const otherWorkspace = await createWorkspace({ ownerId: owner.id, name: `岗位隔离测试-${marker}` });

  try {
    const beforeCreate = Date.now();
    const first = await createJob(workspace.id, {
      companyName: "光年科技",
      jobName: "前端开发工程师",
      baseLocation: "北京",
      jobUrl: "https://example.com/jobs/frontend",
      remark: "岗位模块自动化测试",
    });
    const afterCreate = Date.now();
    assert(first.job.stage === "APPLIED", "新增岗位的 Stage 应为 APPLIED。");
    assert(first.job.status === "PENDING", "新增岗位的 Status 应为 PENDING。");
    assert(
      first.timelineEvent.eventType === "APPLIED",
      "新增岗位应自动创建 APPLIED TimelineEvent。",
    );
    const eventTime = new Date(first.timelineEvent.eventDate).getTime();
    assert(
      eventTime >= beforeCreate && eventTime <= afterCreate,
      "APPLIED TimelineEvent 应使用当前时间。",
    );

    await createJob(workspace.id, {
      companyName: "云图数据",
      jobName: "数据开发工程师",
      baseLocation: "杭州",
    });
    await createJob(otherWorkspace.id, {
      companyName: "隔离公司",
      jobName: "隔离岗位",
      baseLocation: "上海",
    });

    assert((await listJobs(workspace.id)).length === 2, "岗位列表应限定当前 Workspace。");
    assert((await listJobs(workspace.id, "光年")).length === 1, "应支持按公司名称搜索。");
    assert((await listJobs(workspace.id, "数据开发")).length === 1, "应支持按岗位名称搜索。");
    assert((await listJobs(workspace.id, "杭州")).length === 1, "应支持按 Base 搜索。");
    assert((await listJobs(workspace.id, "隔离公司")).length === 0, "搜索不得跨 Workspace。");

    await new Promise((resolve) => setTimeout(resolve, 20));
    const updated = await updateJob(workspace.id, first.job.id, {
      jobName: "高级前端开发工程师",
      baseLocation: "上海",
      jobUrl: "https://example.com/jobs/senior-frontend",
      remark: "已完成编辑测试",
    });
    assert(updated.companyName === "光年科技", "编辑岗位不得修改公司。");
    assert(updated.stage === "APPLIED", "编辑岗位不得修改 Stage。");
    assert(updated.status === "PENDING", "编辑岗位不得修改 Status。");
    assert(
      (await listJobs(workspace.id))[0]?.id === first.job.id,
      "岗位列表应按 updatedAt DESC 排序。",
    );

    await db.timelineEvent.create({
      data: {
        jobId: first.job.id,
        eventType: "ASSESSMENT_COMPLETED",
        eventDate: new Date(),
      },
    });
    const summary = await getJobDeletionSummary(workspace.id, first.job.id);
    assert(summary.timelineEventCount === 2, "删除提示应统计岗位的 Timeline 记录。");
    const deleted = await deleteJob(workspace.id, first.job.id);
    assert(deleted.timelineEventCount === 2, "删除结果应保留删除前的 Timeline 数量。");
    assert(
      (await db.timelineEvent.count({ where: { jobId: first.job.id } })) === 0,
      "删除 Job 后应级联删除 TimelineEvent。",
    );
    assert(
      (await db.job.count({ where: { id: first.job.id } })) === 0,
      "删除操作应删除指定 Job。",
    );
    assert(
      (await db.company.count({ where: { id: first.job.companyId } })) === 0,
      "删除公司的最后一个 Job 后应清理空 Company。",
    );

    const sharedFirst = await createJob(workspace.id, {
      companyName: "共享公司",
      jobName: "岗位一",
      baseLocation: "深圳",
    });
    const sharedSecond = await createJob(workspace.id, {
      companyName: "共享公司",
      jobName: "岗位二",
      baseLocation: "广州",
    });
    assert(sharedFirst.job.companyId === sharedSecond.job.companyId, "同名公司应复用 Company。");
    await deleteJob(workspace.id, sharedFirst.job.id);
    assert(
      (await db.company.count({ where: { id: sharedFirst.job.companyId } })) === 1 &&
        (await db.job.count({ where: { id: sharedSecond.job.id } })) === 1,
      "公司仍有岗位时不得删除 Company 或级联删除其他岗位。",
    );
    await deleteJob(workspace.id, sharedSecond.job.id);
    assert(
      (await db.company.count({ where: { id: sharedFirst.job.companyId } })) === 0,
      "删除共享公司的最后一个岗位后应清理 Company。",
    );

    console.info("Job module tests passed:");
    console.info("- Workspace isolation");
    console.info("- updatedAt DESC sorting");
    console.info("- Company, job name and Base search");
    console.info("- Atomic Job + APPLIED TimelineEvent creation");
    console.info("- Restricted edit fields");
    console.info("- Timeline count and cascade deletion");
    console.info("- Empty Company cleanup without affecting sibling Jobs");
  } finally {
    await db.workspace.deleteMany({
      where: { id: { in: [workspace.id, otherWorkspace.id] } },
    });
    await db.user.delete({ where: { id: owner.id } });
  }
}

run()
  .catch((error: unknown) => {
    console.error("Job module tests failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
