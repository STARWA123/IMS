import { createDatabaseBackup } from "../../../../src/modules/data-management/database-backup-service";
import { requireAdmin } from "../../../../src/modules/auth/authorization";
import { authErrorResponse } from "../../../../src/modules/auth/http";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  try {
    await requireAdmin();
    const backup = await createDatabaseBackup();
    return new Response(new Uint8Array(backup.buffer), {
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename="${backup.fileName}"`,
        "Content-Type": "application/vnd.sqlite3",
      },
    });
  } catch (error: unknown) {
    const response = authErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
