import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createDatabaseBackup } from "../src/modules/data-management/database-backup-service";
import { db } from "../src/db/client";

async function createLocalBackup(): Promise<void> {
  const backupDirectory = resolve(process.cwd(), "backups");
  await mkdir(backupDirectory, { recursive: true });
  const backup = await createDatabaseBackup();
  const backupPath = resolve(backupDirectory, backup.fileName);
  await writeFile(backupPath, backup.buffer, { flag: "wx" });
  console.info(`Backup created: ${backupPath}`);
  console.info(
    `Users ${backup.summary.userCount}; workspaces ${backup.summary.workspaceCount}; jobs ${backup.summary.jobCount}; timeline events ${backup.summary.timelineEventCount}.`,
  );
}

createLocalBackup()
  .catch((error: unknown) => {
    console.error("Database backup failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
