import { db } from "../src/db/client";
import type { EventType, Stage } from "../src/generated/prisma/client";
import { deleteJob, moveJobToStage } from "../src/modules/job/job-service";
import {
  createTimelineEvent,
  deleteTimelineEvent,
  updateTimelineEvent,
} from "../src/modules/timeline/timeline-service";
import {
  getWorkspaceScopedData,
  WorkspaceNotFoundError,
} from "../src/modules/workspace/workspace-service";
import type { WorkspaceScopedData } from "../src/modules/workspace/workspace-types";
import { createTestOwner } from "./test-user-helper";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function dateAt(day: number): Date {
  return new Date(Date.UTC(2026, 0, day, 0, 0, 0));
}

function assertProgress(
  data: WorkspaceScopedData,
  expected: readonly [number, number, number],
  message: string,
): void {
  const [firstInterview, secondInterview, offer] = expected;
  assert(
    data.metrics.interviewEntryCount === firstInterview &&
      data.funnel.firstInterview === firstInterview &&
      data.funnel.secondInterview === secondInterview &&
      data.metrics.offerCount === offer &&
      data.funnel.offer === offer,
    `${message}：累计面试 / 二面 / Offer 数量应为 ${expected.join(" / ")}，实际为 ${data.funnel.firstInterview} / ${data.funnel.secondInterview} / ${data.funnel.offer}。`,
  );
  assert(
    data.funnel.applied === data.metrics.jobCount &&
      data.funnel.applied >= firstInterview &&
      firstInterview >= secondInterview &&
      secondInterview >= offer,
    `${message}：累计漏斗应保持各层递减，顶部指标与漏斗应一致。`,
  );
}

async function createTestWorkspace(
  ownerId: string,
  workspaceIds: string[],
  name: string,
): Promise<string> {
  const workspace = await db.workspace.create({ data: { ownerId, name } });
  workspaceIds.push(workspace.id);
  return workspace.id;
}

async function testProgressEvidence(
  ownerId: string,
  workspaceIds: string[],
): Promise<void> {
  const futureDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1_000);
  const scenarios: {
    name: string;
    stage: Stage;
    events: EventType[];
    expected: readonly [number, number, number];
    eventDate?: Date;
  }[] = [
    { name: "投递，无历史", stage: "APPLIED", events: [], expected: [0, 0, 0] },
    { name: "笔试，无历史", stage: "ASSESSMENT", events: [], expected: [0, 0, 0] },
    { name: "一面，无历史", stage: "FIRST_INTERVIEW", events: [], expected: [1, 0, 0] },
    { name: "二面，无历史", stage: "SECOND_INTERVIEW", events: [], expected: [1, 1, 0] },
    { name: "三面，无历史", stage: "THIRD_INTERVIEW", events: [], expected: [1, 1, 0] },
    { name: "HR 面，无历史", stage: "HR_INTERVIEW", events: [], expected: [1, 1, 0] },
    { name: "Offer，无历史", stage: "OFFER", events: [], expected: [1, 1, 1] },
    { name: "淘汰，无历史", stage: "REJECTED", events: [], expected: [0, 0, 0] },
    { name: "仅有投递历史后淘汰", stage: "REJECTED", events: ["APPLIED"], expected: [0, 0, 0] },
    { name: "仅有笔试历史后淘汰", stage: "REJECTED", events: ["ASSESSMENT_COMPLETED"], expected: [0, 0, 0] },
    { name: "一面后淘汰", stage: "REJECTED", events: ["FIRST_INTERVIEW_COMPLETED"], expected: [1, 0, 0] },
    { name: "二面后淘汰，缺少一面记录", stage: "REJECTED", events: ["SECOND_INTERVIEW_COMPLETED"], expected: [1, 1, 0] },
    { name: "三面后淘汰", stage: "REJECTED", events: ["THIRD_INTERVIEW_COMPLETED"], expected: [1, 1, 0] },
    { name: "HR 面后淘汰", stage: "REJECTED", events: ["HR_INTERVIEW_COMPLETED"], expected: [1, 1, 0] },
    { name: "Offer 后淘汰，缺少面试记录", stage: "REJECTED", events: ["OFFER_RECEIVED"], expected: [1, 1, 1] },
    { name: "只有淘汰历史", stage: "REJECTED", events: ["REJECTED"], expected: [0, 0, 0] },
    { name: "回到笔试，保留二面历史", stage: "ASSESSMENT", events: ["SECOND_INTERVIEW_COMPLETED"], expected: [1, 1, 0] },
    { name: "仅新增历史，不同步当前阶段", stage: "APPLIED", events: ["FIRST_INTERVIEW_COMPLETED"], expected: [1, 0, 0] },
    { name: "当前阶段比历史高", stage: "OFFER", events: ["FIRST_INTERVIEW_COMPLETED"], expected: [1, 1, 1] },
    { name: "阶段与重复历史不重复计数", stage: "OFFER", events: ["FIRST_INTERVIEW_COMPLETED", "SECOND_INTERVIEW_COMPLETED", "OFFER_RECEIVED", "OFFER_RECEIVED"], expected: [1, 1, 1] },
    { name: "淘汰后重复历史不重复计数", stage: "REJECTED", events: ["FIRST_INTERVIEW_COMPLETED", "SECOND_INTERVIEW_COMPLETED", "OFFER_RECEIVED", "OFFER_RECEIVED"], expected: [1, 1, 1] },
    { name: "未来日期，当前二面", stage: "SECOND_INTERVIEW", events: ["SECOND_INTERVIEW_COMPLETED"], eventDate: futureDate, expected: [1, 1, 0] },
    { name: "未来日期，仅有二面历史", stage: "APPLIED", events: ["SECOND_INTERVIEW_COMPLETED"], eventDate: futureDate, expected: [1, 1, 0] },
    { name: "未来日期，仅有 Offer 历史", stage: "REJECTED", events: ["OFFER_RECEIVED"], eventDate: futureDate, expected: [1, 1, 1] },
  ];

  for (const scenario of scenarios) {
    const workspaceId = await createTestWorkspace(ownerId, workspaceIds, scenario.name);
    const company = await db.company.create({
      data: { workspaceId, name: "Evidence Company" },
    });
    const job = await db.job.create({
      data: {
        workspaceId,
        companyId: company.id,
        jobName: scenario.name,
        baseLocation: "Shanghai",
        stage: scenario.stage,
        status: scenario.stage === "REJECTED" ? "FAILED" : "PENDING",
        timelineEvents: {
          create: scenario.events.map((eventType, index) => ({
            eventType,
            eventDate: scenario.eventDate ?? dateAt(index + 1),
          })),
        },
      },
    });
    const data = await getWorkspaceScopedData(ownerId, workspaceId);
    assertProgress(data, scenario.expected, scenario.name);
    assert(
      data.metrics.jobCount === 1 && data.metrics.companyCount === 1 &&
        data.metrics.interviewEntryRate === scenario.expected[0] * 100 &&
        data.metrics.offerCompanyConversionRate === scenario.expected[2] * 100,
      `${scenario.name}：岗位分母、公司分母或比例错误。`,
    );
    assert(
      data.jobs[0]?.stage === scenario.stage &&
        (await db.timelineEvent.count({ where: { jobId: job.id } })) === scenario.events.length,
      `${scenario.name}：统计不得修改当前 Stage 或补写历史记录。`,
    );
    if (scenario.events.length <= 1) {
      assert(
        Object.values(data.processDurations).every((duration) => duration.sampleSize === 0 && duration.averageHours === null),
        `${scenario.name}：阶段推断不得补造耗时样本。`,
      );
    }
  }
  console.info(`- ${scenarios.length} current-stage / historical-event / future-date scenarios`);
}

async function testCorrectionsAndDeletion(
  ownerId: string,
  workspaceIds: string[],
): Promise<void> {
  const workspaceId = await createTestWorkspace(ownerId, workspaceIds, "Dashboard corrections");
  const company = await db.company.create({ data: { workspaceId, name: "Correction Company" } });
  const job = await db.job.create({
    data: { workspaceId, companyId: company.id, jobName: "Correction Job", baseLocation: "Beijing" },
  });
  const readData = () => getWorkspaceScopedData(ownerId, workspaceId);

  const offerMove = await moveJobToStage(workspaceId, job.id, "OFFER");
  assertProgress(await readData(), [1, 1, 1], "移动到 Offer");
  await moveJobToStage(workspaceId, job.id, "APPLIED");
  assertProgress(await readData(), [1, 1, 1], "回退但仍保留 Offer 历史");
  const offerEventId = offerMove.timelineEvent!.id;
  await updateTimelineEvent(workspaceId, job.id, offerEventId, {
    eventType: "OFFER_RECEIVED", eventDate: dateAt(10), remark: "只更正日期和备注",
  });
  assertProgress(await readData(), [1, 1, 1], "修改日期和备注不取消统计资格");
  await updateTimelineEvent(workspaceId, job.id, offerEventId, {
    eventType: "FIRST_INTERVIEW_COMPLETED", eventDate: dateAt(3),
  });
  assertProgress(await readData(), [1, 0, 0], "更正历史类型后重新计算");
  await deleteTimelineEvent(workspaceId, job.id, offerEventId);
  assertProgress(await readData(), [0, 0, 0], "阶段和错误历史都更正后移除统计");

  const secondMove = await moveJobToStage(workspaceId, job.id, "SECOND_INTERVIEW");
  await deleteTimelineEvent(workspaceId, job.id, secondMove.timelineEvent!.id);
  assertProgress(await readData(), [1, 1, 0], "删除历史但当前阶段仍为二面");
  await moveJobToStage(workspaceId, job.id, "APPLIED");
  const manualOffer = await createTimelineEvent(workspaceId, job.id, {
    eventType: "OFFER_RECEIVED", eventDate: dateAt(10),
  }, false);
  assert(manualOffer.syncedStage === null, "手动补录可不同步当前阶段。");
  assertProgress(await readData(), [1, 1, 1], "仅补录历史 Offer");
  await deleteJob(workspaceId, job.id);
  const empty = await readData();
  assertProgress(empty, [0, 0, 0], "删除岗位后移除全部累计统计");
  assert(
    empty.metrics.jobCount === 0 && empty.metrics.companyCount === 0 &&
      empty.metrics.interviewEntryRate === 0 && empty.metrics.offerCompanyConversionRate === 0 &&
      empty.recentActivity.length === 0 &&
      Object.values(empty.processDurations).every((duration) => duration.sampleSize === 0 && duration.averageHours === null),
    "删除最后一个岗位后，分母、比例、耗时样本和最近活动都应清空。",
  );
  assert(await db.timelineEvent.count({ where: { jobId: job.id } }) === 0, "删除岗位应级联删除历史。");
  console.info("- Stage rollback, Timeline corrections, and deletion recalculation");
}

async function testOfferCompanyDeduplication(
  ownerId: string,
  workspaceIds: string[],
): Promise<void> {
  const workspaceId = await createTestWorkspace(ownerId, workspaceIds, "Dashboard Offer deduplication");
  const [company, otherCompany] = await Promise.all([
    db.company.create({ data: { workspaceId, name: "Shared Offer Company" } }),
    db.company.create({ data: { workspaceId, name: "Non Offer Company" } }),
  ]);
  const first = await db.job.create({
    data: { workspaceId, companyId: company.id, jobName: "Historical Offer", baseLocation: "Shanghai" },
  });
  const second = await db.job.create({
    data: { workspaceId, companyId: company.id, jobName: "Current Offer", baseLocation: "Shanghai" },
  });
  await db.job.create({
    data: { workspaceId, companyId: otherCompany.id, jobName: "Applied Job", baseLocation: "Beijing" },
  });
  await moveJobToStage(workspaceId, first.id, "OFFER");
  await moveJobToStage(workspaceId, first.id, "REJECTED");
  await moveJobToStage(workspaceId, second.id, "OFFER");
  // Older progress evidence must not be limited to the ten recent activities.
  await db.timelineEvent.createMany({ data: Array.from({ length: 11 }, (_, index) => ({
    jobId: first.id, eventType: "REJECTED" as const, eventDate: new Date(Date.now() + index * 1_000),
  })) });
  const data = await getWorkspaceScopedData(ownerId, workspaceId);
  assertProgress(data, [2, 2, 2], "同公司两个不同岗位曾获 Offer");
  assert(
    data.metrics.jobCount === 3 && data.metrics.companyCount === 2 &&
      data.metrics.interviewEntryRate === 66.7 && data.metrics.offerCompanyConversionRate === 50,
    "Offer 数量按岗位统计，公司转化率应按 companyId 去重并使用全部有岗位公司作为分母。",
  );
  assert(
    data.recentActivity.length === 10 && data.recentActivity.every((event) => event.eventType === "REJECTED"),
    "累计统计必须读取完整历史，而不是最近十条活动。",
  );
  const durationsBefore = JSON.stringify(data.processDurations);
  await moveJobToStage(workspaceId, second.id, "REJECTED");
  const rejected = await getWorkspaceScopedData(ownerId, workspaceId);
  assertProgress(rejected, [2, 2, 2], "两个 Offer 岗位都淘汰后仍计入");
  assert(rejected.jobs.filter((job) => job.stage === "OFFER").length === 0, "当前状态必须与累计 Offer 数量分开。");
  assert(rejected.metrics.offerCompanyConversionRate === 50, "淘汰不得降低累计 Offer 公司转化率。");
  assert(JSON.stringify(rejected.processDurations) === durationsBefore, "改变当前 Stage 不得改变历史耗时计算。");
  let ownershipRejected = false;
  try {
    await getWorkspaceScopedData(`${ownerId}-another-user`, workspaceId);
  } catch (error: unknown) {
    ownershipRejected = error instanceof WorkspaceNotFoundError;
  }
  assert(ownershipRejected, "统计接口必须继续验证 Workspace 所有权。");

  await deleteJob(workspaceId, first.id);
  const afterFirstDeletion = await getWorkspaceScopedData(ownerId, workspaceId);
  assertProgress(afterFirstDeletion, [1, 1, 1], "删除同公司一个历史 Offer 岗位");
  assert(
    afterFirstDeletion.metrics.jobCount === 2 && afterFirstDeletion.metrics.companyCount === 2 &&
      afterFirstDeletion.metrics.interviewEntryRate === 50 && afterFirstDeletion.metrics.offerCompanyConversionRate === 50,
    "删除一个 Offer 岗位后应调整岗位计数，但同公司仍有另一个历史 Offer 时，公司转化率应保持。",
  );
  await deleteJob(workspaceId, second.id);
  const afterSecondDeletion = await getWorkspaceScopedData(ownerId, workspaceId);
  assertProgress(afterSecondDeletion, [0, 0, 0], "删除该公司最后一个历史 Offer 岗位");
  assert(
    afterSecondDeletion.metrics.jobCount === 1 && afterSecondDeletion.metrics.companyCount === 1 &&
      afterSecondDeletion.metrics.interviewEntryRate === 0 && afterSecondDeletion.metrics.offerCompanyConversionRate === 0,
    "删除最后一个历史 Offer 岗位后，应移除对应公司并重新计算全部比例。",
  );
  console.info("- Historical Offer company deduplication, complete history, and ownership checks");
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

    const offerJob = await db.job.create({
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

    assert(data.metrics.companyCount === 3, "投递公司数量应只统计仍有岗位的 Company。");
    assert(data.metrics.jobCount === 3, "投递岗位数量应使用 Job 数量。");
    assert(data.metrics.interviewEntryCount === 2, "进入面试岗位数量统计错误。");
    assert(data.metrics.interviewEntryRate === 66.7, "面试进入率计算错误。");
    assert(data.metrics.offerCount === 1, "Offer 岗位数量统计错误。");
    assert(data.metrics.offerCompanyConversionRate === 33.3, "Offer 公司转化率计算错误。");

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

    await moveJobToStage(workspace.id, offerJob.id, "REJECTED");
    const afterRejection = await getWorkspaceScopedData(owner.id, workspace.id);
    assertProgress(afterRejection, [2, 2, 1], "真实 Offer 岗位淘汰后保留累计统计");
    assert(JSON.stringify(afterRejection.processDurations) === JSON.stringify(data.processDurations), "淘汰后平均流程耗时和样本数应保持不变。");

    await testProgressEvidence(owner.id, workspaceIds);
    await testCorrectionsAndDeletion(owner.id, workspaceIds);
    await testOfferCompanyDeduplication(owner.id, workspaceIds);

    const originalData = await getWorkspaceScopedData(owner.id, workspace.id);
    assertProgress(originalData, [2, 2, 1], "其他 Workspace 的历史不得影响当前统计");
    assert(originalData.metrics.jobCount === 3 && originalData.metrics.companyCount === 3, "其他 Workspace 的岗位和公司不得影响分母。");

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
