import { NextResponse } from "next/server";
import { assertSameOrigin, requireUser, requireWorkspaceOwner } from "../../../../../../../src/modules/auth/authorization";
import { authErrorResponse } from "../../../../../../../src/modules/auth/http";
import type { Stage } from "../../../../../../../src/generated/prisma/client";
import {
  CompanyOfferConflictError,
  JobNotFoundError,
  moveJobToStage,
} from "../../../../../../../src/modules/job/job-service";
import { stages as stageValues } from "../../../../../../../src/modules/job/recruitment-presentation";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ workspaceId: string; jobId: string }>;
};

const stages = new Set<Stage>(stageValues);

function isStage(value: unknown): value is Stage {
  return typeof value === "string" && stages.has(value as Stage);
}

export async function PATCH(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const { workspaceId, jobId } = await context.params;
    await requireWorkspaceOwner(user.id, workspaceId);
    const body = (await request.json()) as { stage?: unknown };
    if (!isStage(body.stage)) {
      return NextResponse.json({ error: "目标 Stage 无效。" }, { status: 400 });
    }
    const result = await moveJobToStage(workspaceId, jobId, body.stage);
    return NextResponse.json(result);
  } catch (error: unknown) {
    const response = authErrorResponse(error);
    if (response) return response;
    if (error instanceof JobNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof CompanyOfferConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}
