import { NextResponse } from "next/server";
import { assertSameOrigin, requireUser } from "../../../../src/modules/auth/authorization";
import { authErrorResponse } from "../../../../src/modules/auth/http";
import {
  deleteWorkspace,
  listWorkspaces,
  renameWorkspace,
  WorkspaceNotFoundError,
} from "../../../../src/modules/workspace/workspace-service";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ workspaceId: string }>;
};

export async function PATCH(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const { workspaceId } = await context.params;
    const body = (await request.json()) as { name?: unknown };
    if (typeof body.name !== "string") {
      return NextResponse.json(
        { error: "Workspace 名称不能为空。" },
        { status: 400 },
      );
    }
    const workspace = await renameWorkspace(user.id, workspaceId, body.name);
    return NextResponse.json({ workspace });
  } catch (error: unknown) {
    const response = authErrorResponse(error);
    if (response) return response;
    if (error instanceof WorkspaceNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof TypeError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}

export async function DELETE(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const { workspaceId } = await context.params;
    const deleted = await deleteWorkspace(user.id, workspaceId);
    const workspaces = await listWorkspaces(user.id);
    return NextResponse.json({ deleted, workspaces });
  } catch (error: unknown) {
    const response = authErrorResponse(error);
    if (response) return response;
    if (error instanceof WorkspaceNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    throw error;
  }
}
