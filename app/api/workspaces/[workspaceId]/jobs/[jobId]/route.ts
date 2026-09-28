import { NextResponse } from "next/server";
import { assertSameOrigin, requireUser, requireWorkspaceOwner } from "../../../../../../src/modules/auth/authorization";
import { authErrorResponse } from "../../../../../../src/modules/auth/http";
import {
  deleteJob,
  getJobDeletionSummary,
  JobNotFoundError,
  updateJob,
} from "../../../../../../src/modules/job/job-service";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ workspaceId: string; jobId: string }>;
};

function isOptionalString(value: unknown): value is string | null | undefined {
  return value === undefined || value === null || typeof value === "string";
}

function notFoundResponse(error: JobNotFoundError): NextResponse {
  return NextResponse.json({ error: error.message }, { status: 404 });
}

export async function GET(
  _request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  try {
    const user = await requireUser();
    const { workspaceId, jobId } = await context.params;
    await requireWorkspaceOwner(user.id, workspaceId);
    const summary = await getJobDeletionSummary(workspaceId, jobId);
    return NextResponse.json({ summary });
  } catch (error: unknown) {
    const response = authErrorResponse(error);
    if (response) return response;
    if (error instanceof JobNotFoundError) {
      return notFoundResponse(error);
    }
    throw error;
  }
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
    const body = (await request.json()) as Record<string, unknown>;
    if (
      typeof body.jobName !== "string" ||
      typeof body.baseLocation !== "string" ||
      !isOptionalString(body.jobUrl) ||
      !isOptionalString(body.remark)
    ) {
      return NextResponse.json({ error: "岗位信息格式无效。" }, { status: 400 });
    }
    const job = await updateJob(workspaceId, jobId, {
      jobName: body.jobName,
      baseLocation: body.baseLocation,
      jobUrl: body.jobUrl,
      remark: body.remark,
    });
    return NextResponse.json({ job });
  } catch (error: unknown) {
    const response = authErrorResponse(error);
    if (response) return response;
    if (error instanceof JobNotFoundError) {
      return notFoundResponse(error);
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
    const { workspaceId, jobId } = await context.params;
    await requireWorkspaceOwner(user.id, workspaceId);
    return NextResponse.json({ deleted: await deleteJob(workspaceId, jobId) });
  } catch (error: unknown) {
    const response = authErrorResponse(error);
    if (response) return response;
    if (error instanceof JobNotFoundError) {
      return notFoundResponse(error);
    }
    throw error;
  }
}
