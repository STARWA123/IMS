import { mkdir, rmdir, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import ExcelJS from "exceljs";
import { db } from "../src/db/client";
import {
  createDatabaseBackup,
  InvalidDatabaseBackupError,
  restoreDatabaseFile,
  validateOfferTrackDatabase,
} from "../src/modules/data-management/database-backup-service";
import { createWorkspaceExcelExport } from "../src/modules/data-management/excel-export-service";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

async function removeIfPresent(filePath: string): Promise<void> {
  await unlink(filePath).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") {
      throw error;
    }
  });
}

async function testDataManagementModule(): Promise<void> {
  const workspace = await db.workspace.findFirst({
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, name: true },
  });
  if (!workspace) {
    throw new Error("需要至少一个 Workspace 才能测试 Excel 导出。");
  }

  const outputDirectory = resolve(process.cwd(), "outputs");
  const temporaryDirectory = resolve(
    process.cwd(),
    "data",
    `data-management-${randomUUID()}`,
  );
  const temporaryBackup = resolve(temporaryDirectory, "backup.db");
  const restoreTarget = resolve(temporaryDirectory, "restore-target.db");
  await Promise.all([
    mkdir(outputDirectory, { recursive: true }),
    mkdir(temporaryDirectory, { recursive: true }),
  ]);

  try {
    const exported = await createWorkspaceExcelExport(workspace.id);
    const exportPath = resolve(outputDirectory, exported.fileName);
    await writeFile(exportPath, exported.buffer);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(exported.buffer as unknown as ExcelJS.Buffer);
    assert(
      workbook.worksheets.map((sheet) => sheet.name).join("|") ===
        "岗位信息|Timeline",
      "Excel Sheet 名称或顺序错误。",
    );

    const jobsSheet = workbook.getWorksheet("岗位信息");
    const timelineSheet = workbook.getWorksheet("Timeline");
    assert(Boolean(jobsSheet && timelineSheet), "Excel 缺少必要 Sheet。");
    const jobHeaders = jobsSheet!.getRow(1).values as ExcelJS.CellValue[];
    const timelineHeaders = timelineSheet!.getRow(1).values as ExcelJS.CellValue[];
    assert(
      jobHeaders.slice(1).join("|") ===
        "公司|岗位|Base|Stage|链接|备注|更新时间",
      "岗位信息字段错误。",
    );
    assert(
      timelineHeaders.slice(1).join("|") ===
        "公司|岗位|事件|时间|备注",
      "Timeline 字段错误。",
    );
    assert(jobsSheet!.rowCount === exported.jobCount + 1, "岗位导出数量错误。");
    assert(
      timelineSheet!.rowCount === exported.timelineEventCount + 1,
      "Timeline 导出数量错误。",
    );
    if (exported.jobCount) {
      assert(
        jobsSheet!.getRow(2).getCell(7).value instanceof Date,
        "岗位更新时间必须是 Excel 日期值。",
      );
    }
    if (exported.timelineEventCount) {
      assert(
        timelineSheet!.getRow(2).getCell(4).value instanceof Date,
        "Timeline 时间必须是 Excel 日期值。",
      );
    }

    const backup = await createDatabaseBackup();
    await writeFile(temporaryBackup, backup.buffer);
    const backupSummary = validateOfferTrackDatabase(temporaryBackup);
    assert(
      JSON.stringify(backupSummary) === JSON.stringify(backup.summary),
      "SQLite 备份统计与快照内容不一致。",
    );

    await writeFile(restoreTarget, backup.buffer);
    const disposableDatabase = new Database(restoreTarget);
    disposableDatabase
      .prepare(
        'DELETE FROM "TimelineEvent" WHERE "id" = (SELECT "id" FROM "TimelineEvent" LIMIT 1)',
      )
      .run();
    disposableDatabase.close();

    const restoredSummary = await restoreDatabaseFile(backup.buffer, restoreTarget);
    assert(
      JSON.stringify(restoredSummary) === JSON.stringify(backup.summary),
      "SQLite 恢复后的数据统计错误。",
    );
    assert(
      JSON.stringify(validateOfferTrackDatabase(restoreTarget)) ===
        JSON.stringify(backup.summary),
      "SQLite 恢复文件验证失败。",
    );

    let invalidBackupRejected = false;
    try {
      await restoreDatabaseFile(Buffer.from("not a sqlite database"), restoreTarget);
    } catch (error: unknown) {
      invalidBackupRejected = error instanceof InvalidDatabaseBackupError;
    }
    assert(invalidBackupRejected, "恢复逻辑必须拒绝无效 SQLite 文件。");

    console.info("Data management module verified:");
    console.info(`- Excel export: ${exportPath}`);
    console.info("- Required sheets, fields, row counts, and typed dates");
    console.info("- SQLite snapshot integrity and table relationships");
    console.info("- Restore into an isolated database copy");
    console.info("- Invalid backup rejection");
  } finally {
    await db.$disconnect();
    await Promise.all([
      removeIfPresent(temporaryBackup),
      removeIfPresent(restoreTarget),
    ]);
    await rmdir(temporaryDirectory).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") {
        throw error;
      }
    });
  }
}

testDataManagementModule().catch((error: unknown) => {
  console.error("Data management module verification failed:", error);
  process.exitCode = 1;
});
