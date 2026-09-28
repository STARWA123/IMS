import { NextResponse } from "next/server";
import { assertSameOrigin, requireAdmin } from "../../../../src/modules/auth/authorization";
import { authErrorResponse } from "../../../../src/modules/auth/http";
import {
  InvalidDatabaseBackupError,
  restoreDatabaseBackup,
} from "../../../../src/modules/data-management/database-backup-service";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    assertSameOrigin(request);
    await requireAdmin();
    const formData = await request.formData();
    const backup = formData.get("database");
    if (!(backup instanceof File)) {
      return NextResponse.json({ error: "请选择 SQLite 备份文件。" }, { status: 400 });
    }
    if (!backup.name.toLowerCase().endsWith(".db")) {
      return NextResponse.json({ error: "备份文件必须使用 .db 扩展名。" }, { status: 400 });
    }
    const summary = await restoreDatabaseBackup(
      Buffer.from(await backup.arrayBuffer()),
    );
    return NextResponse.json({ restored: summary });
  } catch (error: unknown) {
    const response = authErrorResponse(error);
    if (response) return response;
    if (error instanceof InvalidDatabaseBackupError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
