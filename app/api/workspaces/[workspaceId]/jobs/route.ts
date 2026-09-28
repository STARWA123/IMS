import { NextResponse } from "next/server";
import { assertSameOrigin, requireUser, requireWorkspaceOwner } from "../../../../../src/modules/auth/authorization";
import { authErrorResponse } from "../../../../../src/modules/auth/http";
import {
  createJob,
  listJobs,
} from "../../../../../src/modules/job/job-service";
import { WorkspaceNotFoundError } from "../../../../../src/modules/workspace/workspace-service";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ workspaceId: string }>;
};

function isOptionalString(value: unknown): value is string | null | undefined {
  return value === undefined || value === null || typeof value === "string";
}

export async function GET(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  try {
    const user = await requireUser();
    const { workspaceId } = await context.params;
    await requireWorkspaceOwner(user.id, workspaceId);
    const search = new URL(request.url).searchParams.get("search") ?? "";
    return NextResponse.json({ jobs: await listJobs(workspaceId, search) });
  } catch (error: unknown) {
    const response = authErrorResponse(error);
    if (response) return response;
    if (error instanceof WorkspaceNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    throw error;
  }
}

export async function POST(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const { workspaceId } = await context.params;
    await requireWorkspaceOwner(user.id, workspaceId);
    const body = (await request.json()) as Record<string, unknown>;
    if (
      typeof body.companyName !== "string" ||
      typeof body.jobName !== "string" ||
      typeof body.baseLocation !== "string" ||
      !isOptionalString(body.jobUrl) ||
      !isOptionalString(body.remark)
    ) {
      return NextResponse.json({ error: "岗位信息格式无效。" }, { status: 400 });
    }
    const result = await createJob(workspaceId, {
      companyName: body.companyName,
      jobName: body.jobName,
      baseLocation: body.baseLocation,
      jobUrl: body.jobUrl,
      remark: body.remark,
    });
    return NextResponse.json(result, { status: 201 });
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
