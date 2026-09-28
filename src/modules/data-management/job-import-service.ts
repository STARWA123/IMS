import ExcelJS from "exceljs";
import type { EventType, Stage } from "../../generated/prisma/client";
import { db } from "../../db/client";
import { statusForStage } from "../job/stage-rules";
import { WorkspaceNotFoundError } from "../workspace/workspace-service";
import type {
  JobImportPreview,
  JobImportPreviewRow,
  JobImportResult,
} from "./job-import-types";
import { jobImportHeaders, jobImportSheetName } from "./job-import-template-service";

export const maxJobImportFileBytes = 5 * 1024 * 1024;
export const maxJobImportRows = 1_000;

type ImportField =
  | "companyName"
  | "jobName"
  | "baseLocation"
  | "jobUrl"
  | "remark"
  | "appliedDate"
  | "assessmentDate"
  | "firstInterviewDate"
  | "secondInterviewDate"
  | "thirdInterviewDate"
  | "hrInterviewDate"
  | "offerDate"
  | "rejectedDate";

type ParsedTimelineEvent = {
  eventType: EventType;
  eventDate: Date;
};

type ParsedImportRow = {
  rowNumber: number;
  companyName: string;
  jobName: string;
  baseLocation: string;
  jobUrl: string | null;
  remark: string | null;
  finalStage: Stage;
  timelineEvents: ParsedTimelineEvent[];
  generatedAppliedDate: boolean;
  errors: string[];
};

type AnalyzedImport = {
  preview: JobImportPreview;
  readyRecords: ParsedImportRow[];
};

const fieldByHeader = new Map<string, ImportField>(
  [
    [jobImportHeaders[0], "companyName"],
    [jobImportHeaders[1], "jobName"],
    [jobImportHeaders[2], "baseLocation"],
    [jobImportHeaders[3], "jobUrl"],
    [jobImportHeaders[4], "remark"],
    [jobImportHeaders[5], "appliedDate"],
    [jobImportHeaders[6], "assessmentDate"],
    [jobImportHeaders[7], "firstInterviewDate"],
    [jobImportHeaders[8], "secondInterviewDate"],
    [jobImportHeaders[9], "thirdInterviewDate"],
    [jobImportHeaders[10], "hrInterviewDate"],
    [jobImportHeaders[11], "offerDate"],
    [jobImportHeaders[12], "rejectedDate"],
  ].map(([header, field]) => [normalizeHeader(header), field as ImportField]),
);

const dateFields = [
  { field: "appliedDate", label: "投递完成日期", eventType: "APPLIED", stage: "APPLIED" },
  { field: "assessmentDate", label: "测评完成日期", eventType: "ASSESSMENT_COMPLETED", stage: "ASSESSMENT" },
  { field: "firstInterviewDate", label: "一面完成日期", eventType: "FIRST_INTERVIEW_COMPLETED", stage: "FIRST_INTERVIEW" },
  { field: "secondInterviewDate", label: "二面完成日期", eventType: "SECOND_INTERVIEW_COMPLETED", stage: "SECOND_INTERVIEW" },
  { field: "thirdInterviewDate", label: "三面完成日期", eventType: "THIRD_INTERVIEW_COMPLETED", stage: "THIRD_INTERVIEW" },
  { field: "hrInterviewDate", label: "HR面完成日期", eventType: "HR_INTERVIEW_COMPLETED", stage: "HR_INTERVIEW" },
  { field: "offerDate", label: "Offer获得日期", eventType: "OFFER_RECEIVED", stage: "OFFER" },
] as const satisfies ReadonlyArray<{
  field: ImportField;
  label: string;
  eventType: EventType;
  stage: Stage;
}>;

export class InvalidJobImportFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidJobImportFileError";
  }
}

export class JobImportBlockedError extends Error {
  readonly preview: JobImportPreview;

  constructor(preview: JobImportPreview) {
    super("Excel 中仍有错误行，请修正后重新上传。");
    this.name = "JobImportBlockedError";
    this.preview = preview;
  }
}

function normalizeHeader(value: string): string {
  return value.trim().replaceAll(/\s+/g, "").toLocaleLowerCase("zh-CN");
}

function recordKey(companyName: string, jobName: string): string {
  return `${companyName}\u0000${jobName}`;
}

function optionalText(value: string): string | null {
  const normalized = value.trim();
  return normalized || null;
}

function cellText(cell: ExcelJS.Cell): string {
  if (cell.hyperlink) {
    return cell.hyperlink.trim();
  }
  return cell.text.trim();
}

function formulaResult(value: ExcelJS.CellValue): ExcelJS.CellValue {
  if (
    value &&
    typeof value === "object" &&
    !(value instanceof Date) &&
    "result" in value
  ) {
    return (value.result ?? null) as ExcelJS.CellValue;
  }
  return value;
}

function dateAtShanghaiNine(year: number, month: number, day: number): Date | null {
  const calendarCheck = new Date(Date.UTC(year, month - 1, day));
  if (
    calendarCheck.getUTCFullYear() !== year ||
    calendarCheck.getUTCMonth() !== month - 1 ||
    calendarCheck.getUTCDate() !== day
  ) {
    return null;
  }
  const monthText = String(month).padStart(2, "0");
  const dayText = String(day).padStart(2, "0");
  return new Date(`${year}-${monthText}-${dayText}T09:00:00+08:00`);
}

function importDayAtNine(now: Date): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return new Date(`${value.year}-${value.month}-${value.day}T09:00:00+08:00`);
}

function parseDateCell(cell: ExcelJS.Cell): Date | null | "invalid" {
  const rawValue = formulaResult(cell.value);
  if (rawValue === null || rawValue === undefined || rawValue === "") {
    return null;
  }
  if (rawValue instanceof Date) {
    return dateAtShanghaiNine(
      rawValue.getUTCFullYear(),
      rawValue.getUTCMonth() + 1,
      rawValue.getUTCDate(),
    ) ?? "invalid";
  }
  if (typeof rawValue === "number" && Number.isFinite(rawValue) && rawValue > 0) {
    const excelDate = new Date(Math.round((rawValue - 25_569) * 86_400_000));
    return dateAtShanghaiNine(
      excelDate.getUTCFullYear(),
      excelDate.getUTCMonth() + 1,
      excelDate.getUTCDate(),
    ) ?? "invalid";
  }
  const text = String(rawValue).trim() || cell.text.trim();
  const match = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(text);
  if (!match) {
    return "invalid";
  }
  return dateAtShanghaiNine(
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
  ) ?? "invalid";
}

function validateUrl(value: string | null): string | null {
  if (!value) {
    return null;
  }
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:"
      ? null
      : "岗位链接仅支持 http:// 或 https://。";
  } catch {
    return "岗位链接格式无效。";
  }
}

function findImportWorksheet(workbook: ExcelJS.Workbook): ExcelJS.Worksheet | undefined {
  const namedSheet = workbook.getWorksheet(jobImportSheetName);
  if (namedSheet) {
    return namedSheet;
  }
  return workbook.worksheets.find((worksheet) => {
    const values = worksheet.getRow(1).values;
    const headerValues = Array.isArray(values) ? values.slice(1) : [];
    const headers = new Set(
      headerValues.map((value) => normalizeHeader(String(value ?? ""))),
    );
    return headers.has(normalizeHeader("公司名称")) && headers.has(normalizeHeader("岗位名称"));
  });
}

function readHeaderColumns(worksheet: ExcelJS.Worksheet): Map<ImportField, number> {
  const columns = new Map<ImportField, number>();
  worksheet.getRow(1).eachCell((cell, columnNumber) => {
    const field = fieldByHeader.get(normalizeHeader(cell.text));
    if (!field) {
      return;
    }
    if (columns.has(field)) {
      throw new InvalidJobImportFileError(`表头“${cell.text.trim()}”重复。`);
    }
    columns.set(field, columnNumber);
  });

  const missingHeaders = [...fieldByHeader.values()].filter((field) => !columns.has(field));
  if (missingHeaders.length) {
    const labels = jobImportHeaders.filter((header) => {
      const field = fieldByHeader.get(normalizeHeader(header));
      return field ? missingHeaders.includes(field) : false;
    });
    throw new InvalidJobImportFileError(`Excel 缺少必要表头：${labels.join("、")}。`);
  }
  return columns;
}

function parseWorksheetRows(
  worksheet: ExcelJS.Worksheet,
  columns: Map<ImportField, number>,
  importedAt: Date,
): ParsedImportRow[] {
  const records: ParsedImportRow[] = [];
  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const hasContent = [...columns.values()].some((column) => cellText(row.getCell(column)) !== "");
    if (!hasContent) {
      continue;
    }

    const getText = (field: ImportField): string => cellText(row.getCell(columns.get(field)!));
    const companyName = getText("companyName");
    const jobName = getText("jobName");
    const baseLocation = getText("baseLocation") || "未填写";
    const jobUrl = optionalText(getText("jobUrl"));
    const remark = optionalText(getText("remark"));
    const errors: string[] = [];
    if (!companyName) {
      errors.push("公司名称不能为空。");
    }
    if (!jobName) {
      errors.push("岗位名称不能为空。");
    }
    const urlError = validateUrl(jobUrl);
    if (urlError) {
      errors.push(urlError);
    }

    const parsedDates = new Map<ImportField, Date | null>();
    for (const definition of [
      ...dateFields,
      { field: "rejectedDate", label: "流程终止日期" } as const,
    ]) {
      const parsed = parseDateCell(row.getCell(columns.get(definition.field)!));
      if (parsed === "invalid") {
        errors.push(`${definition.label}格式无效，请使用 YYYY-MM-DD。`);
        parsedDates.set(definition.field, null);
      } else {
        parsedDates.set(definition.field, parsed);
      }
    }

    const suppliedAppliedDate = parsedDates.get("appliedDate") ?? null;
    const appliedDate = suppliedAppliedDate ?? importDayAtNine(importedAt);
    parsedDates.set("appliedDate", appliedDate);
    let previousDate = appliedDate;
    let previousLabel = "投递完成日期";
    for (const definition of dateFields.slice(1)) {
      const date = parsedDates.get(definition.field);
      if (!date) {
        continue;
      }
      if (date.getTime() < previousDate.getTime()) {
        errors.push(`${definition.label}不能早于${previousLabel}。`);
        continue;
      }
      previousDate = date;
      previousLabel = definition.label;
    }
    const rejectedDate = parsedDates.get("rejectedDate") ?? null;
    if (rejectedDate && rejectedDate.getTime() < previousDate.getTime()) {
      errors.push(`流程终止日期不能早于${previousLabel}。`);
    }

    const timelineEvents: ParsedTimelineEvent[] = dateFields.flatMap((definition) => {
      const eventDate = parsedDates.get(definition.field);
      return eventDate ? [{ eventType: definition.eventType, eventDate }] : [];
    });
    if (rejectedDate) {
      timelineEvents.push({ eventType: "REJECTED", eventDate: rejectedDate });
    }
    const finalStage = rejectedDate
      ? "REJECTED"
      : [...dateFields]
          .reverse()
          .find((definition) => parsedDates.get(definition.field))?.stage ?? "APPLIED";

    records.push({
      rowNumber,
      companyName,
      jobName,
      baseLocation,
      jobUrl,
      remark,
      finalStage,
      timelineEvents,
      generatedAppliedDate: !suppliedAppliedDate,
      errors,
    });
  }
  if (!records.length) {
    throw new InvalidJobImportFileError("Excel 中没有可解析的岗位数据。");
  }
  if (records.length > maxJobImportRows) {
    throw new InvalidJobImportFileError(`单次最多导入 ${maxJobImportRows} 个岗位。`);
  }
  return records;
}

async function loadWorkbook(buffer: Buffer): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  } catch {
    throw new InvalidJobImportFileError("无法读取 Excel 文件，请确认文件为有效的 .xlsx。");
  }
  return workbook;
}

async function analyzeJobImport(
  workspaceId: string,
  buffer: Buffer,
  fileName: string,
  importedAt = new Date(),
): Promise<AnalyzedImport> {
  const workspace = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: { id: true, name: true },
  });
  if (!workspace) {
    throw new WorkspaceNotFoundError(workspaceId);
  }
  const workbook = await loadWorkbook(buffer);
  const worksheet = findImportWorksheet(workbook);
  if (!worksheet) {
    throw new InvalidJobImportFileError(`Excel 中不存在“${jobImportSheetName}”工作表。`);
  }
  const columns = readHeaderColumns(worksheet);
  const records = parseWorksheetRows(worksheet, columns, importedAt);

  const [existingJobs, offerJobs] = await Promise.all([
    db.job.findMany({
      where: { workspaceId },
      select: { jobName: true, company: { select: { name: true } } },
    }),
    db.job.findMany({
      where: { workspaceId, stage: "OFFER" },
      select: { company: { select: { name: true } } },
    }),
  ]);
  const existingKeys = new Set(
    existingJobs.map((job) => recordKey(job.company.name, job.jobName)),
  );
  const offerCompanies = new Set(offerJobs.map((job) => job.company.name));
  const fileKeys = new Set<string>();
  const fileOfferCompanies = new Set<string>();
  const previewRows: JobImportPreviewRow[] = [];
  const readyRecords: ParsedImportRow[] = [];

  for (const record of records) {
    if (record.errors.length) {
      previewRows.push({
        rowNumber: record.rowNumber,
        companyName: record.companyName,
        jobName: record.jobName,
        finalStage: record.finalStage,
        status: "error",
        message: record.errors.join(" "),
        timelineEvents: record.timelineEvents.map((event) => ({
          eventType: event.eventType,
          eventDate: event.eventDate.toISOString(),
        })),
        generatedAppliedDate: record.generatedAppliedDate,
      });
      continue;
    }

    const key = recordKey(record.companyName, record.jobName);
    if (existingKeys.has(key) || fileKeys.has(key)) {
      previewRows.push({
        rowNumber: record.rowNumber,
        companyName: record.companyName,
        jobName: record.jobName,
        finalStage: record.finalStage,
        status: "duplicate",
        message: "岗位已经存在，将跳过。",
        timelineEvents: record.timelineEvents.map((event) => ({
          eventType: event.eventType,
          eventDate: event.eventDate.toISOString(),
        })),
        generatedAppliedDate: record.generatedAppliedDate,
      });
      continue;
    }

    if (
      record.finalStage === "OFFER" &&
      (offerCompanies.has(record.companyName) || fileOfferCompanies.has(record.companyName))
    ) {
      previewRows.push({
        rowNumber: record.rowNumber,
        companyName: record.companyName,
        jobName: record.jobName,
        finalStage: record.finalStage,
        status: "error",
        message: `${record.companyName} 已有一个 Offer 岗位，不能重复导入 Offer。`,
        timelineEvents: record.timelineEvents.map((event) => ({
          eventType: event.eventType,
          eventDate: event.eventDate.toISOString(),
        })),
        generatedAppliedDate: record.generatedAppliedDate,
      });
      continue;
    }

    fileKeys.add(key);
    if (record.finalStage === "OFFER") {
      fileOfferCompanies.add(record.companyName);
    }
    readyRecords.push(record);
    previewRows.push({
      rowNumber: record.rowNumber,
      companyName: record.companyName,
      jobName: record.jobName,
      finalStage: record.finalStage,
      status: "ready",
      message: `将创建 ${record.timelineEvents.length} 条 Timeline。`,
      timelineEvents: record.timelineEvents.map((event) => ({
        eventType: event.eventType,
        eventDate: event.eventDate.toISOString(),
      })),
      generatedAppliedDate: record.generatedAppliedDate,
    });
  }

  const readyRows = previewRows.filter((row) => row.status === "ready");
  const duplicateRows = previewRows.filter((row) => row.status === "duplicate");
  const errorRows = previewRows.filter((row) => row.status === "error");
  return {
    preview: {
      fileName,
      workspaceName: workspace.name,
      totalRows: previewRows.length,
      readyRows: readyRows.length,
      duplicateRows: duplicateRows.length,
      errorRows: errorRows.length,
      timelineEventCount: readyRows.reduce(
        (total, row) => total + row.timelineEvents.length,
        0,
      ),
      generatedAppliedDates: readyRows.filter((row) => row.generatedAppliedDate).length,
      rows: previewRows,
    },
    readyRecords,
  };
}

export async function previewJobImport(
  workspaceId: string,
  buffer: Buffer,
  fileName: string,
): Promise<JobImportPreview> {
  return (await analyzeJobImport(workspaceId, buffer, fileName)).preview;
}

export async function importJobsFromWorkbook(
  workspaceId: string,
  buffer: Buffer,
  fileName: string,
): Promise<JobImportResult> {
  const analysis = await analyzeJobImport(workspaceId, buffer, fileName);
  if (analysis.preview.errorRows) {
    throw new JobImportBlockedError(analysis.preview);
  }
  if (!analysis.readyRecords.length) {
    throw new InvalidJobImportFileError("没有可导入的新岗位。");
  }

  const reusedCompanyNames = new Set<string>();
  const createdCompanyNames = new Set<string>();
  const result = await db.$transaction(
    async (transaction) => {
      const workspace = await transaction.workspace.findUnique({
        where: { id: workspaceId },
        select: { id: true },
      });
      if (!workspace) {
        throw new WorkspaceNotFoundError(workspaceId);
      }

      const companyIds = new Map<string, string>();
      let importedJobs = 0;
      let createdTimelineEvents = 0;
      for (const record of analysis.readyRecords) {
        let companyId = companyIds.get(record.companyName);
        if (!companyId) {
          const existingCompany = await transaction.company.findFirst({
            where: { workspaceId, name: record.companyName },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            select: { id: true },
          });
          if (existingCompany) {
            companyId = existingCompany.id;
            reusedCompanyNames.add(record.companyName);
          } else {
            const company = await transaction.company.create({
              data: { workspaceId, name: record.companyName },
              select: { id: true },
            });
            companyId = company.id;
            createdCompanyNames.add(record.companyName);
          }
          companyIds.set(record.companyName, companyId);
        }

        const duplicate = await transaction.job.findFirst({
          where: { workspaceId, companyId, jobName: record.jobName },
          select: { id: true },
        });
        if (duplicate) {
          throw new InvalidJobImportFileError(
            `${record.companyName} / ${record.jobName} 在确认导入前已存在，请重新预检。`,
          );
        }
        if (record.finalStage === "OFFER") {
          const existingOffer = await transaction.job.findFirst({
            where: { workspaceId, companyId, stage: "OFFER" },
            select: { id: true },
          });
          if (existingOffer) {
            throw new InvalidJobImportFileError(
              `${record.companyName} 已有一个 Offer 岗位，请重新预检。`,
            );
          }
        }

        const job = await transaction.job.create({
          data: {
            workspaceId,
            companyId,
            jobName: record.jobName,
            baseLocation: record.baseLocation,
            jobUrl: record.jobUrl,
            remark: record.remark,
            stage: record.finalStage,
            status: statusForStage(record.finalStage),
          },
          select: { id: true },
        });
        await transaction.timelineEvent.createMany({
          data: record.timelineEvents.map((event) => ({
            jobId: job.id,
            eventType: event.eventType,
            eventDate: event.eventDate,
          })),
        });
        importedJobs += 1;
        createdTimelineEvents += record.timelineEvents.length;
      }
      return { importedJobs, createdTimelineEvents };
    },
    { timeout: 30_000 },
  );

  return {
    workspaceName: analysis.preview.workspaceName,
    importedJobs: result.importedJobs,
    createdTimelineEvents: result.createdTimelineEvents,
    reusedCompanies: reusedCompanyNames.size,
    createdCompanies: createdCompanyNames.size,
    skippedDuplicates: analysis.preview.duplicateRows,
    generatedAppliedDates: analysis.preview.generatedAppliedDates,
  };
}
