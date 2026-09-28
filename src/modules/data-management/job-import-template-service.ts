import ExcelJS from "exceljs";

export const jobImportSheetName = "岗位导入";

export const jobImportHeaders = [
  "公司名称",
  "岗位名称",
  "Base地",
  "岗位链接",
  "备注",
  "投递完成日期",
  "测评完成日期",
  "一面完成日期",
  "二面完成日期",
  "三面完成日期",
  "HR面完成日期",
  "Offer获得日期",
  "流程终止日期",
] as const;

export type JobImportTemplate = {
  buffer: Buffer;
  fileName: string;
};

export async function createJobImportTemplate(): Promise<JobImportTemplate> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "OfferTrack";
  workbook.created = new Date();
  workbook.modified = new Date();

  const worksheet = workbook.addWorksheet(jobImportSheetName, {
    properties: { defaultRowHeight: 22 },
    views: [{ state: "frozen", ySplit: 1, showGridLines: false }],
  });
  worksheet.properties.tabColor = { argb: "FF2563EB" };
  worksheet.columns = [
    { header: jobImportHeaders[0], key: "companyName", width: 20 },
    { header: jobImportHeaders[1], key: "jobName", width: 28 },
    { header: jobImportHeaders[2], key: "baseLocation", width: 16 },
    { header: jobImportHeaders[3], key: "jobUrl", width: 40 },
    { header: jobImportHeaders[4], key: "remark", width: 32 },
    ...jobImportHeaders.slice(5).map((header, index) => ({
      header,
      key: `date${index + 1}`,
      width: 17,
      style: { numFmt: "yyyy-mm-dd" },
    })),
  ];
  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: jobImportHeaders.length },
  };

  const headerRow = worksheet.getRow(1);
  headerRow.height = 27;
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF2563EB" },
    };
    cell.font = {
      name: "Arial",
      size: 10,
      bold: true,
      color: { argb: "FFFFFFFF" },
    };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = {
      right: { style: "thin", color: { argb: "FFFFFFFF" } },
    };
  });

  const inputRange = worksheet.getRow(2);
  inputRange.height = 22;
  for (let column = 1; column <= jobImportHeaders.length; column += 1) {
    const cell = inputRange.getCell(column);
    cell.font = { name: "Arial", size: 10, color: { argb: "FF0F172A" } };
    cell.alignment = { vertical: "middle" };
  }
  for (let column = 6; column <= jobImportHeaders.length; column += 1) {
    inputRange.getCell(column).numFmt = "yyyy-mm-dd";
  }

  const output = await workbook.xlsx.writeBuffer();
  return {
    buffer: Buffer.from(output),
    fileName: "OfferTrack_岗位导入模板.xlsx",
  };
}
