import { NextResponse } from "next/server";
import { requireUser, requireWorkspaceOwner } from "../../../../../../src/modules/auth/authorization";
import { authErrorResponse } from "../../../../../../src/modules/auth/http";
import { createJobImportTemplate } from "../../../../../../src/modules/data-management/job-import-template-service";

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
    const template = await createJobImportTemplate();
    return new Response(new Uint8Array(template.buffer), {
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename="OfferTrack_Import.xlsx"; filename*=UTF-8''${encodeURIComponent(template.fileName)}`,
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
    });
  } catch (error: unknown) {
    const response = authErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
