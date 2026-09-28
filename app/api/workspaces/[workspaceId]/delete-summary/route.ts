import { NextResponse } from "next/server";
import { requireUser } from "../../../../../src/modules/auth/authorization";
import { authErrorResponse } from "../../../../../src/modules/auth/http";
import {
  getWorkspaceDeletionSummary,
  WorkspaceNotFoundError,
} from "../../../../../src/modules/workspace/workspace-service";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ workspaceId: string }>;
};

export async function GET(
  _request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  try {
    const user = await requireUser();
    const { workspaceId } = await context.params;
    return NextResponse.json({
      summary: await getWorkspaceDeletionSummary(user.id, workspaceId),
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
