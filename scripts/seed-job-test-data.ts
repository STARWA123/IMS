import { db } from "../src/db/client";
import { initializeDatabase } from "../src/db/initialize-database";
import { createJob } from "../src/modules/job/job-service";

const testJobs = [
  {
    companyName: "星海科技",
    jobName: "前端开发工程师",
    baseLocation: "北京",
    jobUrl: "https://example.com/jobs/frontend",
    remark: "岗位管理模块测试数据",
  },
  {
    companyName: "云图数据",
    jobName: "后端开发工程师",
    baseLocation: "杭州",
    jobUrl: "https://example.com/jobs/backend",
    remark: "岗位管理模块测试数据",
  },
  {
    companyName: "极光网络",
    jobName: "客户端开发工程师",
    baseLocation: "深圳",
    jobUrl: "https://example.com/jobs/client",
    remark: "岗位管理模块测试数据",
  },
] as const;

async function seedJobTestData(): Promise<void> {
  const owner = await db.user.findFirst({
    where: { isActive: true },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });
  if (!owner) {
    throw new Error("请先运行 npm run db:seed 创建管理员账号。");
  }
  const workspace = await initializeDatabase(owner.id);
  let createdCount = 0;

  for (const input of testJobs) {
    const existing = await db.job.findFirst({
      where: {
        workspaceId: workspace.id,
        jobName: input.jobName,
        company: { name: input.companyName },
      },
      select: { id: true },
    });
    if (!existing) {
      await createJob(workspace.id, input);
      createdCount += 1;
    }
  }

  console.info(
    `Job test data ready in ${workspace.name}: ${createdCount} created, ${testJobs.length - createdCount} already existed.`,
  );
}

seedJobTestData()
  .catch((error: unknown) => {
    console.error("Job test data seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
