import ExcelJS from "exceljs";
import { db } from "../../db/client";
import {
  stageLabels,
  timelineEventLabels,
} from "../job/recruitment-presentation";
import { WorkspaceNotFoundError } from "../workspace/workspace-service";

const headerFill = "FF2563EB";
const headerFont = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
const bodyFont = { name: "Arial", size: 10, color: { argb: "FF0F172A" } };

function safeFileNamePart(value: string): string {
  const normalized = value.trim().replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_");
  return normalized || "Workspace";
}

function styleWorksheet(worksheet: ExcelJS.Worksheet, dateColumn: number): void {
  worksheet.views = [{ state: "frozen", ySplit: 1, showGridLines: false }];
  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: worksheet.columnCount },
  };
  worksheet.getRow(1).height = 24;
  worksheet.getRow(1).eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: headerFill } };
    cell.font = headerFont;
    cell.alignment = { horizontal: "center", vertical: "middle" };
  });
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) {
      return;
    }
    row.height = 21;
    row.eachCell((cell) => {
      cell.font = bodyFont;
      cell.alignment = { vertical: "middle" };
      cell.border = {
        bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
      };
    });
  });
  worksheet.getColumn(dateColumn).numFmt = "yyyy-mm-dd hh:mm";
}

export type WorkspaceExcelExport = {
  buffer: Buffer;
  fileName: string;
  jobCount: number;
  timelineEventCount: number;
};

export async function createWorkspaceExcelExport(
  workspaceId: string,
): Promise<WorkspaceExcelExport> {
  const workspace = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: { name: true },
  });
  if (!workspace) {
    throw new WorkspaceNotFoundError(workspaceId);
  }

  const [jobs, timelineEvents] = await Promise.all([
    db.job.findMany({
      where: { workspaceId },
      include: { company: { select: { name: true } } },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    }),
    db.timelineEvent.findMany({
      where: { job: { workspaceId } },
      include: {
        job: {
          select: {
            jobName: true,
            company: { select: { name: true } },
          },
        },
      },
      orderBy: [{ eventDate: "desc" }, { createdAt: "desc" }, { id: "asc" }],
    }),
  ]);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "OfferTrack";
  workbook.created = new Date();
  workbook.modified = new Date();

  const jobsSheet = workbook.addWorksheet("岗位信息", {
    properties: { defaultRowHeight: 21 },
  });
  jobsSheet.columns = [
    { header: "公司", key: "company", width: 20 },
    { header: "岗位", key: "job", width: 24 },
    { header: "Base", key: "base", width: 16 },
    { header: "Stage", key: "stage", width: 14 },
    { header: "链接", key: "url", width: 36 },
    { header: "备注", key: "remark", width: 32 },
    { header: "更新时间", key: "updatedAt", width: 20 },
  ];
  for (const job of jobs) {
    const row = jobsSheet.addRow({
      company: job.company.name,
      job: job.jobName,
      base: job.baseLocation,
      stage: stageLabels[job.stage],
      url: job.jobUrl
        ? { text: job.jobUrl, hyperlink: job.jobUrl }
        : null,
      remark: job.remark,
      updatedAt: job.updatedAt,
    });
    if (job.jobUrl) {
      row.getCell(5).font = {
        ...bodyFont,
        color: { argb: "FF2563EB" },
        underline: true,
      };
    }
  }
  styleWorksheet(jobsSheet, 7);

  for (let rowNumber = 2; rowNumber <= jobsSheet.rowCount; rowNumber += 1) {
    const linkCell = jobsSheet.getRow(rowNumber).getCell(5);
    if (linkCell.hyperlink) {
      linkCell.font = {
        ...bodyFont,
        color: { argb: "FF2563EB" },
        underline: true,
      };
    }
  }

  const timelineSheet = workbook.addWorksheet("Timeline", {
    properties: { defaultRowHeight: 21 },
  });
  timelineSheet.columns = [
    { header: "公司", key: "company", width: 20 },
    { header: "岗位", key: "job", width: 24 },
    { header: "事件", key: "event", width: 20 },
    { header: "时间", key: "eventDate", width: 20 },
    { header: "备注", key: "remark", width: 36 },
  ];
  for (const event of timelineEvents) {
    timelineSheet.addRow({
      company: event.job.company.name,
      job: event.job.jobName,
      event: timelineEventLabels[event.eventType],
      eventDate: event.eventDate,
      remark: event.remark,
    });
  }
  styleWorksheet(timelineSheet, 4);

  const workbookBuffer = await workbook.xlsx.writeBuffer();
  return {
    buffer: Buffer.from(workbookBuffer),
    fileName: `OfferTrack_${safeFileNamePart(workspace.name)}.xlsx`,
    jobCount: jobs.length,
    timelineEventCount: timelineEvents.length,
  };
}
