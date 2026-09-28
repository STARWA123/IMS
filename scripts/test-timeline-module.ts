import { db } from "../src/db/client";
import {
  CompanyOfferConflictError,
  createJob,
  moveJobToStage,
} from "../src/modules/job/job-service";
import {
  createTimelineEvent,
  deleteTimelineEvent,
  listTimelineEvents,
  updateTimelineEvent,
} from "../src/modules/timeline/timeline-service";
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
  const workspace = await createWorkspace({ ownerId: owner.id, name: `Timeline测试-${marker}` });

  try {
    const first = await createJob(workspace.id, {
      companyName: "时序科技",
      jobName: "前端工程师",
      baseLocation: "北京",
    });
    const second = await createJob(workspace.id, {
      companyName: "时序科技",
      jobName: "后端工程师",
      baseLocation: "上海",
    });
    const initialEvents = await listTimelineEvents(workspace.id, first.job.id);
    assert(
      initialEvents.length === 1 && initialEvents[0]?.eventType === "APPLIED",
      "创建岗位应自动生成投递提交 Timeline。",
    );

    const baseTime = Date.now();
    const manual = await createTimelineEvent(
      workspace.id,
      first.job.id,
      {
        eventType: "FIRST_INTERVIEW_COMPLETED",
        eventDate: new Date(baseTime + 1_000),
        remark: "手动新增测试",
      },
      false,
    );
    assert(manual.syncedStage === null, "选择不同步时不得更新岗位 Stage。");
    assert(
      (await db.job.findUnique({ where: { id: first.job.id } }))?.stage === "APPLIED",
      "仅新增 Timeline 后岗位 Stage 应保持不变。",
    );

    await db.job.update({
      where: { id: first.job.id },
      data: { status: "COMPLETED" },
    });
    const synced = await createTimelineEvent(
      workspace.id,
      first.job.id,
      {
        eventType: "SECOND_INTERVIEW_COMPLETED",
        eventDate: new Date(baseTime + 2_000),
        remark: "同步 Stage 测试",
      },
      true,
    );
    assert(synced.syncedStage === "SECOND_INTERVIEW", "二面完成应同步到二面 Stage。");
    assert(synced.jobStatus === "PENDING", "普通 Stage 同步应将 Status 设为 PENDING。");
    const jobAfterSync = await db.job.findUnique({ where: { id: first.job.id } });
    assert(
      jobAfterSync?.stage === "SECOND_INTERVIEW" && jobAfterSync.status === "PENDING",
      "岗位 Stage 与 Status 应在新增 Timeline 时同步更新。",
    );

    const edited = await updateTimelineEvent(
      workspace.id,
      first.job.id,
      manual.timelineEvent.id,
      {
        eventType: "THIRD_INTERVIEW_COMPLETED",
        eventDate: new Date(baseTime + 3_000),
        remark: "编辑后的备注",
      },
    );
    assert(edited.eventType === "THIRD_INTERVIEW_COMPLETED", "Timeline 事件类型应可编辑。");
    assert(edited.remark === "编辑后的备注", "Timeline 备注应可编辑。");
    assert(
      (await listTimelineEvents(workspace.id, first.job.id))[0]?.id === edited.id,
      "Timeline 应按 eventDate DESC 展示。",
    );
    assert(
      (await db.job.findUnique({ where: { id: first.job.id } }))?.stage === "SECOND_INTERVIEW",
      "编辑 Timeline 不应隐式更新岗位 Stage。",
    );

    await deleteTimelineEvent(
      workspace.id,
      first.job.id,
      manual.timelineEvent.id,
    );
    assert(
      (await db.timelineEvent.count({ where: { id: manual.timelineEvent.id } })) === 0,
      "Timeline 删除应移除指定记录。",
    );
    assert(
      (await db.job.findUnique({ where: { id: first.job.id } }))?.stage === "SECOND_INTERVIEW",
      "删除 Timeline 不应回滚岗位 Stage。",
    );

    const rejected = await createTimelineEvent(
      workspace.id,
      first.job.id,
      {
        eventType: "REJECTED",
        eventDate: new Date(baseTime + 4_000),
      },
      true,
    );
    assert(
      rejected.syncedStage === "REJECTED" && rejected.jobStatus === "FAILED",
      "淘汰事件同步应设置 REJECTED / FAILED。",
    );

    await moveJobToStage(workspace.id, second.job.id, "OFFER");
    const countBeforeOfferConflict = await db.timelineEvent.count({
      where: { jobId: first.job.id },
    });
    let offerConflictDetected = false;
    try {
      await createTimelineEvent(
        workspace.id,
        first.job.id,
        {
          eventType: "OFFER_RECEIVED",
          eventDate: new Date(baseTime + 5_000),
        },
        true,
      );
    } catch (error: unknown) {
      offerConflictDetected = error instanceof CompanyOfferConflictError;
    }
    assert(offerConflictDetected, "Timeline 同步 Offer 时必须执行同公司唯一性检查。");
    assert(
      (await db.timelineEvent.count({ where: { jobId: first.job.id } })) ===
        countBeforeOfferConflict,
      "Offer 冲突时不得写入 Timeline。",
    );

    console.info("Timeline module tests passed:");
    console.info("- Automatic APPLIED event on Job creation");
    console.info("- Timeline eventDate DESC sorting");
    console.info("- Manual create with optional Stage sync");
    console.info("- Timeline edit without implicit Stage change");
    console.info("- Timeline delete without Stage rollback");
    console.info("- PENDING / FAILED status synchronization");
    console.info("- Offer uniqueness during Timeline sync");
  } finally {
    await db.workspace.deleteMany({ where: { id: workspace.id } });
    await db.user.delete({ where: { id: owner.id } });
  }
}

run()
  .catch((error: unknown) => {
    console.error("Timeline module tests failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
