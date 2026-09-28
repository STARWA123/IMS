import { NextResponse } from "next/server";
import { requireUser, requireWorkspaceOwner } from "../../../../../src/modules/auth/authorization";
import { authErrorResponse } from "../../../../../src/modules/auth/http";
import { createWorkspaceExcelExport } from "../../../../../src/modules/data-management/excel-export-service";
import { WorkspaceNotFoundError } from "../../../../../src/modules/workspace/workspace-service";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ workspaceId: string }>;
};

export async function GET(
  _request: Request,
  context: RouteContext,
): Promise<Response> {
  try {
    const user = await requireUser();
    const { workspaceId } = await context.params;
    await requireWorkspaceOwner(user.id, workspaceId);
    const exported = await createWorkspaceExcelExport(workspaceId);
    return new Response(new Uint8Array(exported.buffer), {
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename="OfferTrack_Workspace.xlsx"; filename*=UTF-8''${encodeURIComponent(exported.fileName)}`,
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
    });
  } catch (error: unknown) {
    const response = authErrorResponse(error);
    if (response) return response;
    if (error instanceof WorkspaceNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    throw error;
  }
}
