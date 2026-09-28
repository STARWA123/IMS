import { db } from "../src/db/client";
import { getWorkspaceScopedData } from "../src/modules/workspace/workspace-service";
import { createTestOwner } from "./test-user-helper";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function dateAt(day: number): Date {
  return new Date(Date.UTC(2026, 0, day, 0, 0, 0));
}

async function testDashboardModule(): Promise<void> {
  const workspaceIds: string[] = [];
  const marker = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const owner = await createTestOwner(marker);

  try {
    const workspace = await db.workspace.create({
      data: { ownerId: owner.id, name: "Dashboard module test" },
    });
    workspaceIds.push(workspace.id);

    const otherWorkspace = await db.workspace.create({
      data: { ownerId: owner.id, name: "Dashboard isolation test" },
    });
    workspaceIds.push(otherWorkspace.id);

    const [offerCompany, interviewCompany, rejectedCompany] = await Promise.all([
      db.company.create({
        data: { workspaceId: workspace.id, name: "Offer Company" },
      }),
      db.company.create({
        data: { workspaceId: workspace.id, name: "Interview Company" },
      }),
      db.company.create({
        data: { workspaceId: workspace.id, name: "Rejected Company" },
      }),
      db.company.create({
        data: { workspaceId: workspace.id, name: "No Job Company" },
      }),
    ]);

    await db.job.create({
      data: {
        workspaceId: workspace.id,
        companyId: offerCompany.id,
        jobName: "Offer Job",
        baseLocation: "Shanghai",
        stage: "OFFER",
        timelineEvents: {
          create: [
            { eventType: "APPLIED", eventDate: dateAt(1) },
            { eventType: "FIRST_INTERVIEW_COMPLETED", eventDate: dateAt(3) },
            { eventType: "SECOND_INTERVIEW_COMPLETED", eventDate: dateAt(6) },
            { eventType: "OFFER_RECEIVED", eventDate: dateAt(10) },
          ],
        },
      },
    });

    await db.job.create({
      data: {
        workspaceId: workspace.id,
        companyId: interviewCompany.id,
        jobName: "Second Interview Job",
        baseLocation: "Beijing",
        stage: "SECOND_INTERVIEW",
        timelineEvents: {
          create: [
            { eventType: "APPLIED", eventDate: dateAt(1) },
            { eventType: "FIRST_INTERVIEW_COMPLETED", eventDate: dateAt(2) },
            { eventType: "SECOND_INTERVIEW_COMPLETED", eventDate: dateAt(4) },
          ],
        },
      },
    });

    await db.job.create({
      data: {
        workspaceId: workspace.id,
        companyId: rejectedCompany.id,
        jobName: "Rejected Job",
        baseLocation: "Shenzhen",
        stage: "REJECTED",
        status: "FAILED",
        timelineEvents: {
          create: [
            { eventType: "APPLIED", eventDate: dateAt(1) },
            { eventType: "REJECTED", eventDate: dateAt(2) },
          ],
        },
      },
    });

    const otherCompany = await db.company.create({
      data: { workspaceId: otherWorkspace.id, name: "Other Company" },
    });
    await db.job.create({
      data: {
        workspaceId: otherWorkspace.id,
        companyId: otherCompany.id,
        jobName: "Other Offer Job",
        baseLocation: "Hangzhou",
        stage: "OFFER",
        timelineEvents: {
          create: [
            { eventType: "APPLIED", eventDate: dateAt(1) },
            { eventType: "OFFER_RECEIVED", eventDate: dateAt(20) },
          ],
        },
      },
    });

    const data = await getWorkspaceScopedData(owner.id, workspace.id);

    assert(data.metrics.companyCount === 4, "投递公司数量应使用 Company 数量。");
    assert(data.metrics.jobCount === 3, "投递岗位数量应使用 Job 数量。");
    assert(data.metrics.interviewEntryCount === 2, "进入面试岗位数量统计错误。");
    assert(data.metrics.interviewEntryRate === 66.7, "面试进入率计算错误。");
    assert(data.metrics.offerCount === 1, "Offer 岗位数量统计错误。");
    assert(data.metrics.offerCompanyConversionRate === 25, "Offer 公司转化率计算错误。");

    assert(
      data.funnel.applied === 3 &&
        data.funnel.firstInterview === 2 &&
        data.funnel.secondInterview === 2 &&
        data.funnel.offer === 1,
      "招聘漏斗统计错误。",
    );

    assert(
      data.processDurations.appliedToFirstInterview.averageHours === 36 &&
        data.processDurations.appliedToFirstInterview.sampleSize === 2,
      "投递到一面的平均耗时计算错误。",
    );
    assert(
      data.processDurations.firstToSecondInterview.averageHours === 60 &&
        data.processDurations.firstToSecondInterview.sampleSize === 2,
      "一面到二面的平均耗时计算错误。",
    );
    assert(
      data.processDurations.secondInterviewToOffer.averageHours === 96 &&
        data.processDurations.secondInterviewToOffer.sampleSize === 1,
      "二面到 Offer 的平均耗时计算错误。",
    );

    assert(data.recentActivity.length === 9, "最近活动不得包含其他 Workspace 数据。");
    assert(
      data.recentActivity[0]?.eventType === "OFFER_RECEIVED",
      "最近活动应按 Timeline 日期倒序排列。",
    );
    assert(
      data.recentActivity.every((event) => event.companyName !== "Other Company"),
      "最近活动发生 Workspace 数据泄漏。",
    );

    console.info("Dashboard module verified:");
    console.info("- Current Workspace isolation");
    console.info("- Six top metrics and conversion rates");
    console.info("- Recruitment funnel counts");
    console.info("- Timeline-based average process durations");
    console.info("- Recent Timeline activity ordering");
  } finally {
    await db.workspace.deleteMany({ where: { id: { in: workspaceIds } } });
    await db.user.delete({ where: { id: owner.id } });
    await db.$disconnect();
  }
}

testDashboardModule().catch((error: unknown) => {
  console.error("Dashboard module verification failed:", error);
  process.exitCode = 1;
});
