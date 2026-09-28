import { randomUUID } from "node:crypto";
import ExcelJS from "exceljs";
import { db } from "../src/db/client";
import {
  importJobsFromWorkbook,
  JobImportBlockedError,
  previewJobImport,
} from "../src/modules/data-management/job-import-service";
import {
  createJobImportTemplate,
  jobImportHeaders,
  jobImportSheetName,
} from "../src/modules/data-management/job-import-template-service";
import { createTestOwner } from "./test-user-helper";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function workbookBuffer(rows: Array<Array<string | null>>): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(jobImportSheetName);
  worksheet.addRow([...jobImportHeaders]);
  rows.forEach((row) => worksheet.addRow(row));
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function shanghaiDateAndTime(value: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(value);
}

async function testJobImportModule(): Promise<void> {
  const token = randomUUID();
  const owner = await createTestOwner(token);
  const workspace = await db.workspace.create({
    data: { ownerId: owner.id, name: `Import Test ${token}` },
    select: { id: true },
  });
  const isolatedWorkspace = await db.workspace.create({
    data: { ownerId: owner.id, name: `Import Isolation ${token}` },
    select: { id: true },
  });

  try {
    const template = await createJobImportTemplate();
    const templateWorkbook = new ExcelJS.Workbook();
    await templateWorkbook.xlsx.load(template.buffer as unknown as ExcelJS.Buffer);
    const templateSheet = templateWorkbook.getWorksheet(jobImportSheetName);
    assert(Boolean(templateSheet), "导入模板缺少岗位导入 Sheet。");
    assert(
      (templateSheet!.getRow(1).values as ExcelJS.CellValue[]).slice(1).join("|") ===
        jobImportHeaders.join("|"),
      "导入模板字段或顺序错误。",
    );
    assert(templateSheet!.views[0]?.state === "frozen", "导入模板首行没有冻结。");
    assert(Boolean(templateSheet!.autoFilter), "导入模板没有启用表头筛选。");

    await db.company.create({
      data: { workspaceId: workspace.id, name: "复用公司" },
    });

    const validWorkbook = await workbookBuffer([
      ["复用公司", "产品经理", null, "https://example.com/job/1", "缺省投递日期", null, null, null, null, null, null, null, null],
      ["稀疏公司", "策略产品", "北京", null, null, "2026-01-01", null, null, "2026-01-10", null, null, null, null],
      ["Offer公司", "平台产品", "上海", null, null, "2026/02/01", null, null, null, null, null, "2026/02/10", null],
      ["终止公司", "增长产品", "深圳", null, null, "2026-03-01", null, null, null, null, null, "2026-03-10", "2026-03-11"],
    ]);

    const preview = await previewJobImport(workspace.id, validWorkbook, "valid.xlsx");
    assert(preview.readyRows === 4, "有效文件应有 4 个可导入岗位。");
    assert(preview.errorRows === 0, "有效文件不应包含错误行。");
    assert(preview.timelineEventCount === 8, "Timeline 预检数量错误。");
    assert(preview.generatedAppliedDates === 1, "缺省投递日期统计错误。");

    const result = await importJobsFromWorkbook(workspace.id, validWorkbook, "valid.xlsx");
    assert(result.importedJobs === 4, "岗位导入数量错误。");
    assert(result.createdTimelineEvents === 8, "Timeline 创建数量错误。");
    assert(result.reusedCompanies === 1, "已有公司复用数量错误。");
    assert(result.createdCompanies === 3, "新建公司数量错误。");

    const jobs = await db.job.findMany({
      where: { workspaceId: workspace.id },
      include: { company: true, timelineEvents: { orderBy: { eventDate: "asc" } } },
    });
    assert(jobs.length === 4, "数据库岗位数量错误。");
    const appliedOnly = jobs.find((job) => job.company.name === "复用公司");
    const sparse = jobs.find((job) => job.company.name === "稀疏公司");
    const offer = jobs.find((job) => job.company.name === "Offer公司");
    const rejected = jobs.find((job) => job.company.name === "终止公司");
    assert(Boolean(appliedOnly && sparse && offer && rejected), "导入岗位缺失。");
    assert(appliedOnly!.baseLocation === "未填写", "空 Base 未转换为“未填写”。");
    assert(appliedOnly!.stage === "APPLIED", "缺省投递岗位 Stage 错误。");
    assert(appliedOnly!.timelineEvents.length === 1, "缺省投递岗位应只生成投递事件。");
    assert(
      shanghaiDateAndTime(appliedOnly!.timelineEvents[0].eventDate).endsWith("09:00"),
      "缺省投递时间不是上海时区 09:00。",
    );
    assert(sparse!.stage === "SECOND_INTERVIEW", "稀疏里程碑最终 Stage 错误。");
    assert(
      sparse!.timelineEvents.map((event) => event.eventType).join("|") ===
        "APPLIED|SECOND_INTERVIEW_COMPLETED",
      "稀疏里程碑创建了未填写的 Timeline。",
    );
    assert(offer!.stage === "OFFER" && offer!.status === "PENDING", "Offer 状态映射错误。");
    assert(
      rejected!.stage === "REJECTED" && rejected!.status === "FAILED",
      "终止日期没有覆盖最终 Stage/Status。",
    );

    const duplicatePreview = await previewJobImport(
      workspace.id,
      validWorkbook,
      "duplicates.xlsx",
    );
    assert(
      duplicatePreview.duplicateRows === 4 && duplicatePreview.readyRows === 0,
      "已存在岗位未按公司名称和岗位名称跳过。",
    );

    const badWorkbook = await workbookBuffer([
      ["错误公司", null, "广州", null, null, "2026-04-01", null, null, null, null, null, null, null],
      ["倒序公司", "测试岗位", "广州", null, null, "2026-04-10", null, "2026-04-05", null, null, null, null, null],
    ]);
    const badPreview = await previewJobImport(workspace.id, badWorkbook, "bad.xlsx");
    assert(badPreview.errorRows === 2, "错误数据预检数量错误。");
    const beforeBlockedImport = await db.job.count({ where: { workspaceId: workspace.id } });
    let blocked = false;
    try {
      await importJobsFromWorkbook(workspace.id, badWorkbook, "bad.xlsx");
    } catch (error: unknown) {
      blocked = error instanceof JobImportBlockedError;
    }
    assert(blocked, "存在错误行时没有阻断整批导入。");
    assert(
      (await db.job.count({ where: { workspaceId: workspace.id } })) === beforeBlockedImport,
      "被阻断的导入写入了部分数据。",
    );

    const offerConflictWorkbook = await workbookBuffer([
      ["Offer公司", "另一个岗位", "上海", null, null, "2026-05-01", null, null, null, null, null, "2026-05-10", null],
    ]);
    const offerConflict = await previewJobImport(
      workspace.id,
      offerConflictWorkbook,
      "offer-conflict.xlsx",
    );
    assert(offerConflict.errorRows === 1, "同公司第二个 Offer 没有被预检阻断。");

    const isolatedPreview = await previewJobImport(
      isolatedWorkspace.id,
      validWorkbook,
      "isolated.xlsx",
    );
    assert(
      isolatedPreview.readyRows === 4 && isolatedPreview.duplicateRows === 0,
      "不同 Workspace 的同名岗位没有保持隔离。",
    );

    console.info("Job import module verified:");
    console.info("- Styled .xlsx template and exact header contract");
    console.info("- Preview, date normalization, sparse milestones, and Stage mapping");
    console.info("- Duplicate skip, Offer protection, and Workspace isolation");
    console.info("- Error rows block the complete transactional import");
  } finally {
    await db.user.delete({ where: { id: owner.id } });
    await db.$disconnect();
  }
}

testJobImportModule().catch((error: unknown) => {
  console.error("Job import module verification failed:", error);
  process.exitCode = 1;
});
