import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { EventType, Stage } from "../src/generated/prisma/client";
import { db } from "../src/db/client";
import { createDatabaseBackup } from "../src/modules/data-management/database-backup-service";

const DEMO_MARKER = "[演示数据]";

type DemoEvent = {
  eventType: EventType;
  day: number;
  remark: string;
};

type DemoJob = {
  companyName: string;
  jobName: string;
  baseLocation: string;
  jobUrl: string;
  stage: Stage;
  remark: string;
  events: DemoEvent[];
};

function eventDate(day: number, order: number): Date {
  const dayText = day.toString().padStart(2, "0");
  const hourText = (9 + Math.min(order, 8)).toString().padStart(2, "0");
  return new Date(`2026-09-${dayText}T${hourText}:00:00+08:00`);
}

const demoJobs: DemoJob[] = [
  {
    companyName: "星轨智造",
    jobName: "产品经理",
    baseLocation: "上海",
    jobUrl: "https://example.com/jobs/xinggui-product-manager",
    stage: "APPLIED",
    remark: `${DEMO_MARKER} 关注智能硬件与用户体验方向`,
    events: [{ eventType: "APPLIED", day: 24, remark: "通过公司招聘官网完成投递" }],
  },
  {
    companyName: "蓝桥云服",
    jobName: "用户研究员",
    baseLocation: "北京",
    jobUrl: "https://example.com/jobs/lanqiao-user-research",
    stage: "APPLIED",
    remark: `${DEMO_MARKER} ToB 云服务用户研究岗位`,
    events: [{ eventType: "APPLIED", day: 23, remark: "通过校园招聘页面完成投递" }],
  },
  {
    companyName: "万象零售",
    jobName: "数据产品经理",
    baseLocation: "杭州",
    jobUrl: "https://example.com/jobs/wanxiang-data-product",
    stage: "APPLIED",
    remark: `${DEMO_MARKER} 零售数字化产品方向`,
    events: [{ eventType: "APPLIED", day: 22, remark: "内推渠道投递成功" }],
  },
  {
    companyName: "拾光科技",
    jobName: "商业分析师",
    baseLocation: "深圳",
    jobUrl: "https://example.com/jobs/shiguang-business-analysis",
    stage: "ASSESSMENT",
    remark: `${DEMO_MARKER} 商业策略与经营分析方向`,
    events: [
      { eventType: "APPLIED", day: 18, remark: "完成网申" },
      { eventType: "ASSESSMENT_COMPLETED", day: 20, remark: "完成在线逻辑与数据分析测评" },
    ],
  },
  {
    companyName: "远帆物流",
    jobName: "供应链产品经理",
    baseLocation: "广州",
    jobUrl: "https://example.com/jobs/yuanfan-supply-chain-product",
    stage: "ASSESSMENT",
    remark: `${DEMO_MARKER} 供应链计划与履约产品方向`,
    events: [
      { eventType: "APPLIED", day: 17, remark: "校园招聘系统投递" },
      { eventType: "ASSESSMENT_COMPLETED", day: 19, remark: "完成业务情景测评" },
    ],
  },
  {
    companyName: "云杉网络",
    jobName: "测试开发工程师",
    baseLocation: "成都",
    jobUrl: "https://example.com/jobs/yunshan-sdet",
    stage: "ASSESSMENT",
    remark: `${DEMO_MARKER} 自动化测试与质量平台方向`,
    events: [
      { eventType: "APPLIED", day: 16, remark: "官网投递完成" },
      { eventType: "ASSESSMENT_COMPLETED", day: 18, remark: "完成在线编程测评" },
    ],
  },
  {
    companyName: "棱镜智能",
    jobName: "AI产品经理",
    baseLocation: "北京",
    jobUrl: "https://example.com/jobs/lingjing-ai-product",
    stage: "FIRST_INTERVIEW",
    remark: `${DEMO_MARKER} 企业级 AI 应用产品方向`,
    events: [
      { eventType: "APPLIED", day: 10, remark: "完成岗位投递" },
      { eventType: "ASSESSMENT_COMPLETED", day: 12, remark: "完成产品案例测评" },
      { eventType: "FIRST_INTERVIEW_COMPLETED", day: 15, remark: "完成业务一面，讨论产品经历与案例" },
    ],
  },
  {
    companyName: "海岸数据",
    jobName: "数据分析师",
    baseLocation: "上海",
    jobUrl: "https://example.com/jobs/haian-data-analyst",
    stage: "FIRST_INTERVIEW",
    remark: `${DEMO_MARKER} 用户增长与经营分析方向`,
    events: [
      { eventType: "APPLIED", day: 9, remark: "招聘官网投递完成" },
      { eventType: "ASSESSMENT_COMPLETED", day: 11, remark: "完成 SQL 与分析能力测评" },
      { eventType: "FIRST_INTERVIEW_COMPLETED", day: 14, remark: "完成数据分析业务一面" },
    ],
  },
  {
    companyName: "经纬软件",
    jobName: "后端开发工程师",
    baseLocation: "杭州",
    jobUrl: "https://example.com/jobs/jingwei-backend",
    stage: "SECOND_INTERVIEW",
    remark: `${DEMO_MARKER} Java 服务端与分布式系统方向`,
    events: [
      { eventType: "APPLIED", day: 5, remark: "完成官网投递" },
      { eventType: "ASSESSMENT_COMPLETED", day: 8, remark: "完成在线编程题" },
      { eventType: "FIRST_INTERVIEW_COMPLETED", day: 12, remark: "完成技术一面" },
      { eventType: "SECOND_INTERVIEW_COMPLETED", day: 17, remark: "完成系统设计二面" },
    ],
  },
  {
    companyName: "启明互娱",
    jobName: "游戏运营",
    baseLocation: "深圳",
    jobUrl: "https://example.com/jobs/qiming-game-operation",
    stage: "SECOND_INTERVIEW",
    remark: `${DEMO_MARKER} 游戏活动与用户运营方向`,
    events: [
      { eventType: "APPLIED", day: 4, remark: "校园招聘页面投递" },
      { eventType: "ASSESSMENT_COMPLETED", day: 7, remark: "完成游戏理解测评" },
      { eventType: "FIRST_INTERVIEW_COMPLETED", day: 11, remark: "完成运营业务一面" },
      { eventType: "SECOND_INTERVIEW_COMPLETED", day: 16, remark: "完成综合业务二面" },
    ],
  },
  {
    companyName: "墨丘设计",
    jobName: "交互设计师",
    baseLocation: "广州",
    jobUrl: "https://example.com/jobs/moqiu-interaction-designer",
    stage: "THIRD_INTERVIEW",
    remark: `${DEMO_MARKER} 企业服务产品交互设计方向`,
    events: [
      { eventType: "APPLIED", day: 1, remark: "提交简历与作品集" },
      { eventType: "ASSESSMENT_COMPLETED", day: 3, remark: "完成设计作业" },
      { eventType: "FIRST_INTERVIEW_COMPLETED", day: 6, remark: "完成作品集一面" },
      { eventType: "SECOND_INTERVIEW_COMPLETED", day: 9, remark: "完成设计负责人二面" },
      { eventType: "THIRD_INTERVIEW_COMPLETED", day: 13, remark: "完成跨团队综合三面" },
    ],
  },
  {
    companyName: "澄川科技",
    jobName: "产品运营",
    baseLocation: "成都",
    jobUrl: "https://example.com/jobs/chengchuan-product-operation",
    stage: "HR_INTERVIEW",
    remark: `${DEMO_MARKER} 内容产品与商业化运营方向`,
    events: [
      { eventType: "APPLIED", day: 1, remark: "完成岗位投递" },
      { eventType: "ASSESSMENT_COMPLETED", day: 4, remark: "完成运营案例测评" },
      { eventType: "FIRST_INTERVIEW_COMPLETED", day: 8, remark: "完成业务一面" },
      { eventType: "SECOND_INTERVIEW_COMPLETED", day: 12, remark: "完成业务负责人二面" },
      { eventType: "THIRD_INTERVIEW_COMPLETED", day: 16, remark: "完成交叉三面" },
      { eventType: "HR_INTERVIEW_COMPLETED", day: 20, remark: "完成 HR 面与薪资沟通" },
    ],
  },
  {
    companyName: "砺行咨询",
    jobName: "管理咨询顾问",
    baseLocation: "北京",
    jobUrl: "https://example.com/jobs/lixing-consultant",
    stage: "OFFER",
    remark: `${DEMO_MARKER} 数字化转型与战略咨询方向`,
    events: [
      { eventType: "APPLIED", day: 2, remark: "完成网申" },
      { eventType: "ASSESSMENT_COMPLETED", day: 5, remark: "完成案例测评" },
      { eventType: "FIRST_INTERVIEW_COMPLETED", day: 9, remark: "完成案例一面" },
      { eventType: "SECOND_INTERVIEW_COMPLETED", day: 13, remark: "完成经理二面" },
      { eventType: "THIRD_INTERVIEW_COMPLETED", day: 17, remark: "完成合伙人三面" },
      { eventType: "HR_INTERVIEW_COMPLETED", day: 21, remark: "完成 HR 沟通" },
      { eventType: "OFFER_RECEIVED", day: 24, remark: "已收到正式录用通知" },
    ],
  },
  {
    companyName: "峰谷能源",
    jobName: "项目管理专员",
    baseLocation: "上海",
    jobUrl: "https://example.com/jobs/fenggu-project-management",
    stage: "REJECTED",
    remark: `${DEMO_MARKER} 新能源项目交付方向，流程已结束`,
    events: [
      { eventType: "APPLIED", day: 6, remark: "完成岗位投递" },
      { eventType: "ASSESSMENT_COMPLETED", day: 9, remark: "完成综合能力测评" },
      { eventType: "REJECTED", day: 12, remark: "收到流程终止通知" },
    ],
  },
  {
    companyName: "青岚生物",
    jobName: "市场专员",
    baseLocation: "苏州",
    jobUrl: "https://example.com/jobs/qinglan-marketing",
    stage: "REJECTED",
    remark: `${DEMO_MARKER} 医疗科技市场方向，流程已结束`,
    events: [
      { eventType: "APPLIED", day: 8, remark: "完成校园招聘投递" },
      { eventType: "ASSESSMENT_COMPLETED", day: 11, remark: "完成市场案例测评" },
      { eventType: "FIRST_INTERVIEW_COMPLETED", day: 15, remark: "完成市场业务一面" },
      { eventType: "REJECTED", day: 20, remark: "收到未进入下一轮通知" },
    ],
  },
];

function backupTimestamp(): string {
  return new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
}

async function seedShowcaseData(): Promise<void> {
  const workspace = await db.workspace.findFirst({
    where: { name: "测试空间" },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, name: true },
  });
  if (!workspace) {
    throw new Error("未找到名为“测试空间”的 Workspace。");
  }

  const existingDemoCount = await db.job.count({
    where: { workspaceId: workspace.id, remark: { startsWith: DEMO_MARKER } },
  });
  if (existingDemoCount > 0) {
    throw new Error(`测试空间中已存在 ${existingDemoCount} 条演示数据，已停止重复写入。`);
  }

  const backup = await createDatabaseBackup();
  const backupDirectory = resolve(process.cwd(), "backups");
  const backupPath = resolve(
    backupDirectory,
    `offertrack-before-showcase-seed-${backupTimestamp()}.db`,
  );
  await mkdir(backupDirectory, { recursive: true });
  await writeFile(backupPath, backup.buffer);

  const result = await db.$transaction(async (transaction) => {
    let timelineEventCount = 0;
    for (const input of demoJobs) {
      const firstDate = eventDate(input.events[0]!.day, 0);
      const lastDate = eventDate(
        input.events[input.events.length - 1]!.day,
        input.events.length - 1,
      );
      const company = await transaction.company.create({
        data: {
          workspaceId: workspace.id,
          name: input.companyName,
          createdAt: firstDate,
        },
      });
      const job = await transaction.job.create({
        data: {
          workspaceId: workspace.id,
          companyId: company.id,
          jobName: input.jobName,
          baseLocation: input.baseLocation,
          jobUrl: input.jobUrl,
          stage: input.stage,
          status: input.stage === "REJECTED" ? "FAILED" : "PENDING",
          remark: input.remark,
          createdAt: firstDate,
          updatedAt: lastDate,
        },
      });
      await transaction.timelineEvent.createMany({
        data: input.events.map((event, index) => ({
          jobId: job.id,
          eventType: event.eventType,
          eventDate: eventDate(event.day, index),
          remark: event.remark,
          createdAt: eventDate(event.day, index),
        })),
      });
      timelineEventCount += input.events.length;
    }
    return { jobCount: demoJobs.length, timelineEventCount };
  }, { timeout: 60_000 });

  const [demoJobCount, demoTimelineCount, workspaceJobCount] = await Promise.all([
    db.job.count({
      where: { workspaceId: workspace.id, remark: { startsWith: DEMO_MARKER } },
    }),
    db.timelineEvent.count({
      where: {
        job: {
          workspaceId: workspace.id,
          remark: { startsWith: DEMO_MARKER },
        },
      },
    }),
    db.job.count({ where: { workspaceId: workspace.id } }),
  ]);
  if (
    demoJobCount !== result.jobCount ||
    demoTimelineCount !== result.timelineEventCount
  ) {
    throw new Error("演示数据写入后的数量校验失败。");
  }

  console.info(JSON.stringify({
    workspace: workspace.name,
    backupPath,
    createdJobs: demoJobCount,
    createdTimelineEvents: demoTimelineCount,
    workspaceJobCount,
  }, null, 2));
}

seedShowcaseData()
  .catch((error: unknown) => {
    console.error("演示数据生成失败：", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
