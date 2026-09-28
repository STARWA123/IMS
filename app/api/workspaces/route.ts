import { NextResponse } from "next/server";
import { assertSameOrigin, requireUser } from "../../../src/modules/auth/authorization";
import { authErrorResponse } from "../../../src/modules/auth/http";
import {
  createWorkspace,
  listWorkspaces,
} from "../../../src/modules/workspace/workspace-service";

export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  try {
    const user = await requireUser();
    return NextResponse.json({ workspaces: await listWorkspaces(user.id) });
  } catch (error: unknown) {
    const response = authErrorResponse(error);
    if (response) return response;
    throw error;
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = (await request.json()) as {
      name?: unknown;
      description?: unknown;
    };
    if (typeof body.name !== "string") {
      return NextResponse.json(
        { error: "Workspace 名称不能为空。" },
        { status: 400 },
      );
    }
    if (
      body.description !== undefined &&
      body.description !== null &&
      typeof body.description !== "string"
    ) {
      return NextResponse.json(
        { error: "Workspace 描述格式无效。" },
        { status: 400 },
      );
    }

    const workspace = await createWorkspace({
      ownerId: user.id,
      name: body.name,
      description: body.description as string | null | undefined,
    });
    return NextResponse.json({ workspace }, { status: 201 });
  } catch (error: unknown) {
    const response = authErrorResponse(error);
    if (response) return response;
    if (error instanceof TypeError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
