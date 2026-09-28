import { randomUUID } from "node:crypto";
import { db } from "../src/db/client";
import {
  createWorkspace,
  deleteWorkspace,
  getWorkspaceDeletionSummary,
  getWorkspaceScopedData,
  renameWorkspace,
} from "../src/modules/workspace/workspace-service";
import { createTestOwner } from "./test-user-helper";

const suffix = randomUUID();
let autumnWorkspaceId: string | null = null;
let springWorkspaceId: string | null = null;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function run(): Promise<void> {
  const owner = await createTestOwner(suffix);
  try {
    const autumn = await createWorkspace({ ownerId: owner.id, name: "秋招", description: "测试秋招数据隔离" });
    const spring = await createWorkspace({ ownerId: owner.id, name: "春招", description: "测试春招数据隔离" });
    autumnWorkspaceId = autumn.id;
    springWorkspaceId = spring.id;

    const autumnCompanyId = `test-autumn-company-${suffix}`;
    const springCompanyId = `test-spring-company-${suffix}`;
    const autumnJobId = `test-autumn-job-${suffix}`;
    const springJobId = `test-spring-job-${suffix}`;

    await db.company.createMany({
      data: [
        { id: autumnCompanyId, workspaceId: autumn.id, name: "秋招公司" },
        { id: springCompanyId, workspaceId: spring.id, name: "春招公司" },
      ],
    });
    await db.job.createMany({
      data: [
        {
          id: autumnJobId,
          workspaceId: autumn.id,
          companyId: autumnCompanyId,
          jobName: "秋招岗位",
          baseLocation: "上海",
        },
        {
          id: springJobId,
          workspaceId: spring.id,
          companyId: springCompanyId,
          jobName: "春招岗位",
          baseLocation: "北京",
        },
      ],
    });
    await db.timelineEvent.createMany({
      data: [
        { jobId: autumnJobId, eventType: "APPLIED", eventDate: new Date() },
        { jobId: springJobId, eventType: "APPLIED", eventDate: new Date() },
      ],
    });

    const [autumnData, springData] = await Promise.all([
      getWorkspaceScopedData(owner.id, autumn.id),
      getWorkspaceScopedData(owner.id, spring.id),
    ]);

    assert(autumnData.jobs.length === 1, "秋招应只包含一个岗位。");
    assert(autumnData.jobs[0]?.jobName === "秋招岗位", "秋招读取到了其他 Workspace 数据。");
    assert(springData.jobs.length === 1, "春招应只包含一个岗位。");
    assert(springData.jobs[0]?.jobName === "春招岗位", "春招读取到了其他 Workspace 数据。");

    const renamed = await renameWorkspace(owner.id, autumn.id, "秋招（已重命名）");
    assert(renamed.name === "秋招（已重命名）", "Workspace 重命名失败。");

    const autumnSummary = await getWorkspaceDeletionSummary(owner.id, autumn.id);
    assert(autumnSummary.jobCount === 1, "删除保护中的岗位数量不正确。");
    assert(autumnSummary.timelineEventCount === 1, "删除保护中的 Timeline 数量不正确。");

    await deleteWorkspace(owner.id, autumn.id);
    autumnWorkspaceId = null;
    const [remainingCompany, remainingJob, remainingTimeline] = await Promise.all([
      db.company.count({ where: { id: autumnCompanyId } }),
      db.job.count({ where: { id: autumnJobId } }),
      db.timelineEvent.count({ where: { jobId: autumnJobId } }),
    ]);
    assert(remainingCompany === 0 && remainingJob === 0 && remainingTimeline === 0, "Workspace 级联删除失败。");

    console.info("Workspace module verified: create, switch isolation, rename, delete summary, and cascade deletion passed.");
  } finally {
    if (autumnWorkspaceId) {
      await db.workspace.deleteMany({ where: { id: autumnWorkspaceId } });
    }
    if (springWorkspaceId) {
      await db.workspace.deleteMany({ where: { id: springWorkspaceId } });
    }
    await db.user.deleteMany({ where: { id: owner.id } });
  }
}

run()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
