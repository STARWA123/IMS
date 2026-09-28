import { db } from "../src/db/client";
import {
  CompanyOfferConflictError,
  createJob,
  listJobs,
  moveJobToStage,
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
  const workspace = await createWorkspace({ ownerId: owner.id, name: `Kanban测试-${marker}` });
  const otherWorkspace = await createWorkspace({ ownerId: owner.id, name: `Kanban隔离-${marker}` });

  try {
    const first = await createJob(workspace.id, {
      companyName: "流转科技",
      jobName: "前端工程师",
      baseLocation: "北京",
    });
    const second = await createJob(workspace.id, {
      companyName: "流转科技",
      jobName: "后端工程师",
      baseLocation: "上海",
    });

    const crossed = await moveJobToStage(
      workspace.id,
      first.job.id,
      "THIRD_INTERVIEW",
    );
    assert(crossed.previousStage === "APPLIED", "应记录原 Stage。");
    assert(crossed.job.stage === "THIRD_INTERVIEW", "岗位应支持跨列移动。");
    assert(crossed.job.status === "PENDING", "普通 Stage 的 Status 应重置为 PENDING。");
    assert(
      crossed.timelineEvent?.eventType === "THIRD_INTERVIEW_COMPLETED",
      "跨入三面应生成对应 TimelineEvent。",
    );
    assert(
      (await listJobs(workspace.id))[0]?.id === first.job.id,
      "移动后的岗位应按最新 updatedAt 排在列内前方。",
    );

    const secondInterview = await moveJobToStage(
      workspace.id,
      first.job.id,
      "SECOND_INTERVIEW",
    );
    assert(
      secondInterview.timelineEvent?.eventType === "SECOND_INTERVIEW_COMPLETED",
      "每次跨列移动都必须生成对应 TimelineEvent。",
    );

    const rejected = await moveJobToStage(
      workspace.id,
      first.job.id,
      "REJECTED",
    );
    assert(rejected.job.status === "FAILED", "进入淘汰应自动设为 FAILED。");
    assert(rejected.timelineEvent?.eventType === "REJECTED", "进入淘汰应记录 REJECTED。");

    const offered = await moveJobToStage(
      workspace.id,
      first.job.id,
      "OFFER",
    );
    assert(offered.job.status === "PENDING", "进入 Offer 应按通用规则设为 PENDING。");
    assert(offered.timelineEvent?.eventType === "OFFER_RECEIVED", "进入 Offer 应记录 OFFER_RECEIVED。");

    let offerConflictDetected = false;
    try {
      await moveJobToStage(workspace.id, second.job.id, "OFFER");
    } catch (error: unknown) {
      offerConflictDetected = error instanceof CompanyOfferConflictError;
    }
    assert(offerConflictDetected, "同一公司已有 Offer 时必须禁止第二个岗位进入 Offer。");
    const unchangedSecond = await db.job.findUnique({ where: { id: second.job.id } });
    assert(unchangedSecond?.stage === "APPLIED", "Offer 冲突后岗位 Stage 不得改变。");
    assert(
      (await db.timelineEvent.count({ where: { jobId: second.job.id } })) === 1,
      "Offer 冲突后不得创建 TimelineEvent。",
    );

    const isolatedJob = await createJob(otherWorkspace.id, {
      companyName: "流转科技",
      jobName: "隔离岗位",
      baseLocation: "深圳",
    });
    const isolatedOffer = await moveJobToStage(
      otherWorkspace.id,
      isolatedJob.job.id,
      "OFFER",
    );
    assert(isolatedOffer.job.stage === "OFFER", "Offer 限制不得跨 Workspace。");

    console.info("Kanban module tests passed:");
    console.info("- Arbitrary cross-stage movement");
    console.info("- updatedAt DESC sorting after movement");
    console.info("- Mandatory Timeline creation for every Stage change");
    console.info("- REJECTED sets FAILED");
    console.info("- One Offer per company within a Workspace");
    console.info("- Workspace isolation");
  } finally {
    await db.workspace.deleteMany({
      where: { id: { in: [workspace.id, otherWorkspace.id] } },
    });
    await db.user.delete({ where: { id: owner.id } });
  }
}

run()
  .catch((error: unknown) => {
    console.error("Kanban module tests failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
