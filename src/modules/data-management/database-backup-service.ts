import { randomUUID } from "node:crypto";
import {
  copyFile,
  mkdir,
  readFile,
  unlink,
  writeFile,
} from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import Database from "better-sqlite3";
import { db } from "../../db/client";
import { databaseDirectory, databaseFile } from "../../db/database-path";

const operationsDirectory = resolve(databaseDirectory, ".operations");
const requiredColumns: Record<string, string[]> = {
  User: [
    "id",
    "username",
    "displayName",
    "passwordHash",
    "role",
    "isActive",
    "mustChangePassword",
    "createdAt",
    "updatedAt",
  ],
  Session: ["id", "userId", "expiresAt", "createdAt"],
  Workspace: ["id", "ownerId", "name", "description", "createdAt", "updatedAt"],
  Company: ["id", "workspaceId", "name", "createdAt"],
  Job: [
    "id",
    "workspaceId",
    "companyId",
    "jobName",
    "baseLocation",
    "jobUrl",
    "stage",
    "status",
    "remark",
    "createdAt",
    "updatedAt",
  ],
  TimelineEvent: ["id", "jobId", "eventType", "eventDate", "remark", "createdAt"],
};

export class InvalidDatabaseBackupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidDatabaseBackupError";
  }
}

export type DatabaseBackupSummary = {
  userCount: number;
  sessionCount: number;
  workspaceCount: number;
  companyCount: number;
  jobCount: number;
  timelineEventCount: number;
};

function assertProjectLocalPath(filePath: string): void {
  const pathFromDataDirectory = relative(databaseDirectory, resolve(filePath));
  if (
    !pathFromDataDirectory ||
    pathFromDataDirectory.startsWith("..") ||
    isAbsolute(pathFromDataDirectory)
  ) {
    throw new Error("数据库操作路径必须位于 OfferTrack 项目的 data 目录内。");
  }
}

async function removeIfPresent(filePath: string): Promise<void> {
  await unlink(filePath).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") {
      throw error;
    }
  });
}

function readDatabaseSummary(connection: Database.Database): DatabaseBackupSummary {
  const count = (table: string): number =>
    (connection.prepare(`SELECT COUNT(*) AS count FROM "${table}"`).get() as { count: number }).count;

  return {
    userCount: count("User"),
    sessionCount: count("Session"),
    workspaceCount: count("Workspace"),
    companyCount: count("Company"),
    jobCount: count("Job"),
    timelineEventCount: count("TimelineEvent"),
  };
}

export function validateOfferTrackDatabase(filePath: string): DatabaseBackupSummary {
  assertProjectLocalPath(filePath);
  let connection: Database.Database | null = null;
  try {
    connection = new Database(filePath, { readonly: true, fileMustExist: true });
    const integrity = connection.pragma("integrity_check", { simple: true });
    if (integrity !== "ok") {
      throw new InvalidDatabaseBackupError("SQLite 数据库完整性检查未通过。");
    }

    for (const [table, columns] of Object.entries(requiredColumns)) {
      const tableExists = connection
        .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
        .get(table);
      if (!tableExists) {
        throw new InvalidDatabaseBackupError(`备份缺少 ${table} 数据表。`);
      }
      const actualColumns = new Set(
        (connection.pragma(`table_info(\"${table}\")`) as { name: string }[]).map(
          (column) => column.name,
        ),
      );
      if (columns.some((column) => !actualColumns.has(column))) {
        throw new InvalidDatabaseBackupError(`备份中的 ${table} 数据表结构不兼容。`);
      }
    }

    const foreignKeyErrors = connection.pragma("foreign_key_check") as unknown[];
    if (foreignKeyErrors.length) {
      throw new InvalidDatabaseBackupError("备份包含无效的数据关系。");
    }

    const offerIndex = connection
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'index' AND name = ?")
      .get("Job_one_offer_per_company_key");
    if (!offerIndex) {
      throw new InvalidDatabaseBackupError("备份缺少 Offer 唯一性约束。");
    }

    return readDatabaseSummary(connection);
  } catch (error: unknown) {
    if (error instanceof InvalidDatabaseBackupError) {
      throw error;
    }
    throw new InvalidDatabaseBackupError("无法读取该 SQLite 备份文件。");
  } finally {
    connection?.close();
  }
}

function timestampForFile(date = new Date()): string {
  const pad = (value: number): string => value.toString().padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "_",
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join("");
}

export async function createDatabaseBackup(): Promise<{
  buffer: Buffer;
  fileName: string;
  summary: DatabaseBackupSummary;
}> {
  assertProjectLocalPath(databaseFile);
  await mkdir(operationsDirectory, { recursive: true });
  const snapshotPath = resolve(operationsDirectory, `backup-${randomUUID()}.db`);
  assertProjectLocalPath(snapshotPath);
  const source = new Database(databaseFile, { readonly: true, fileMustExist: true });
  try {
    await source.backup(snapshotPath);
    const summary = validateOfferTrackDatabase(snapshotPath);
    return {
      buffer: await readFile(snapshotPath),
      fileName: `OfferTrack_Backup_${timestampForFile()}.db`,
      summary,
    };
  } finally {
    source.close();
    await removeIfPresent(snapshotPath);
  }
}

export async function restoreDatabaseFile(
  backupBuffer: Buffer,
  targetFile: string,
): Promise<DatabaseBackupSummary> {
  assertProjectLocalPath(targetFile);
  await mkdir(operationsDirectory, { recursive: true });
  const operationId = randomUUID();
  const uploadedPath = resolve(operationsDirectory, `restore-${operationId}.db`);
  const rollbackPath = resolve(operationsDirectory, `rollback-${operationId}.db`);
  assertProjectLocalPath(uploadedPath);
  assertProjectLocalPath(rollbackPath);

  const sqliteHeader = backupBuffer.subarray(0, 16).toString("binary");
  if (sqliteHeader !== "SQLite format 3\u0000") {
    throw new InvalidDatabaseBackupError("所选文件不是有效的 SQLite 数据库。");
  }

  await writeFile(uploadedPath, backupBuffer);
  let rollbackAvailable = false;
  try {
    const summary = validateOfferTrackDatabase(uploadedPath);
    await copyFile(targetFile, rollbackPath);
    rollbackAvailable = true;
    await removeIfPresent(`${targetFile}-wal`);
    await removeIfPresent(`${targetFile}-shm`);
    await copyFile(uploadedPath, targetFile);
    validateOfferTrackDatabase(targetFile);
    return summary;
  } catch (error: unknown) {
    if (rollbackAvailable) {
      await copyFile(rollbackPath, targetFile);
    }
    throw error;
  } finally {
    await Promise.all([
      removeIfPresent(uploadedPath),
      removeIfPresent(rollbackPath),
    ]);
  }
}

export async function restoreDatabaseBackup(
  backupBuffer: Buffer,
): Promise<DatabaseBackupSummary> {
  await db.$disconnect();
  try {
    const summary = await restoreDatabaseFile(backupBuffer, databaseFile);
    await db.$connect();
    await db.workspace.count();
    return summary;
  } catch (error: unknown) {
    await db.$connect().catch(() => undefined);
    throw error;
  }
}
